// File: Adminwork/QuestionUpload.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import api from '../services/api';
import { FaFileAlt, FaTimes } from 'react-icons/fa';
import styles from '../Astyles/adminQuestion.module.css';
import crudStyles from '../Astyles/AdminCrudTwoCol.module.css';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { useLoading } from '../context/LoadingContext';
import { useAuth } from '../context/AuthContext';
import GraduationCapLoader from './GraduationCapLoader';
import { useTranslation } from 'react-i18next';

const AUDIENCE = {
  GENERAL: 'GENERAL',
  SINGLE: 'SINGLE',
  MULTIPLE: 'MULTIPLE',
};

const PROGRAM_OPTIONS = ['HND', 'BTS', 'LICENCE', 'BACHELOR', 'MASTERS', 'MASTER'];

const PAPER_TYPES = [
  { label: 'HND Papers', value: 'hnd' },
  { label: 'CA Papers', value: 'ca' },
  { label: 'Exam Papers', value: 'exam' },
  { label: 'Mock Papers', value: 'mock' },
];

const REGIONS = ['Adamawa','Centre','East','Far North','Littoral','North','Northwest','South','Southwest','West'];

const PAGE_SIZE = 7;

const QuestionUpload = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [departments, setDepartments] = useState([]);
  const [program, setProgram] = useState(String(user?.program || 'HND').toUpperCase());
  const [paperType, setPaperType] = useState('hnd');
  const [audience, setAudience] = useState(AUDIENCE.SINGLE);

  const [papers, setPapers] = useState([]);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);

  // form state
  const [singleDept, setSingleDept] = useState('');
  const [multiDepts, setMultiDepts] = useState([]);
  const [paperTitle, setPaperTitle] = useState('');
  const [hndYear, setHndYear] = useState('');
  const [academicSession, setAcademicSession] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [region, setRegion] = useState('');
  const [semester, setSemester] = useState('');
  const [institutionUrl, setInstitutionUrl] = useState('');
  const [paperFile, setPaperFile] = useState(null);
  const [numLinks, setNumLinks] = useState(0);
  const [studyLinks, setStudyLinks] = useState([]);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const notifyRef = useRef(null);

  // loading context
  const { loading, startLoading, stopLoading } = useLoading();

  const fetchPapers = useCallback(async () => {
    try {
      startLoading();
      const { data } = await api.get(`/admin/get-question-papers?program=${encodeURIComponent(program)}&paper_type=${encodeURIComponent(paperType)}`);
      setPapers(Array.isArray(data?.papers) ? data.papers : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to load question papers. Check connection and try again.'), 'error');
    } finally {
      stopLoading();
    }
  }, [program, paperType, startLoading, stopLoading]);

  /** Fetch departments - mount only, no retry on failure */
  useEffect(() => {
    let cancelled = false;
    const fetchDepartments = async () => {
      try {
        startLoading();
        const { data } = await api.get(`/admin/departments?program=${encodeURIComponent(program)}`);
        if (!cancelled) setDepartments(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, 'Could not load departments. Check connection and try again.'), 'error');
      } finally {
        stopLoading();
      }
    };
    fetchDepartments();
    return () => { cancelled = true; };
  }, [program, startLoading, stopLoading]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  useEffect(() => {
    // whenever paperType changes, re-fetch papers
    fetchPapers();
  }, [paperType, fetchPapers]);

  /** Reset department selections when audience changes */
  useEffect(() => {
    if (audience === AUDIENCE.GENERAL) {
      setSingleDept('');
      setMultiDepts([]);
    } else if (audience === AUDIENCE.SINGLE) {
      setMultiDepts([]);
    } else if (audience === AUDIENCE.MULTIPLE) {
      setSingleDept('');
    }
  }, [audience]);

  /** Close notify modal on outside click */
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (notifyModalOpen && notifyRef.current && !notifyRef.current.contains(e.target)) {
        setNotifyModalOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [notifyModalOpen]);

  /** Handlers */
  const handleLinkCountChange = useCallback((e) => {
    const count = Math.min(Math.max(Number(e.target.value) || 0, 0), 5);
    setNumLinks(count);
    setStudyLinks(Array(count).fill(''));
  }, []);

  const handleLinkChange = useCallback((idx, val) => {
    setStudyLinks((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }, []);

  const handleFilePick = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isPdf = String(file.name || '').toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        showToast('Question paper must be a PDF file only.', 'warning');
        e.target.value = '';
        setPaperFile(null);
        return;
      }
      setPaperFile(file);
    }
  }, []);

  /** Validation */
  const validate = useMemo(() => {
    if (!paperTitle.trim() || !hndYear.trim()) return false;
    if (paperType === 'hnd' && !uploadedBy.trim()) return false;
    if (paperType !== 'hnd' && (!institutionName.trim() || !region.trim() || !semester.trim())) return false;
    if (!activeId && !paperFile) return false;
    if (audience === AUDIENCE.SINGLE && !singleDept) return false;
    if (audience === AUDIENCE.MULTIPLE && multiDepts.length === 0) return false;
    if (studyLinks.some((link) => link && !/^https?:\/\/.+/i.test(link))) return false;
    return true;
  }, [paperTitle, hndYear, uploadedBy, paperFile, audience, singleDept, multiDepts, studyLinks, activeId, paperType, institutionName, region, semester]);

  const clearForm = () => {
    setActiveId(null);
    setAudience(AUDIENCE.SINGLE);
    setSingleDept('');
    setMultiDepts([]);
    setPaperTitle('');
    setHndYear('');
    setAcademicSession('');
    setUploadedBy('');
    setPaperFile(null);
    setNumLinks(0);
    setStudyLinks([]);
  };

  const selectForEdit = (p) => {
    const id = p?.qp_id || p?._id;
    if (!id) return;
    setActiveId(String(id));
    setProgram(String(p.program || 'HND').toUpperCase());
    setAudience(p.audience || AUDIENCE.SINGLE);
    const deptIds = Array.isArray(p.departments) ? p.departments.map((d) => d.dpt_id).filter(Boolean) : [];
    if ((p.audience || '').toUpperCase() === AUDIENCE.SINGLE) {
      setSingleDept(deptIds[0] || '');
      setMultiDepts([]);
    } else if ((p.audience || '').toUpperCase() === AUDIENCE.MULTIPLE) {
      setSingleDept('');
      setMultiDepts(deptIds);
    } else {
      setSingleDept('');
      setMultiDepts([]);
    }
    setPaperTitle(p.paper_title || '');
    setHndYear(String(p.hnd_year || ''));
    setUploadedBy(p.uploaded_by || '');
    setPaperType(p.paper_type || 'hnd');
    setInstitutionName(p.institution_name || '');
    setRegion(p.region || '');
    setSemester(p.semester || '');
    setInstitutionUrl(p.institution_url || '');
    setPaperFile(null);
    const links = (p.more_info || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    setNumLinks(links.length);
    setStudyLinks(links);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const doUpdate = useCallback(async () => {
    if (!activeId) return;
    try {
      startLoading();
      const payload = {
        audience,
        dpt_id: audience === AUDIENCE.SINGLE ? singleDept : undefined,
        dpt_ids: audience === AUDIENCE.MULTIPLE ? JSON.stringify(multiDepts) : undefined,
        paperTitle: paperTitle.trim(),
        hndYear: hndYear.trim(),
        academic_session: academicSession.trim(),
        uploaded_by: uploadedBy.trim(),
        program,
        study_links: JSON.stringify(studyLinks.filter(Boolean)),
        paper_type: paperType,
        institution_name: institutionName,
        region,
        semester,
        institution_url: institutionUrl,
      };

      const { data } = await api.put(`/admin/question-papers/${activeId}`, payload);
      if (data?.success) {
        showToast(data?.message || 'Question paper updated successfully.', 'success');
        await fetchPapers();
        clearForm();
      } else {
        showToast(data?.message || 'Update failed', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Update failed. Please try again.'), 'error');
    } finally {
      stopLoading();
    }
  }, [activeId, academicSession, audience, fetchPapers, hndYear, multiDepts, paperTitle, program, singleDept, startLoading, stopLoading, studyLinks, uploadedBy, paperType, institutionName, region, semester, institutionUrl]);

  const openNotify = useCallback(
    (e) => {
      e.preventDefault();
      if (!validate) {
        showToast('Please fill all required fields correctly.', 'warning');
        return;
      }
      if (activeId) {
        doUpdate();
        return;
      }
      setNotifyModalOpen(true);
    },
    [validate, activeId, doUpdate]
  );

  const doDelete = async (p, e) => {
    if (e) e.stopPropagation();
    const id = p?.qp_id || p?._id;
    if (!id) return;
    const ok = window.confirm(`Delete question paper "${p.paper_title}"? This will remove the uploaded file too.`);
    if (!ok) return;
    try {
      startLoading();
      const { data } = await api.delete(`/admin/question-papers/${id}`);
      if (data?.success) {
        showToast(data?.message || 'Question paper deleted.', 'success');
        if (String(activeId) === String(id)) clearForm();
        await fetchPapers();
      } else {
        showToast(data?.message || 'Delete failed', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Delete failed. Please try again.'), 'error');
    } finally {
      stopLoading();
    }
  };

  /** Upload logic */
  const doUpload = useCallback(
    async (notify) => {
      try {
        startLoading();
        const fd = new FormData();
        fd.append('audience', audience);
        if (audience === AUDIENCE.SINGLE) fd.append('dpt_id', singleDept);
        if (audience === AUDIENCE.MULTIPLE) fd.append('dpt_ids', JSON.stringify(multiDepts));
        fd.append('paperTitle', paperTitle.trim());
        fd.append('hndYear', hndYear.trim());
        fd.append('academic_session', academicSession.trim());
        if (paperType === 'hnd') fd.append('uploaded_by', uploadedBy.trim());
        fd.append('paper_type', paperType);
        if (paperType !== 'hnd') {
          fd.append('institution_name', institutionName);
          fd.append('region', region);
          fd.append('semester', semester);
          if (institutionUrl) fd.append('institution_url', institutionUrl);
        }
        fd.append('program', program);
        fd.append('paperFile', paperFile);
        if (paperType === 'hnd') fd.append('study_links', JSON.stringify(studyLinks.filter(Boolean)));
        fd.append('notify', notify ? 'true' : 'false');

        const { data } = await api.post('/admin/upload-paper', fd);

        if (data?.success) {
          showToast('Uploaded successfully.', 'success');
          await fetchPapers();
          clearForm();
        } else {
          showToast(data?.message || 'Upload failed', 'error');
        }
      } catch (err) {
        showToast(getErrorMessage(err, 'Server error during upload. Please try again.'), 'error');
      } finally {
        stopLoading();
        setNotifyModalOpen(false);
      }
    },
    [academicSession, audience, fetchPapers, hndYear, multiDepts, paperFile, paperTitle, program, singleDept, startLoading, stopLoading, studyLinks, uploadedBy, paperType, institutionName, region, semester, institutionUrl]
  );

  const filteredPapers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return papers;
    return papers.filter((p) => {
      const deptText = Array.isArray(p.departments) ? p.departments.map((d) => d.dpt_name).join(' ') : '';
      const hay = [p.paper_title, p.hnd_year, p.uploaded_by, p.audience, p.more_info, deptText]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [papers, search]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredPapers.length / PAGE_SIZE)),
    [filteredPapers.length]
  );

  const pagedPapers = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filteredPapers.slice(start, start + PAGE_SIZE);
  }, [filteredPapers, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
  }, [search, program]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  return (
    <div className={crudStyles.page}>
      <Helmet>
        <title>Admin — Upload Question Papers</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      {loading && <GraduationCapLoader fullscreen label="Uploading or fetching materials… Please wait" />}

      <div className={crudStyles.grid}>
        <section className={crudStyles.card}>
          <div className={crudStyles.cardHeader}>
            <h2 className={crudStyles.cardTitle}>{activeId ? t('uploads.questionUpdateTitle') : t('uploads.questionUploadTitle')}</h2>
            {activeId && (
              <button type="button" className={`${crudStyles.btn} ${crudStyles.btnGhost}`} onClick={clearForm}>
                Cancel
              </button>
            )}
          </div>

          <form className={styles.form} onSubmit={openNotify}>
            <div className={styles.field}>
              <label>
                {t('uploads.reportProgramLabel')} <span>*</span>
              </label>
              <select value={program} onChange={(e) => setProgram(e.target.value)}>
                {PROGRAM_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            {/* Audience Selector */}
            <div className={styles.field}>
              <label>
                Audience <span>*</span>
              </label>
              <div className={styles.segment}>
                {Object.values(AUDIENCE).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`${styles.segmentBtn} ${audience === option ? styles.active : ''}`}
                    onClick={() => setAudience(option)}
                  >
                    {option === AUDIENCE.GENERAL && 'General (All Departments)'}
                    {option === AUDIENCE.SINGLE && 'Single Department'}
                    {option === AUDIENCE.MULTIPLE && 'Multiple Departments'}
                  </button>
                ))}
              </div>
            </div>

            {/* Single Department */}
            {audience === AUDIENCE.SINGLE && (
              <div className={styles.field}>
                <label>
                  Department <span>*</span>
                </label>
                <select value={singleDept} onChange={(e) => setSingleDept(e.target.value)} required>
                  <option value="">-- Select Department --</option>
                  {departments.map((d) => (
                    <option key={d.dpt_id} value={d.dpt_id}>
                      {d.department_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Multiple Departments */}
            {audience === AUDIENCE.MULTIPLE && (
              <div className={styles.field}>
                <label>
                  Departments <span>*</span>
                </label>
                <select
                  multiple
                  value={multiDepts}
                  onChange={(e) => setMultiDepts(Array.from(e.target.selectedOptions, (o) => o.value))}
                  className={styles.multi}
                  required
                >
                  {departments.map((d) => (
                    <option key={d.dpt_id} value={d.dpt_id}>
                      {d.department_name}
                    </option>
                  ))}
                </select>
                <div className={styles.helper}>Hold Ctrl/Cmd and click to select multiple</div>
              </div>
            )}

            {/* Paper Title */}
            <div className={styles.field}>
              <label>
                Paper Title <span>*</span>
              </label>
              <input type="text" value={paperTitle} onChange={(e) => setPaperTitle(e.target.value)} required />
            </div>

            {/* HND Year */}
            <div className={styles.field}>
              <label>
                HND Year <span>*</span>
              </label>
              <input type="text" value={hndYear} onChange={(e) => setHndYear(e.target.value)} required />
            </div>

            <div className={styles.field}>
              <label>Academic Session</label>
              <input type="text" value={academicSession} onChange={(e) => setAcademicSession(e.target.value)} placeholder="e.g. 2025/2026" />
            </div>

            {/* Paper Type Selector */}
            <div className={styles.field}>
              <label>Paper Type <span>*</span></label>
              <select value={paperType} onChange={(e) => setPaperType(e.target.value)}>
                {PAPER_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>

            {/* HND-specific fields */}
            {paperType === 'hnd' && (
              <>
                <div className={styles.field}>
                  <label>
                    Uploaded By (Admin Name/Email) <span>*</span>
                  </label>
                  <input
                    type="text"
                    value={uploadedBy}
                    onChange={(e) => setUploadedBy(e.target.value)}
                    placeholder="Your name or email"
                    required
                  />
                </div>

                {/* Study Links */}
                <div className={styles.field}>
                  <label>Number of Study Links (Max 5)</label>
                  <input type="number" min="0" max="5" value={numLinks} onChange={handleLinkCountChange} />
                </div>

                {numLinks > 0 && (
                  <div className={styles.linkGrid}>
                    {studyLinks.map((link, i) => (
                      <div key={`link-${i}`} className={styles.linkTile}>
                        <input
                          type="url"
                          placeholder={`Study Link ${i + 1}`}
                          value={link}
                          onChange={(e) => handleLinkChange(i, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Non-HND fields */}
            {paperType !== 'hnd' && (
              <>
                <div className={styles.field}>
                  <label>Institution Name <span>*</span></label>
                  <input type="text" value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} required />
                </div>

                <div className={styles.field}>
                  <label>Region <span>*</span></label>
                  <select value={region} onChange={(e) => setRegion(e.target.value)}>
                    <option value="">-- Select region --</option>
                    {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div className={styles.field}>
                  <label>Semester <span>*</span></label>
                  <select value={semester} onChange={(e) => setSemester(e.target.value)}>
                    <option value="">-- Select semester --</option>
                    <option value="1">Semester 1</option>
                    <option value="2">Semester 2</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>Institution URL (optional)</label>
                  <input type="url" value={institutionUrl} onChange={(e) => setInstitutionUrl(e.target.value)} />
                </div>
              </>
            )}

            {/* File Upload */}
            <div className={styles.field}>
              <label>
                Upload Full Paper (PDF only) <span>*</span>
              </label>
              <div
                className={`${styles.tile} ${paperFile ? styles.filled : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => !activeId && document.getElementById('paperInput').click()}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !activeId) { e.preventDefault(); document.getElementById('paperInput').click(); } }}
                title={activeId ? 'File replacement is not available during update.' : 'Click to select file'}
              >
                <input
                  id="paperInput"
                  type="file"
                  hidden
                  accept=".pdf"
                  onChange={handleFilePick}
                  disabled={Boolean(activeId)}
                />
                {paperFile ? (
                  <span className={styles.filename}>{paperFile.name}</span>
                ) : (
                  <>
                    <FaFileAlt className={styles.placeholderIcon} />
                    <span>{activeId ? 'File replacement disabled on update' : 'Click to select file'}</span>
                  </>
                )}
              </div>
            </div>

            {/* Study Links */}
            <div className={styles.field}>
              <label>Number of Study Links (Max 5)</label>
              <input type="number" min="0" max="5" value={numLinks} onChange={handleLinkCountChange} />
            </div>

            {numLinks > 0 && (
              <div className={styles.linkGrid}>
                {studyLinks.map((link, i) => (
                  <div key={`link-${i}`} className={styles.linkTile}>
                    <input
                      type="url"
                      placeholder={`Study Link ${i + 1}`}
                      value={link}
                      onChange={(e) => handleLinkChange(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            <button type="submit" className={styles.submitBtn}>
              {activeId ? 'Update Paper' : 'Upload Paper'}
            </button>
          </form>
        </section>

        <section className={`${crudStyles.card} ${crudStyles.stickyPanel}`}>
          <div className={crudStyles.cardHeader}>
            <h3 className={crudStyles.cardTitle}>Existing { (PAPER_TYPES.find(pt => pt.value === paperType) || { label: 'HND Papers' }).label }</h3>
            <div style={{ marginLeft: 'auto' }}>
              <select value={paperType} onChange={(e) => setPaperType(e.target.value)}>
                {PAPER_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </div>
          </div>

          <input
            className={crudStyles.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, year, uploader, audience…"
          />

          <div className={crudStyles.listTools}>
            <span className={crudStyles.resultsCount}>{filteredPapers.length} total</span>
            {filteredPapers.length > PAGE_SIZE && (
              <label className={crudStyles.pageSelectWrap}>
                <span>View more</span>
                <select
                  className={crudStyles.pageSelect}
                  value={pageIndex}
                  onChange={(e) => setPageIndex(Number(e.target.value))}
                >
                  {Array.from({ length: totalPages }, (_, idx) => {
                    const start = idx * PAGE_SIZE + 1;
                    const end = Math.min((idx + 1) * PAGE_SIZE, filteredPapers.length);
                    return (
                      <option key={`paper-page-${idx}`} value={idx}>
                        {start}-{end}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>

          <div className={`${crudStyles.list} ${crudStyles.scrollList}`}>
            {filteredPapers.length === 0 ? (
              <div className={crudStyles.item}>No question papers found.</div>
            ) : (
              pagedPapers.map((p) => {
                const id = p.qp_id || p._id;
                const deptLabel = Array.isArray(p.departments) && p.departments.length
                  ? p.departments.map((d) => d.dpt_name).filter(Boolean).join(', ')
                  : 'General';
                return (
                  <div
                    key={String(id)}
                    className={`${crudStyles.item} ${String(activeId) === String(id) ? crudStyles.itemActive : ''}`}
                    onClick={() => selectForEdit(p)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectForEdit(p); } }}
                    title="Click to edit"
                  >
                    <div className={crudStyles.itemTop}>
                      <div>
                        <div className={crudStyles.itemTitle}>{p.paper_title}</div>
                        <div className={crudStyles.itemMeta}>
                          Program: {String(p.program || 'HND').toUpperCase()} • Year: {p.hnd_year} • Audience: {p.audience}
                          <br />
                          Depts: {deptLabel}
                          {p.paper_type && p.paper_type !== 'hnd' && (
                            <>
                              <br />
                              Institution: {p.institution_name || '—'} • Region: {p.region || '—'} • Semester: {p.semester || '—'}
                            </>
                          )}
                        </div>
                      </div>

                      <div className={crudStyles.actions}>
                        <button
                          type="button"
                          className={`${crudStyles.btn} ${crudStyles.btnDanger}`}
                          onClick={(e) => doDelete(p, e)}
                          title="Delete paper"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Notify Modal */}
      {notifyModalOpen && (
        <div className={styles.popup} role="dialog" aria-modal="true">
          <div className={styles.popupBox} ref={notifyRef}>
            <button
              className={styles.closeButton}
              onClick={() => setNotifyModalOpen(false)}
              aria-label="Close"
            >
              <FaTimes />
            </button>
            <h3>Notify candidates?</h3>
            <p>
              {audience === AUDIENCE.GENERAL && 'This will notify all candidates across all departments.'}
              {audience === AUDIENCE.SINGLE && 'This will notify candidates in the selected department.'}
              {audience === AUDIENCE.MULTIPLE && 'This will notify candidates in the selected departments.'}
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button className={styles.notifyBtn} onClick={() => doUpload(true)}>
                Yes, Notify
              </button>
              <button className={styles.noNotifyBtn} onClick={() => doUpload(false)}>
                No, Just Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionUpload;
