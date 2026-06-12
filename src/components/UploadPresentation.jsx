import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/uploadPresentation.module.css';
import crudStyles from '../Astyles/AdminCrudTwoCol.module.css';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { useLoading } from '../context/LoadingContext';
import { useAuth } from '../context/AuthContext';
import GraduationCapLoader from './GraduationCapLoader';
import { useTranslation } from 'react-i18next';
import SecurePdfPreview from './SecurePdfPreview';

const PAGE_SIZE = 7;

const UploadPresentation = () => {
  const { loading, startLoading, stopLoading } = useLoading();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [reports, setReports] = useState([]);
  const [program, setProgram] = useState(String(user?.program || 'HND').toUpperCase());
  const [report_id, setReportId] = useState(null);
  const [title, setTitle] = useState('');
  const [presenterName, setPresenterName] = useState('');
  const [presenterEmail, setPresenterEmail] = useState('');
  const [presentationFile, setPresentationFile] = useState(null);

  const [presentations, setPresentations] = useState([]);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [audience, setAudience] = useState('GENERAL');
  const [dptId, setDptId] = useState('');
  const [dptIds, setDptIds] = useState([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmRef = useRef(null);

  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const clearForm = () => {
    setActiveId(null);
    setReportId(null);
    setTitle('');
    setPresenterName('');
    setPresenterEmail('');
    setPresentationFile(null);
    setAudience('GENERAL');
    setDptId('');
    setDptIds([]);
  };

  useEffect(() => {
    if (audience === 'GENERAL') {
      setDptId('');
      setDptIds([]);
    } else if (audience === 'SINGLE') {
      setDptIds([]);
    } else if (audience === 'MULTIPLE') {
      setDptId('');
    }
  }, [audience]);

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

  const fetchPresentations = useCallback(async () => {
    try {
      startLoading();
      const res = await api.get(`/admin/presentations/list?program=${encodeURIComponent(program)}`);
      if (res.data?.success) {
        setPresentations(Array.isArray(res.data.presentations) ? res.data.presentations : []);
      } else {
        showToast(res.data?.message || 'Failed to fetch presentations.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to fetch presentations. Check connection and try again.'), 'error');
    } finally {
      stopLoading();
    }
  }, [program, startLoading, stopLoading]);

  /** Fetch reports - mount only, no retry on failure */
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        startLoading();
        const res = await api.get(`/admin/reports?program=${encodeURIComponent(program)}`);
        const arr = Array.isArray(res.data) ? res.data : [];
        if (!ignore) setReports(arr);
      } catch (e) {
        if (!ignore) showToast(getErrorMessage(e, 'Failed to fetch reports. Check connection and try again.'), 'error');
      } finally {
        stopLoading();
      }
    })();
    return () => { ignore = true; };
  }, [program, startLoading, stopLoading]);

  useEffect(() => {
    // Clear activeId on mount to prevent stale selections after page refresh
    setActiveId(null);
    fetchPresentations();
  }, [fetchPresentations]);

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

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
  };

  const openConfirm = (e) => {
    e.preventDefault();
    setConfirmOpen(true);
  };

  const selectForEdit = (p) => {
    const id = p?.presentation_id || p?._id;
    if (!id) return;
    setActiveId(String(id));
    setProgram(String(p.program || 'HND').toUpperCase());
    setAudience(String(p.audience || 'GENERAL').toUpperCase());
    const deptIds = Array.isArray(p.departments) ? p.departments.map((d) => d.dpt_id).filter(Boolean) : [];
    if ((p.audience || '').toUpperCase() === 'SINGLE') {
      setDptId(deptIds[0] || '');
      setDptIds([]);
    } else if ((p.audience || '').toUpperCase() === 'MULTIPLE') {
      setDptId('');
      setDptIds(deptIds);
    } else {
      setDptId('');
      setDptIds([]);
    }
    setReportId(p.report_id || null);
    setTitle(p.title || '');
    setPresenterName(p.presenter_name || '');
    setPresenterEmail(p.presenter_email || '');
    setPresentationFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReportChange = (e) => {
    const selectedId = e.target.value || null;
    setReportId(selectedId);

    if (selectedId) {
      const selectedReport = reports.find(r => r.report_id === selectedId);
      if (selectedReport) {
        setPresenterName(selectedReport.writer_names);
        setPresenterEmail(selectedReport.writer_email);
      } else {
        setPresenterName('');
        setPresenterEmail('');
      }
    } else {
      setPresenterName('');
      setPresenterEmail('');
    }
  };

  const handlePresentationFilePick = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setPresentationFile(null);
      return;
    }

    const name = String(file.name || '').toLowerCase();
    const isPowerPoint = name.endsWith('.ppt') || name.endsWith('.pptx');
    if (!isPowerPoint) {
      showToast('Presentation file must be PowerPoint only (.ppt or .pptx).', 'warning');
      e.target.value = '';
      setPresentationFile(null);
      return;
    }

    setPresentationFile(file);
  };

  const onUpdate = async () => {
    if (!activeId) return;
    try {
      startLoading();
      const payload = {
        report_id: report_id || '',
        title: title.trim(),
        presenter_name: presenterName.trim(),
        presenter_email: presenterEmail.trim(),
        program,
        audience,
        dpt_id: audience === 'SINGLE' ? dptId : undefined,
        dpt_ids: audience === 'MULTIPLE' ? JSON.stringify(dptIds) : undefined,
      };

      const res = await api.put(`/admin/presentations/${activeId}`, payload);
      if (res.data?.success) {
        showToast(res.data?.message || 'Presentation updated successfully.', 'success');
        await fetchPresentations();
        clearForm();
      } else {
        showToast(res.data?.message || 'Update failed', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Update error occurred. Please try again.'), 'error');
    } finally {
      stopLoading();
    }
  };

  const onDelete = async (p, e) => {
    if (e) e.stopPropagation();
    const id = p?.presentation_id || p?._id;
    if (!id) return;
    const ok = window.confirm(`Delete presentation "${p.title}"? This will remove the uploaded file too.`);
    if (!ok) return;

    try {
      startLoading();
      const res = await api.delete(`/admin/presentations/${id}`);
      if (res.data?.success) {
        showToast(res.data?.message || 'Presentation deleted.', 'success');
        if (String(activeId) === String(id)) clearForm();
        await fetchPresentations();
      } else {
        showToast(res.data?.message || 'Delete failed', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Delete error occurred. Please try again.'), 'error');
    } finally {
      stopLoading();
    }
  };

  const onUpload = async (notify) => {
    try {
      startLoading();
      const fd = new FormData();
      fd.append('report_id', report_id || '');
      fd.append('title', title.trim());
      fd.append('presenter_name', presenterName.trim());
      fd.append('presenter_email', presenterEmail.trim());
      fd.append('program', program);
      fd.append('audience', audience);
      if (audience === 'SINGLE') fd.append('dpt_id', dptId);
      if (audience === 'MULTIPLE') fd.append('dpt_ids', JSON.stringify(dptIds));
      fd.append('presentationFile', presentationFile);
      fd.append('notify', notify ? 'true' : 'false');

      const res = await api.post('/admin/upload-presentation', fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
        },
      });

      if (res.data.success) {
        showToast('Presentation uploaded successfully!', 'success');
        clearForm();
        await fetchPresentations();
      } else {
        showToast(res.data.message || 'Upload failed', 'error');
      }
    } catch (e) {
      showToast(getErrorMessage(e, 'Server error during upload. Please try again.'), 'error');
    } finally {
      stopLoading();
      setConfirmOpen(false);
    }
  };

  const handlePreviewPresentation = async (presentation) => {
    const requested = String(presentation?.file_path || '').trim();
    if (!requested) {
      showToast('No file available for preview.', 'warning');
      return;
    }

    setPreviewLoading(true);
    try {
      const safeFile = encodeURIComponent(requested);
      const res = await api.get(`/candidate/presentations/preview/${safeFile}`, {
        responseType: 'blob',
        timeout: 120000,
      });

      const blob = res.data instanceof Blob
        ? new Blob([res.data], { type: 'application/pdf' })
        : new Blob([res.data], { type: 'application/pdf' });

      const url = URL.createObjectURL(blob);
      setPreviewFile(requested || 'presentation');
      setPreviewUrl(url);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to preview presentation.'), 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const filteredPresentations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return presentations;
    return presentations.filter((p) => {
      const hay = [p.title, p.presenter_name, p.presenter_email, p.report_title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [presentations, search]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredPresentations.length / PAGE_SIZE)),
    [filteredPresentations.length]
  );

  const pagedPresentations = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filteredPresentations.slice(start, start + PAGE_SIZE);
  }, [filteredPresentations, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
  }, [search, program]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);


  return (
    <div className={crudStyles.page}>
      {loading && <GraduationCapLoader fullscreen label="Processing presentation… Please wait" />}

      <div className={crudStyles.grid}>
        <section className={crudStyles.card}>
          <div className={crudStyles.cardHeader}>
            <h2 className={crudStyles.cardTitle}>{activeId ? 'Update Presentation' : 'Upload Presentation'}</h2>
            {activeId && (
              <button type="button" className={`${crudStyles.btn} ${crudStyles.btnGhost}`} onClick={clearForm}>
                Cancel
              </button>
            )}
          </div>

          <form className={styles.form} onSubmit={openConfirm}>
            <div className={styles.field}>
              <label className={styles.label}>{t('uploads.reportProgramLabel')} <span>*</span></label>
              <select value={program} onChange={(e) => setProgram(e.target.value)}>
                <option value="HND">{t('common.hnd')}</option>
                <option value="BTS">{t('common.bts')}</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Audience <span>*</span></label>
              <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="GENERAL">General (all candidates)</option>
                <option value="SINGLE">Single Department</option>
                <option value="MULTIPLE">Multiple Departments</option>
              </select>
            </div>

            {audience === 'SINGLE' && (
              <div className={styles.field}>
                <label className={styles.label}>Department <span>*</span></label>
                <select value={dptId} onChange={(e) => setDptId(e.target.value)} required>
                  <option value="">Select a department</option>
                  {departments.map((d) => (
                    <option key={d.dpt_id} value={d.dpt_id}>
                      {d.dpt_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {audience === 'MULTIPLE' && (
              <div className={styles.field}>
                <label className={styles.label}>Departments <span>*</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {departments.map((d) => (
                    <label key={d.dpt_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={dptIds.includes(String(d.dpt_id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDptIds([...dptIds, String(d.dpt_id)]);
                          } else {
                            setDptIds(dptIds.filter((id) => id !== String(d.dpt_id)));
                          }
                        }}
                      />
                      {d.dpt_name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Link to Report (optional)</label>
              <select value={report_id || ''} onChange={handleReportChange}>
                <option value="">Random / Not Linked</option>
                {reports.map((r) => (
                  <option key={r.report_id} value={r.report_id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Presentation Title <span>*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className={styles.row}>
              <div className={styles.fieldFlex}>
                <label className={styles.label}>Presenter Name <span>*</span></label>
                <input
                  type="text"
                  value={presenterName}
                  onChange={(e) => setPresenterName(e.target.value)}
                  required
                />
              </div>

              <div className={styles.fieldFlex}>
                <label className={styles.label}>Presenter Email <span>*</span></label>
                <input
                  type="email"
                  value={presenterEmail}
                  onChange={(e) => setPresenterEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Upload PowerPoint (PPT/PPTX) <span>*</span></label>
              <input
                type="file"
                accept=".ppt,.pptx"
                onChange={handlePresentationFilePick}
                required={!activeId}
                disabled={Boolean(activeId)}
              />
              {activeId && (
                <div className={styles.helper}>
                  File replacement is not available during update. Cancel edit to upload a new presentation.
                </div>
              )}
            </div>

            {activeId ? (
              <button type="button" className={styles.uploadBtn} onClick={onUpdate}>
                Update Presentation
              </button>
            ) : (
              <button type="submit" className={styles.uploadBtn}>
                Upload Presentation
              </button>
            )}
          </form>
        </section>

        <section className={`${crudStyles.card} ${crudStyles.stickyPanel}`}>
          <div className={crudStyles.cardHeader}>
            <h3 className={crudStyles.cardTitle}>Existing Presentations</h3>
          </div>

          <input
            className={crudStyles.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, presenter, linked report…"
          />

          <div className={crudStyles.listTools}>
            <span className={crudStyles.resultsCount}>{filteredPresentations.length} total</span>
            {filteredPresentations.length > PAGE_SIZE && (
              <label className={crudStyles.pageSelectWrap}>
                <span>View more</span>
                <select
                  className={crudStyles.pageSelect}
                  value={pageIndex}
                  onChange={(e) => setPageIndex(Number(e.target.value))}
                >
                  {Array.from({ length: totalPages }, (_, idx) => {
                    const start = idx * PAGE_SIZE + 1;
                    const end = Math.min((idx + 1) * PAGE_SIZE, filteredPresentations.length);
                    return (
                      <option key={`presentation-page-${idx}`} value={idx}>
                        {start}-{end}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>

          <div className={`${crudStyles.list} ${crudStyles.scrollList}`}>
            {filteredPresentations.length === 0 ? (
              <div className={crudStyles.item}>No presentations found.</div>
            ) : (
              pagedPresentations.map((p) => {
                const id = p.presentation_id || p._id;
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
                        <div className={crudStyles.itemTitle}>{p.title}</div>
                        <div className={crudStyles.itemMeta}>
                          {p.presenter_name} • {p.presenter_email}
                          <br />
                          Audience: {p.audience || 'General'} • Linked report: {p.report_title || 'Standalone'}
                        </div>
                      </div>

                      <div className={crudStyles.actions}>
                        <button
                          type="button"
                          className={`${crudStyles.btn} ${crudStyles.btnGhost}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewPresentation(p);
                          }}
                          title="Preview presentation"
                          disabled={previewLoading}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className={`${crudStyles.btn} ${crudStyles.btnDanger}`}
                          onClick={(e) => onDelete(p, e)}
                          title="Delete presentation"
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

      {confirmOpen && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox} ref={confirmRef}>
            <p>Notify users about this upload?</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => onUpload(true)}
                className={styles.uploadBtn}
              >
                Yes, Notify
              </button>
              <button
                type="button"
                onClick={() => onUpload(false)}
                className={`${styles.uploadBtn} ${styles.secondary}`}
              >
                No, Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className={styles.modalOverlay} onClick={closePreview}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closePreview}>×</button>
            {previewUrl && (
              <SecurePdfPreview fileUrl={previewUrl} maxPages={null} allowTextSelection={true} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadPresentation;
