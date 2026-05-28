import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../Astyles/uploadPresentation.module.css';
import crudStyles from '../Astyles/AdminCrudTwoCol.module.css';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { Helmet } from 'react-helmet';
import { useLoading } from '../context/LoadingContext';
import { useAuth } from '../context/AuthContext';
import GraduationCapLoader from './GraduationCapLoader';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 7;

const UploadPresentation = () => {
  const { loading, startLoading, stopLoading } = useLoading();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [reports, setReports] = useState([]);
  const [program, setProgram] = useState(String(user?.program || 'HND').toUpperCase());
  const [report_id, setReportId] = useState(null); // null for random
  const [title, setTitle] = useState('');
  const [presenterName, setPresenterName] = useState('');
  const [presenterEmail, setPresenterEmail] = useState('');
  const [presentationFile, setPresentationFile] = useState(null);
  const [popupVisible, setPopupVisible] = useState(false);

  const [presentations, setPresentations] = useState([]);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);

  const clearForm = () => {
    setActiveId(null);
    setReportId(null);
    setTitle('');
    setPresenterName('');
    setPresenterEmail('');
    setPresentationFile(null);
  };

  const selectForEdit = (p) => {
    const id = p?.presentation_id || p?._id;
    if (!id) return;
    setActiveId(String(id));
    setProgram(String(p.program || 'HND').toUpperCase());
    setReportId(p.report_id || null);
    setTitle(p.title || '');
    setPresenterName(p.presenter_name || '');
    setPresenterEmail(p.presenter_email || '');
    setPresentationFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Fetch reports - mount only, no retry on failure */
  useEffect(() => {
    let cancelled = false;
    const fetchReports = async () => {
      try {
        startLoading();
        const res = await api.get(`/admin/reports?program=${encodeURIComponent(program)}`);
        if (!cancelled) setReports(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, 'Failed to load reports. Check connection and try again.'), 'error');
      } finally {
        stopLoading();
      }
    };
    fetchReports();
    return () => { cancelled = true; };
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

  useEffect(() => {
    fetchPresentations();
  }, [fetchPresentations]);

  // Handle report selection
  const handleReportChange = (e) => {
    const selectedId = e.target.value || null; // null for random
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
      // Random / Not linked
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

  // Handle presentation upload
  const handleUpload = async (notify) => {
    if (!title || !presenterName || !presenterEmail || !presentationFile) {
      showToast('All fields are required', 'warning');
      return;
    }

    startLoading();
    const formData = new FormData();
    formData.append('report_id', report_id || ''); // '' triggers backend null
    formData.append('title', title);
    formData.append('presenter_name', presenterName);
    formData.append('presenter_email', presenterEmail);
    formData.append('program', program);
    formData.append('presentationFile', presentationFile);
    formData.append('notify', notify ? 'true' : 'false');

    try {
      const res = await api.post(
        '/admin/upload-presentation',
        formData
      );

      if (res.data.success) {
        showToast('Presentation uploaded successfully!', 'success');
        resetForm();
      } else {
        showToast(res.data.message || 'Upload failed', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Upload error occurred. Please try again.'), 'error');
    } finally {
      stopLoading();
    }

    setPopupVisible(false);
  };

  const handleUpdate = async () => {
    if (!activeId) return;
    if (!title || !presenterName || !presenterEmail) {
      showToast('All fields are required', 'warning');
      return;
    }

    try {
      startLoading();
      const payload = {
        report_id: report_id || '',
        title: title.trim(),
        presenter_name: presenterName.trim(),
        presenter_email: presenterEmail.trim(),
        program,
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

  const handleDelete = async (p, e) => {
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

  const resetForm = () => {
    clearForm();
  };

  return (
    <div className={crudStyles.page}>
      {loading && <GraduationCapLoader fullscreen label="Uploading presentation… Please wait" />}
      <Helmet>
        <title>Upload Presentation | Admin Panel</title>
      </Helmet>

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

          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
            <div className={styles.field}>
              <label>{t('uploads.reportProgramLabel')}</label>
              <select value={program} onChange={(e) => { setProgram(e.target.value); setReportId(null); }}>
                <option value="HND">{t('common.hnd')}</option>
                <option value="BTS">{t('common.bts')}</option>
              </select>
            </div>

            <div className={styles.field}>
              <label>Link to Report (optional)</label>
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
              <label>Presentation Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label>Presenter Name</label>
                <input
                  type="text"
                  value={presenterName}
                  onChange={(e) => setPresenterName(e.target.value)}
                  required
                />
              </div>

              <div className={styles.field}>
                <label>Presenter Email</label>
                <input
                  type="email"
                  value={presenterEmail}
                  onChange={(e) => setPresenterEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label>Upload PowerPoint</label>
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
              <button type="button" className={styles.uploadBtn} onClick={handleUpdate}>
                Update Presentation
              </button>
            ) : (
              <button type="button" className={styles.uploadBtn} onClick={() => setPopupVisible(true)}>
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
                          Linked report: {p.report_title || 'Standalone'}
                        </div>
                      </div>

                      <div className={crudStyles.actions}>
                        <button
                          type="button"
                          className={`${crudStyles.btn} ${crudStyles.btnDanger}`}
                          onClick={(e) => handleDelete(p, e)}
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

      {popupVisible && (
        <div className={styles.popup}>
          <div className={styles.popupBox}>
            <p>Notify users about this upload?</p>
            <button onClick={() => handleUpload(true)}>Yes</button>
            <button onClick={() => handleUpload(false)}>No</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadPresentation;
