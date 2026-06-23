// File: src/components/ReportUpload.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/reportUpload.module.css';
import crudStyles from '../Astyles/AdminCrudTwoCol.module.css';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { useLoading } from '../context/LoadingContext';
import { useAuth } from '../context/AuthContext';
import GraduationCapLoader from './GraduationCapLoader';
import { useTranslation } from 'react-i18next';

const AUDIENCE = {
  SINGLE: 'SINGLE',
  MULTIPLE: 'MULTIPLE',
  GENERAL: 'GENERAL',
};

const PAGE_SIZE = 7;

const ReportUpload = () => {
  const { loading, startLoading, stopLoading } = useLoading();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [departments, setDepartments] = useState([]);
  const [program, setProgram] = useState(String(user?.program || 'HND').toUpperCase());
  const [audience, setAudience] = useState(AUDIENCE.SINGLE);

  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);

  const [dptId, setDptId] = useState('');
  const [dptIds, setDptIds] = useState([]); // for MULTIPLE

  const [title, setTitle] = useState('');
  const [writerNames, setWriterNames] = useState('');
  const [writerEmail, setWriterEmail] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [keywords, setKeywords] = useState('');
  const [pages, setPages] = useState('');
  const [materialPrice, setMaterialPrice] = useState('');
  const [projectGithubUrl, setProjectGithubUrl] = useState('');
  const [reportDoc, setReportDoc] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const confirmRef = useRef(null);

  const fetchReports = useCallback(async () => {
    try {
      startLoading();
      const res = await api.get(`/admin/reports/list?program=${encodeURIComponent(program)}`);
      if (res.data?.success) {
        setReports(Array.isArray(res.data.reports) ? res.data.reports : []);
      } else {
        showToast(res.data?.message || 'Failed to fetch reports.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to fetch reports. Check connection and try again.'), 'error');
    } finally {
      stopLoading();
    }
  }, [program, startLoading, stopLoading]);

  /** Fetch departments - mount only, no retry on failure */
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        startLoading();
        const res = await api.get(`/admin/departments?program=${encodeURIComponent(program)}`);
        const arr = Array.isArray(res.data) ? res.data : [];
        if (!ignore) setDepartments(arr);
      } catch (e) {
        if (!ignore) showToast(getErrorMessage(e, 'Failed to fetch departments. Check connection and try again.'), 'error');
      } finally {
        stopLoading();
      }
    })();
    return () => { ignore = true; };
  }, [program, startLoading, stopLoading]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // close modal on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (confirmOpen && confirmRef.current && !confirmRef.current.contains(e.target)) {
        setConfirmOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [confirmOpen]);

  // reset department selections when audience changes
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

  // simple validation
  const isValid = useMemo(() => {
    if (!title.trim() || !writerNames.trim() || !writerEmail.trim() ||
      !description.trim() || !location.trim() || !keywords.trim() ||
      !pages || !materialPrice) return false;

    if (!activeId && !reportDoc) return false;

    const parsedPrice = Number(materialPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return false;

    if (audience === AUDIENCE.SINGLE && !dptId) return false;
    if (audience === AUDIENCE.MULTIPLE && dptIds.length === 0) return false;

    // naive email check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(writerEmail)) return false;

    return true;
  }, [title, writerNames, writerEmail, description, location, keywords, pages, materialPrice, reportDoc, audience, dptId, dptIds, activeId]);

  const openConfirm = (e) => {
    e.preventDefault();
    if (!isValid) {
      showToast('Please complete all required fields correctly.', 'warning');
      return;
    }
    if (activeId) {
      onUpdate();
      return;
    }
    setConfirmOpen(true);
  };

  const handleReportFilePick = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setReportDoc(null);
      return;
    }

    const name = String(file.name || '').toLowerCase();
    const isValidReport = name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx');
    if (!isValidReport) {
      showToast('Report file must be PDF, DOC, or DOCX.', 'warning');
      e.target.value = '';
      setReportDoc(null);
      return;
    }

    setReportDoc(file);
  };

  const clearForm = () => {
    setActiveId(null);
    setAudience(AUDIENCE.SINGLE);
    setDptId('');
    setDptIds([]);
    setTitle('');
    setWriterNames('');
    setWriterEmail('');
    setDescription('');
    setLocation('');
    setKeywords('');
    setPages('');
    setMaterialPrice('');
    setProjectGithubUrl('');
    setReportDoc(null);
    setUploadProgress(0);
  };

  const selectForEdit = (r) => {
    const id = r?.report_id || r?._id;
    if (!id) return;
    setActiveId(String(id));
    setProgram(String(r.program || 'HND').toUpperCase());
    setAudience(r.audience || AUDIENCE.SINGLE);
    const deptIds = Array.isArray(r.departments) ? r.departments.map((d) => d.dpt_id).filter(Boolean) : [];
    if ((r.audience || '').toUpperCase() === AUDIENCE.SINGLE) {
      setDptId(deptIds[0] || '');
      setDptIds([]);
    } else if ((r.audience || '').toUpperCase() === AUDIENCE.MULTIPLE) {
      setDptId('');
      setDptIds(deptIds);
    } else {
      setDptId('');
      setDptIds([]);
    }
    setTitle(r.title || '');
    setWriterNames(r.writer_names || '');
    setWriterEmail(r.writer_email || '');
    setDescription(r.description || '');
    setLocation(r.location || '');
    setKeywords(r.keywords || '');
    setPages(r.pages || '');
    setMaterialPrice(r.material_price != null ? String(r.material_price) : '');
    setProjectGithubUrl(r.project_github_url || '');
    setReportDoc(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onUpdate = async () => {
    if (!activeId) return;
    try {
      startLoading();
      const payload = {
        audience,
        dpt_id: audience === AUDIENCE.SINGLE ? dptId : undefined,
        dpt_ids: audience === AUDIENCE.MULTIPLE ? JSON.stringify(dptIds) : undefined,
        title: title.trim(),
        writer_names: writerNames.trim(),
        writer_email: writerEmail.trim(),
        description: description.trim(),
        location: location.trim(),
        keywords: keywords.trim(),
        pages: String(pages).trim(),
        material_price: String(materialPrice).trim(),
        project_github_url: String(projectGithubUrl || '').trim(),
        program,
      };

      const res = await api.put(`/admin/reports/${activeId}`, payload);
      if (res.data?.success) {
        showToast(res.data?.message || 'Report updated successfully.', 'success');
        await fetchReports();
        clearForm();
      } else {
        showToast(res.data?.message || 'Update failed.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update report.'), 'error');
    } finally {
      stopLoading();
    }
  };

  const onDelete = async (r, e) => {
    if (e) e.stopPropagation();
    const id = r?.report_id || r?._id;
    if (!id) return;
    const ok = window.confirm(`Delete report "${r.title}"? This will remove the uploaded file too.`);
    if (!ok) return;
    try {
      startLoading();
      const res = await api.delete(`/admin/reports/${id}`);
      if (res.data?.success) {
        showToast(res.data?.message || 'Report deleted.', 'success');
        if (String(activeId) === String(id)) clearForm();
        await fetchReports();
      } else {
        showToast(res.data?.message || 'Delete failed.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete report.'), 'error');
    } finally {
      stopLoading();
    }
  };

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => {
      const deptText = Array.isArray(r.departments)
        ? r.departments.map((d) => `${d.department_name || ''} ${d.abbreviation || ''}`.trim()).join(' ')
        : '';
      const hay = [
        r.title,
        r.writer_names,
        r.writer_email,
        r.keywords,
        r.location,
        r.audience,
        deptText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [reports, search]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE)),
    [filteredReports.length]
  );

  const pagedReports = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filteredReports.slice(start, start + PAGE_SIZE);
  }, [filteredReports, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
  }, [search, program]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const onUpload = async (notify) => {
    try {
      startLoading();
      const fd = new FormData();
      fd.append('audience', audience); // SINGLE | MULTIPLE | GENERAL
      if (audience === AUDIENCE.SINGLE) fd.append('dpt_id', dptId);
      if (audience === AUDIENCE.MULTIPLE) fd.append('dpt_ids', JSON.stringify(dptIds));

      fd.append('title', title.trim());
      fd.append('writer_names', writerNames.trim());
      fd.append('writer_email', writerEmail.trim());
      fd.append('description', description.trim());
      fd.append('location', location.trim());
      fd.append('keywords', keywords.trim());
      fd.append('pages', String(pages));
      fd.append('material_price', String(materialPrice).trim());
      fd.append('project_github_url', String(projectGithubUrl || '').trim());
      fd.append('program', program);
      fd.append('reportDoc', reportDoc);
      fd.append('notify', notify ? 'true' : 'false');

      const res = await api.post('/admin/upload-report', fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const pct = Math.round((evt.loaded * 100) / evt.total);
          setUploadProgress(pct);
        },
      });

      if (res.data?.success) {
        showToast('Report uploaded successfully!', 'success');
        // reset
        setAudience(AUDIENCE.SINGLE);
        setDptId('');
        setDptIds([]);
        setTitle('');
        setWriterNames('');
        setWriterEmail('');
        setDescription('');
        setLocation('');
        setKeywords('');
        setPages('');
        setMaterialPrice('');
        setProjectGithubUrl('');
        setReportDoc(null);
        setUploadProgress(0);
      } else {
        showToast(res.data?.message || 'Upload failed', 'error');
      }
    } catch (e) {
      showToast(getErrorMessage(e, 'Server error during upload. Please try again.'), 'error');
    } finally {
      stopLoading();
      setConfirmOpen(false);
    }
  };

  return (
    <div className={crudStyles.page}>
      {loading && <GraduationCapLoader fullscreen label="Uploading report… Please wait" />}

      <div className={crudStyles.grid}>
        <section className={crudStyles.card}>
          <div className={crudStyles.cardHeader}>
            <h2 className={crudStyles.cardTitle}>{activeId ? t('uploads.reportUpdateTitle') : t('uploads.reportUploadTitle')}</h2>
            {activeId && (
              <button type="button" className={`${crudStyles.btn} ${crudStyles.btnGhost}`} onClick={clearForm}>
                Cancel
              </button>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t('uploads.reportProgramLabel')} <span>*</span></label>
            <select value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="HND">{t('common.hnd')}</option>
              <option value="BTS">{t('common.bts')}</option>
            </select>
          </div>

          {/* Audience Switch */}
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

          <form className={styles.form} onSubmit={openConfirm}>
            {/* SINGLE */}
            {audience === AUDIENCE.SINGLE && (
              <div className={styles.field}>
                <label className={styles.label}>Department <span>*</span></label>
                <select
                  value={dptId}
                  onChange={(e) => setDptId(e.target.value)}
                  required
                >
                  <option value="">-- Select Department --</option>
                  {departments.map((d) => (
                    <option key={d.dpt_id} value={d.dpt_id}>
                      {d.department_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* MULTIPLE */}
            {audience === AUDIENCE.MULTIPLE && (
              <div className={styles.field}>
                <label className={styles.label}>Departments <span>*</span></label>
                <select
                  className={styles.multi}
                  multiple
                  value={dptIds}
                  onChange={(e) =>
                    setDptIds(Array.from(e.target.selectedOptions, (o) => o.value))
                  }
                  required
                >
                  {departments.map((d) => (
                    <option key={d.dpt_id} value={d.dpt_id}>
                      {d.department_name}
                    </option>
                  ))}
                </select>
                <div className={styles.helper}>
                  Hold <strong>Ctrl/Cmd</strong> and click to select multiple departments.
                </div>
              </div>
            )}

            {/* Common fields */}
            <div className={styles.field}>
              <label className={styles.label}>Report Title <span>*</span></label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className={styles.row}>
              <div className={styles.fieldFlex}>
                <label className={styles.label}>Writer Names <span>*</span></label>
                <input value={writerNames} onChange={(e) => setWriterNames(e.target.value)} required />
              </div>
              <div className={styles.fieldFlex}>
                <label className={styles.label}>Writer Email <span>*</span></label>
                <input type="email" value={writerEmail} onChange={(e) => setWriterEmail(e.target.value)} required />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Keywords <span>*</span></label>
              <input placeholder="comma,separated,tags" value={keywords} onChange={(e) => setKeywords(e.target.value)} required />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Description <span>*</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>

            <div className={styles.row}>
              <div className={styles.fieldFlex}>
                <label className={styles.label}>Location / Geo Focus <span>*</span></label>
                <input value={location} onChange={(e) => setLocation(e.target.value)} required />
              </div>
              <div className={styles.fieldFlex}>
                <label className={styles.label}>Pages <span>*</span></label>
                <input type="number" min="1" value={pages} onChange={(e) => setPages(e.target.value)} required />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.fieldFlex}>
                <label className={styles.label}>Download Price (XAF) <span>*</span></label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={materialPrice}
                  onChange={(e) => setMaterialPrice(e.target.value)}
                  required
                />
              </div>
              <div className={styles.fieldFlex}>
                <label className={styles.label}>Project GitHub URL</label>
                <input
                  type="url"
                  placeholder="https://github.com/org/repo"
                  value={projectGithubUrl}
                  onChange={(e) => setProjectGithubUrl(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Report Document (PDF/DOC/DOCX) <span>*</span></label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleReportFilePick}
                required={!activeId}
                disabled={Boolean(activeId)}
              />
              {activeId && (
                <div className={styles.helper}>
                  File replacement is not available during update. Cancel edit to upload a new report.
                </div>
              )}
              {reportDoc && <div className={styles.filename}>{reportDoc.name}</div>}
            </div>

            <button className={styles.uploadBtn} type="submit">
              {activeId ? 'Update' : 'Upload'}
            </button>
          </form>
        </section>

        <section className={`${crudStyles.card} ${crudStyles.stickyPanel}`}>
          <div className={crudStyles.cardHeader}>
            <h3 className={crudStyles.cardTitle}>Existing Reports</h3>
          </div>

          <input
            className={crudStyles.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, writer, email, keyword, audience…"
          />

          <div className={crudStyles.listTools}>
            <span className={crudStyles.resultsCount}>{filteredReports.length} total</span>
            {filteredReports.length > PAGE_SIZE && (
              <label className={crudStyles.pageSelectWrap}>
                <span>View more</span>
                <select
                  className={crudStyles.pageSelect}
                  value={pageIndex}
                  onChange={(e) => setPageIndex(Number(e.target.value))}
                >
                  {Array.from({ length: totalPages }, (_, idx) => {
                    const start = idx * PAGE_SIZE + 1;
                    const end = Math.min((idx + 1) * PAGE_SIZE, filteredReports.length);
                    return (
                      <option key={`report-page-${idx}`} value={idx}>
                        {start}-{end}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>

          <div className={`${crudStyles.list} ${crudStyles.scrollList}`}>
            {filteredReports.length === 0 ? (
              <div className={crudStyles.item}>No reports found.</div>
            ) : (
              pagedReports.map((r) => {
                const id = r.report_id || r._id;
                const deptLabel = Array.isArray(r.departments) && r.departments.length
                  ? r.departments.map((d) => d.abbreviation || d.department_name).filter(Boolean).join(', ')
                  : '—';
                return (
                  <div
                    key={String(id)}
                    className={`${crudStyles.item} ${String(activeId) === String(id) ? crudStyles.itemActive : ''}`}
                    onClick={() => selectForEdit(r)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectForEdit(r); } }}
                    title="Click to edit"
                  >
                    <div className={crudStyles.itemTop}>
                      <div>
                        <div className={crudStyles.itemTitle}>{r.title}</div>
                        <div className={crudStyles.itemMeta}>
                          {r.writer_names} • {r.writer_email}
                          <br />
                          Audience: {r.audience} • Depts: {deptLabel}
                        </div>
                      </div>

                      <div className={crudStyles.actions}>
                        <button
                          type="button"
                          className={`${crudStyles.btn} ${crudStyles.btnDanger}`}
                          onClick={(e) => onDelete(r, e)}
                          title="Delete report"
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

      {/* Confirm / Notify Modal */}
      {confirmOpen && (
        <div className={styles.popup} role="dialog" aria-modal="true">
          <div className={styles.popupBox} ref={confirmRef}>
            <button
              className={styles.closeButton}
              onClick={() => setConfirmOpen(false)}
              aria-label="Close"
            >
              ✖
            </button>

            <h3 className={styles.modalTitle}>Notify candidates?</h3>
            <p className={styles.modalText}>
              You’re about to upload: <strong>{title || 'Untitled Report'}</strong>.
              <br />
              {audience === AUDIENCE.GENERAL && 'This will be visible to all departments.'}
              {audience === AUDIENCE.SINGLE && 'This will be visible to the selected department.'}
              {audience === AUDIENCE.MULTIPLE && 'This will be visible to the selected departments.'}
              <br />
              Choose whether to send an email notification after upload.
            </p>

            <div className={styles.popupActions}>
              <button className={styles.notifyBtn} onClick={() => onUpload(true)}>
                Yes, Upload & Notify
              </button>
              <button className={styles.noNotifyBtn} onClick={() => onUpload(false)}>
                No, Just Upload
              </button>
            </div>

            {uploadProgress > 0 && (
              <div
                className={styles.loadingBar}
                style={{ width: `${uploadProgress}%` }}
                aria-label="Upload progress"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportUpload;
