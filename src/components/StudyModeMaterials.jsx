import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/internshipTopicsAdmin.module.css';

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
  const [program, setProgram] = useState('HND');
  const [papers, setPapers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [questionPaperId, setQuestionPaperId] = useState('');
  const [numberOfQuestions, setNumberOfQuestions] = useState(20);
  const [mcqText, setMcqText] = useState('');

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
    loadAll();
  }, [loadAll]);

  const selectedPaper = useMemo(
    () => papers.find((paper) => String(paper.qp_id) === String(questionPaperId)) || null,
    [papers, questionPaperId]
  );

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
        Upload MCQ study content linked to an existing question paper. Candidates will answer 20 questions in Study Mode.
      </p>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Program</span>
            <select value={program} onChange={(e) => { setProgram(e.target.value); setQuestionPaperId(''); }}>
              <option value="HND">HND</option>
              <option value="BTS">BTS</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Question paper</span>
            <select value={questionPaperId} onChange={(e) => setQuestionPaperId(e.target.value)}>
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

        <label className={styles.field}>
          <span>Number of questions in pasted text</span>
          <input
            type="number"
            min="1"
            value={numberOfQuestions}
            onChange={(e) => setNumberOfQuestions(e.target.value)}
            placeholder="e.g. 40"
          />
        </label>

        <label className={styles.field}>
          <span>MCQ Text (required format)</span>
          <textarea
            rows={16}
            value={mcqText}
            onChange={(e) => setMcqText(e.target.value)}
            placeholder={EXAMPLE_TEXT}
          />
        </label>

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>
            {saving ? 'Saving...' : 'Create Study Material'}
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
