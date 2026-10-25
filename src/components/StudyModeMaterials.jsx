import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createWorker } from 'tesseract.js';
import { pdfjs } from 'react-pdf';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import formatStudyOcrDraft from '../utility/formatStudyOcrDraft';
import styles from '../Astyles/internshipTopicsAdmin.module.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;

const EXAMPLE_TEXT = `Q1- What is 2 + 2?
A- 3
B- 4
C- 5
D- 6
CORRECT ANSWER: B (4)
Reason: 2 + 2 is equal to 4.

Q2- Example question two?
A- Option A
B- Option B
C- Option C
D- Option D
CORRECT ANSWER: A
Reason: Explain why option A is correct.`;

const StudyModeMaterials = () => {
  const [program, setProgram] = useState('');
  const [programs, setPrograms] = useState([]);
  const [papers, setPapers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [questionPaperId, setQuestionPaperId] = useState('');
  const [numberOfQuestions, setNumberOfQuestions] = useState(20);
  const [mcqText, setMcqText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [extractionSummary, setExtractionSummary] = useState('');
  const [extractionProgress, setExtractionProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadPrograms = async () => {
      try {
        const { data } = await api.get('/programs');
        if (cancelled) return;
        const activePrograms = Array.isArray(data?.programs) ? data.programs : [];
        setPrograms(activePrograms);
        setProgram((previous) => (
          activePrograms.some((item) => item.code === previous)
            ? previous
            : activePrograms.find((item) => item.code === 'HND')?.code || activePrograms[0]?.code || ''
        ));
      } catch (err) {
        if (!cancelled) {
          showToast(getErrorMessage(err, 'Failed to load active programs.'), 'error');
          setPrograms([]);
        }
      }
    };
    loadPrograms();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPapers = useCallback(async () => {
    const { data } = await api.get(`/admin/get-question-papers?program=${encodeURIComponent(program)}`);
    setPapers(Array.isArray(data?.papers) ? data.papers : []);
  }, [program]);

  const loadMaterials = useCallback(async () => {
    const { data } = await api.get(`/ai/study-materials?program=${encodeURIComponent(program)}`);
    setMaterials(Array.isArray(data?.materials) ? data.materials : []);
  }, [program]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadPapers(), loadMaterials()]);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load study mode materials.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [loadMaterials, loadPapers]);

  useEffect(() => {
    if (!program) {
      setPapers([]);
      setMaterials([]);
      setLoading(false);
      return undefined;
    }
    loadAll();
    return undefined;
  }, [loadAll, program]);

  const selectedPaper = useMemo(
    () => papers.find((paper) => String(paper.qp_id) === String(questionPaperId)) || null,
    [papers, questionPaperId]
  );

  const extractStudyDraft = async () => {
    if (!selectedPaper || extracting || saving) return;
    setExtracting(true);
    setExtractionSummary('');
    setExtractionStatus('Loading the selected paper...');
    setExtractionProgress(3);
    setMcqText('');

    let worker = null;
    let pdfDocument = null;
    try {
      const { data } = await api.get(
        `/ai/study-materials/${encodeURIComponent(selectedPaper.qp_id)}/source`,
        { responseType: 'arraybuffer', timeout: 120000 }
      );
      pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
      setExtractionProgress(8);
      if (pdfDocument.numPages > 30) {
        throw new Error('OCR is limited to 30 pages per paper. Use a shorter paper or paste the MCQs manually.');
      }

      const pageTexts = [];
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        setExtractionStatus(`Reading page ${pageNumber} of ${pdfDocument.numPages}...`);
        setExtractionProgress(Math.round(8 + ((pageNumber - 1) / pdfDocument.numPages) * 87));
        const page = await pdfDocument.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageLines = [];
        let currentLine = '';
        let previousY = null;
        textContent.items.forEach((item) => {
          const itemText = String(item.str || '').trim();
          if (!itemText) return;
          const y = Array.isArray(item.transform) ? item.transform[5] : null;
          if (currentLine && y !== null && previousY !== null && Math.abs(y - previousY) > 2) {
            pageLines.push(currentLine);
            currentLine = '';
          }
          currentLine = `${currentLine} ${itemText}`.trim();
          if (item.hasEOL) {
            pageLines.push(currentLine);
            currentLine = '';
          }
          previousY = y;
        });
        if (currentLine) pageLines.push(currentLine);
        const pageText = pageLines.join('\n').replace(/[ \t]+/g, ' ').trim();

        if (pageText.length >= 80) {
          pageTexts.push(pageText);
          setExtractionProgress(Math.round(8 + (pageNumber / pdfDocument.numPages) * 87));
          continue;
        }

        if (!worker) {
          setExtractionStatus('Starting local OCR (English and French)...');
          worker = await createWorker('eng+fra', 1, {
            logger: (message) => {
              if (message.status === 'recognizing text') {
                const progress = Math.max(0, Math.min(1, Number(message.progress) || 0));
                const overallProgress = Math.round(
                  8 + ((pageNumber - 1 + progress) / pdfDocument.numPages) * 87
                );
                setExtractionProgress(overallProgress);
                setExtractionStatus(`Recognizing text on page ${pageNumber} of ${pdfDocument.numPages}...`);
              }
            },
          });
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 3000 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not prepare a page for OCR.');
        await page.render({ canvasContext: context, viewport }).promise;
        const { data: ocrResult } = await worker.recognize(canvas);
        pageTexts.push(String(ocrResult?.text || '').trim());
        canvas.width = 0;
        canvas.height = 0;
        setExtractionProgress(Math.round(8 + (pageNumber / pdfDocument.numPages) * 87));
      }

      const draft = formatStudyOcrDraft(pageTexts.join('\n'));
      setExtractionProgress(100);
      setMcqText(draft.draftText);
      const pageCompletenessWarning = draft.printedPageCount > pdfDocument.numPages
        ? ` The paper's page labels indicate ${draft.printedPageCount} pages, but this PDF contains ${pdfDocument.numPages}; verify that the scan is complete.`
        : '';
      if (draft.detectedQuestionCount > 0) {
        setNumberOfQuestions(draft.detectedQuestionCount);
        setExtractionSummary(
          `${draft.detectedQuestionCount} MCQ(s) found in an explicitly labeled objective section; ${draft.incompleteQuestionCount} incomplete question block(s) excluded; ${draft.missingAnswerCount} answer key(s) still need confirmation.${pageCompletenessWarning}`
        );
        setExtractionStatus('Extraction complete. Only multiple-choice questions from the labeled section were added; review every item before saving.');
      } else if (draft.mcqSectionFound && draft.incompleteQuestionCount > 0) {
        setExtractionSummary(
          `An MCQ section was found, but ${draft.incompleteQuestionCount} question block(s) were missing one or more options. No incomplete items were added.${pageCompletenessWarning}`
        );
        setExtractionStatus('No complete MCQs were found in the labeled section. Check the scan or add the questions manually.');
      } else if (draft.mcqSectionFound) {
        setExtractionSummary(`An MCQ section heading was found, but no numbered questions with answer options were detected.${pageCompletenessWarning}`);
        setExtractionStatus('No MCQs were found in the labeled section. Check the scan or add the questions manually.');
      } else {
        setExtractionSummary(`No multiple-choice or objective section heading was found. No questions were added.${pageCompletenessWarning}`);
        setExtractionStatus('Extraction complete. Structural questions were not included; confirm the paper has a clearly labeled MCQ section.');
      }
    } catch (err) {
      setExtractionStatus('');
      showToast(err?.message || getErrorMessage(err, 'Could not extract a draft from this paper.'), 'error');
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          console.error('[Study Mode Materials] OCR worker cleanup failed:', error);
        }
      }
      if (pdfDocument) {
        try {
          await pdfDocument.destroy();
        } catch (error) {
          console.error('[Study Mode Materials] PDF cleanup failed:', error);
        }
      }
      setExtracting(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!questionPaperId) {
      showToast('Select a question paper first.', 'warning');
      return;
    }
    if (!mcqText.trim()) {
      showToast('Paste MCQ text in the required format.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        questionPaperId,
        numberOfQuestions: Number(numberOfQuestions || 0),
        mcqText,
      };
      await api.post('/ai/study-materials', payload);
      showToast('Study mode material created successfully.', 'success');
      setMcqText('');
      setNumberOfQuestions(20);
      await loadMaterials();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to create study material.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Study Mode Materials</h1>
      <p className={styles.subtitle}>
        Upload MCQ study content linked to an existing question paper. Candidates choose how many questions to answer, from 5 up to the number available.
      </p>
      <p className={styles.subtitle}>
        PDF text extraction and OCR run locally in this browser. OCR creates a draft only; verify each question and enter or confirm its correct answer before saving.
      </p>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Program</span>
            <select value={program} onChange={(e) => {
              setProgram(e.target.value);
              setQuestionPaperId('');
              setMcqText('');
              setNumberOfQuestions(20);
              setExtractionStatus('');
              setExtractionSummary('');
            }}>
              {programs.map((item) => (
                <option key={item.code} value={item.code}>{item.name} ({item.abbreviation})</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Question paper</span>
            <select value={questionPaperId} onChange={(e) => {
              setQuestionPaperId(e.target.value);
              setMcqText('');
              setNumberOfQuestions(20);
              setExtractionStatus('');
              setExtractionSummary('');
            }}>
              <option value="">Select question paper</option>
              {papers.map((paper) => (
                <option key={paper.qp_id} value={paper.qp_id}>
                  {paper.paper_title} ({paper.hnd_year})
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedPaper ? (
          <div className={styles.meta}>
            <span>Selected: {selectedPaper.paper_title}</span>
            <span>Year: {selectedPaper.hnd_year}</span>
            <span>Audience: {selectedPaper.audience}</span>
          </div>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={extractStudyDraft}
            disabled={!selectedPaper || extracting || saving}
          >
            {extracting ? 'Extracting draft...' : 'Extract draft from paper (OCR)'}
          </button>
        </div>
        {extractionStatus ? <p className={styles.subtitle} role="status">{extractionStatus}</p> : null}
        {extractionSummary ? (
          <p className={styles.meta}>
            {extractionSummary}
          </p>
        ) : null}
        {extracting ? (
          <div className={styles.extractionProgress} role="status">
            <div className={styles.extractionProgressHeader}>
              <span className={styles.extractionPulse} aria-hidden="true" />
              <div>
                <strong>{extractionStatus}</strong>
                <span>OCR runs locally in this browser. First use may download English/French recognition models.</span>
              </div>
              <strong className={styles.extractionPercent}>{extractionProgress}%</strong>
            </div>
            <div
              className={styles.extractionTrack}
              role="progressbar"
              aria-label="Paper extraction progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={extractionProgress}
            >
              <span style={{ width: `${extractionProgress}%` }} />
            </div>
          </div>
        ) : null}

        <label className={styles.field}>
          <span>Number of questions in the draft</span>
          <input
            type="number"
            min="1"
            value={numberOfQuestions}
            onChange={(e) => setNumberOfQuestions(e.target.value)}
            placeholder="e.g. 40"
          />
        </label>

        <label className={styles.field}>
          <span>Review/edit MCQ text (required format)</span>
          <textarea
            rows={16}
            value={mcqText}
            onChange={(e) => setMcqText(e.target.value)}
            placeholder={EXAMPLE_TEXT}
          />
        </label>

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn} disabled={saving || extracting || !program}>
            {saving ? 'Saving...' : 'Review and Create Study Material'}
          </button>
        </div>
      </form>

      <section className={styles.tableWrap}>
        <h2>Existing Study Materials ({program})</h2>
        {loading ? <p>Loading...</p> : null}
        {!loading && materials.length === 0 ? <p>No study materials yet.</p> : null}
        {!loading && materials.length > 0 ? (
          <div className={styles.topicList}>
            {materials.map((item) => (
              <article key={item.materialId} className={styles.topicRow}>
                <div>
                  <h3>{item.paperTitle}</h3>
                  <div className={styles.meta}>
                    <span>Questions: {item.questionCount}</span>
                    <span>Created by: {item.createdBy}</span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default StudyModeMaterials;
