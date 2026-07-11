import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/reportUpload.module.css';
import crudStyles from '../Astyles/AdminCrudTwoCol.module.css';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { useLoading } from '../context/LoadingContext';
import { useAuth } from '../context/AuthContext';
import GraduationCapLoader from './GraduationCapLoader';

const AUDIENCE = {
  SINGLE: 'SINGLE',
  MULTIPLE: 'MULTIPLE',
  GENERAL: 'GENERAL',
};
const PROGRAM_OPTIONS = ['HND', 'BTS', 'LICENCE', 'BACHELOR', 'MASTERS', 'MASTER'];
const PAGE_SIZE = 7;

const ReportWritingGuide = () => {
  const { loading, startLoading, stopLoading } = useLoading();
  const { user } = useAuth();
  const [program, setProgram] = useState(String(user?.program || 'HND').toUpperCase());
  const [audience, setAudience] = useState(AUDIENCE.SINGLE);
  const [departments, setDepartments] = useState([]);
  const [dptId, setDptId] = useState('');
  const [dptIds, setDptIds] = useState([]);
  const [guideFile, setGuideFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [guides, setGuides] = useState([]);
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [activeGuideId, setActiveGuideId] = useState(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        startLoading();
        const res = await api.get(`/admin/departments?program=${encodeURIComponent(program)}`);
        const arr = Array.isArray(res.data) ? res.data : [];
        if (!ignore) setDepartments(arr);
      } catch (err) {
        if (!ignore) showToast(getErrorMessage(err, 'Unable to load departments. Please try again.'), 'error');
      } finally {
        if (!ignore) stopLoading();
      }
    })();
    return () => { ignore = true; };
  }, [program, startLoading, stopLoading]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        startLoading();
        const res = await api.get(`/admin/reports/guides/list?program=${encodeURIComponent(program)}`);
        if (res.data?.success) {
          if (!ignore) setGuides(Array.isArray(res.data.reports) ? res.data.reports : []);
        } else {
          if (!ignore) showToast(res.data?.message || 'Failed to fetch guide list.', 'error');
        }
      } catch (err) {
        if (!ignore) showToast(getErrorMessage(err, 'Unable to load report guides.'), 'error');
      } finally {
        if (!ignore) stopLoading();
      }
    })();
    return () => { ignore = true; };
  }, [program, startLoading, stopLoading]);

  useEffect(() => {
    if (audience === AUDIENCE.GENERAL) {
      setDptId('');
      setDptIds([]);
    } else if (audience === AUDIENCE.SINGLE) {
      setDptIds([]);
    } else if (audience === AUDIENCE.MULTIPLE) {
      setDptId('');
    }
  }, [audience]);

  const filteredGuides = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) return guides;
    return guides.filter((guide) => {
      return [guide.title, guide.writer_names, guide.writer_email, guide.description, guide.keywords, guide.audience, guide.program]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [guides, search]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredGuides.length / PAGE_SIZE));
  }, [filteredGuides.length]);

  const pagedGuides = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filteredGuides.slice(start, start + PAGE_SIZE);
  }, [filteredGuides, pageIndex]);

  const isValid = useMemo(() => {
    if (!program || !audience || !guideFile) return false;
    if (audience === AUDIENCE.SINGLE && !dptId) return false;
    if (audience === AUDIENCE.MULTIPLE && dptIds.length === 0) return false;
    return true;
  }, [program, audience, guideFile, dptId, dptIds]);

  const handleFilePick = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setGuideFile(null);
      return;
    }
    const name = String(file.name || '').toLowerCase();
    if (!name.endsWith('.pdf')) {
      showToast('Guide file must be a PDF.', 'warning');
      e.target.value = '';
      setGuideFile(null);
      return;
    }
    setGuideFile(file);
  };

  const selectGuide = (guide) => {
    setActiveGuideId(String(guide.report_id || guide._id));
    setProgram(String(guide.program || 'HND').toUpperCase());
    setAudience(guide.audience || AUDIENCE.GENERAL);
    if (guide.audience === AUDIENCE.SINGLE) {
      const firstDept = Array.isArray(guide.departments) ? guide.departments[0] : null;
      setDptId(firstDept?.dpt_id || '');
      setDptIds([]);
    } else if (guide.audience === AUDIENCE.MULTIPLE) {
      setDptId('');
      setDptIds((Array.isArray(guide.departments) ? guide.departments : []).map((d) => d.dpt_id).filter(Boolean));
    } else {
      setDptId('');
      setDptIds([]);
    }
    setGuideFile(null);
  };

  const deleteGuide = async (id) => {
    if (!window.confirm('Delete this guide? This action cannot be undone.')) return;
    try {
      startLoading();
      const res = await api.delete(`/admin/reports/${id}`);
      if (res.data?.success) {
        showToast('Guide deleted successfully', 'success');
        setGuides((prev) => (Array.isArray(prev) ? prev.filter((g) => String(g.report_id || g._id) !== String(id)) : []));
        if (String(activeGuideId) === String(id)) setActiveGuideId(null);
      } else {
        showToast(res.data?.message || 'Failed to delete guide', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete guide.'), 'error');
    } finally {
      stopLoading();
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) {
      showToast('Please complete all required fields before uploading.', 'warning');
      return;
    }

    try {
      startLoading();
      setUploadProgress(0);

      const fd = new FormData();
      fd.append('program', program);
      fd.append('audience', audience);
      if (audience === AUDIENCE.SINGLE) fd.append('dpt_id', dptId);
      if (audience === AUDIENCE.MULTIPLE) fd.append('dpt_ids', JSON.stringify(dptIds));
      fd.append('title', `Guide: ${program} Report Writing Guide`);
      fd.append('writer_names', String((user && user.name) || 'Acadex Admin'));
      fd.append('writer_email', String((user && user.email) || 'admin@hnd-platform.com'));
      fd.append('description', 'Official report writing guide');
      fd.append('location', 'Acadex Guide');
      fd.append('keywords', 'guide,report,writing');
      fd.append('pages', '1');
      fd.append('guideFile', guideFile);

      const res = await api.post('/admin/upload-guide', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const pct = Math.round((evt.loaded * 100) / evt.total);
          setUploadProgress(pct);
        },
      });

      if (res.data?.success) {
        showToast('Report writing guide uploaded successfully!', 'success');
        // refresh guides list
        const listRes = await api.get(`/admin/reports/guides/list?program=${encodeURIComponent(program)}`);
        if (listRes.data?.success) setGuides(Array.isArray(listRes.data.reports) ? listRes.data.reports : []);
      } else {
        showToast(res.data?.message || 'Upload failed', 'error');
      }

      setGuideFile(null);
      setUploadProgress(0);
      setDptId('');
      setDptIds([]);
      setAudience(AUDIENCE.SINGLE);
      setActiveGuideId(null);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to upload guide.'), 'error');
    } finally {
      stopLoading();
    }
  };

  return (
    <div className={crudStyles.page}>
      {loading && <GraduationCapLoader fullscreen label="Preparing guide upload…" />}

      <div className={crudStyles.grid}>
        <section className={crudStyles.card}>
          <div className={crudStyles.cardHeader}>
            <h2 className={crudStyles.cardTitle}>Report Writing Guide</h2>
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.field}>
              <label className={styles.label}>Program <span>*</span></label>
              <select value={program} onChange={(e) => setProgram(e.target.value)}>
                {PROGRAM_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Audience <span>*</span></label>
              <div className={styles.segment}>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${audience === AUDIENCE.GENERAL ? styles.active : ''}`}
                  onClick={() => setAudience(AUDIENCE.GENERAL)}
                  aria-pressed={audience === AUDIENCE.GENERAL}
                >
                  General (All)
                </button>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${audience === AUDIENCE.SINGLE ? styles.active : ''}`}
                  onClick={() => setAudience(AUDIENCE.SINGLE)}
                  aria-pressed={audience === AUDIENCE.SINGLE}
                >
                  Single Dept
                </button>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${audience === AUDIENCE.MULTIPLE ? styles.active : ''}`}
                  onClick={() => setAudience(AUDIENCE.MULTIPLE)}
                  aria-pressed={audience === AUDIENCE.MULTIPLE}
                >
                  Multiple Depts
                </button>
              </div>
            </div>

            {audience === AUDIENCE.SINGLE && (
              <div className={styles.field}>
                <label className={styles.label}>Department <span>*</span></label>
                <select value={dptId} onChange={(e) => setDptId(e.target.value)} required>
                  <option value="">-- Select Department --</option>
                  {departments.map((d) => (
                    <option key={d.dpt_id} value={d.dpt_id}>{d.department_name}</option>
                  ))}
                </select>
              </div>
            )}

            {audience === AUDIENCE.MULTIPLE && (
              <div className={styles.field}>
                <label className={styles.label}>Departments <span>*</span></label>
                <select
                  className={styles.multi}
                  multiple
                  value={dptIds}
                  onChange={(e) => setDptIds(Array.from(e.target.selectedOptions, (o) => o.value))}
                  required
                >
                  {departments.map((d) => (
                    <option key={d.dpt_id} value={d.dpt_id}>{d.department_name}</option>
                  ))}
                </select>
                <div className={styles.helper}>
                  Hold <strong>Ctrl/Cmd</strong> and click to select multiple departments.
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Guide Document (PDF only) <span>*</span></label>
              <input type="file" accept=".pdf" onChange={handleFilePick} />
              {guideFile && <div className={styles.filename}>{guideFile.name}</div>}
            </div>

            <button type="submit" className={styles.uploadBtn} disabled={!isValid}>
              Upload Guide
            </button>

            {uploadProgress > 0 && (
              <div className={styles.loadingBar} style={{ width: `${uploadProgress}%` }} aria-label="Upload progress" />
            )}
          </form>
        </section>

        <section className={`${crudStyles.card} ${crudStyles.stickyPanel}`}>
          <div className={crudStyles.cardHeader}>
            <h3 className={crudStyles.cardTitle}>Existing Guides</h3>
          </div>

          <input
            className={crudStyles.search}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPageIndex(0);
            }}
            placeholder="Search by title, writer, email, keyword, audience…"
          />

          <div className={crudStyles.listTools}>
            <span className={crudStyles.resultsCount}>{filteredGuides.length} total</span>
            {filteredGuides.length > PAGE_SIZE && (
              <label className={crudStyles.pageSelectWrap}>
                <span>View more</span>
                <select
                  className={crudStyles.pageSelect}
                  value={pageIndex}
                  onChange={(e) => setPageIndex(Number(e.target.value))}
                >
                  {Array.from({ length: totalPages }, (_, idx) => {
                    const start = idx * PAGE_SIZE + 1;
                    const end = Math.min((idx + 1) * PAGE_SIZE, filteredGuides.length);
                    return (
                      <option key={`guide-page-${idx}`} value={idx}>
                        {start}-{end}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>

          <div className={`${crudStyles.list} ${crudStyles.scrollList}`}>
            {filteredGuides.length === 0 ? (
              <div className={crudStyles.item}>No guides found.</div>
            ) : (
              pagedGuides.map((guide) => {
                const id = guide.report_id || guide._id;
                const deptLabel = Array.isArray(guide.departments) && guide.departments.length
                  ? guide.departments.map((d) => d.abbreviation || d.department_name).filter(Boolean).join(', ')
                  : '—';
                return (
                  <div
                    key={String(id)}
                    className={`${crudStyles.item} ${String(activeGuideId) === String(id) ? crudStyles.itemActive : ''}`}
                    onClick={() => selectGuide(guide)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectGuide(guide);
                      }
                    }}
                    title="Click to load guide metadata"
                  >
                        <div className={crudStyles.itemTop}>
                          <div>
                            <div className={crudStyles.itemTitle}>{guide.title || 'Untitled guide'}</div>
                            <div className={crudStyles.itemMeta}>
                              {guide.writer_names || 'Unknown author'} • {guide.writer_email || 'No email'}
                              <br />
                              Program: {String(guide.program || 'HND').toUpperCase()} • Audience: {guide.audience || 'GENERAL'} • Depts: {deptLabel}
                            </div>
                          </div>
                          <div className={crudStyles.actions}>
                            <button
                              type="button"
                              className={`${crudStyles.btn} ${crudStyles.btnDanger}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteGuide(id);
                              }}
                              aria-label={`Delete guide ${guide.title || ''}`}
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
    </div>
  );
};

export default ReportWritingGuide;
