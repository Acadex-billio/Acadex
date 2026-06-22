import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import SecurePdfPreview from './SecurePdfPreview';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import styles from '../Astyles/myDownloads.module.css';
import { FaFilePdf, FaFileWord, FaFilePowerpoint, FaBook, FaTrash, FaEye } from 'react-icons/fa';

const MyDownloads = () => {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewMeta, setPreviewMeta] = useState({ allowCopy: false, pageLimit: null, item: null });
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [{ data: dl }, { data: historyData }] = await Promise.all([
          api.get('/candidate/downloads'),
          user ? api.get(`/candidate/history/${encodeURIComponent(user.cand_id)}?action=save`) : Promise.resolve({ data: { logs: [] } }),
        ]);

        const downloadsList = Array.isArray(dl?.downloads) ? dl.downloads : [];
        const historySaved = Array.isArray(historyData?.logs) ? historyData.logs.filter((l) => String(l.content_type) === 'internship_topic') : [];

        // merge internship topics as separate items
        const internshipItems = historySaved.map((h) => ({ id: String(h.history_id), title: h.content_title, resource_type: 'internship_topic', timestamp: h.timestamp }));

        if (!cancelled) setDownloads([...downloadsList, ...internshipItems]);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, 'Unable to load My Downloads'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleStream = (item) => {
    if (!item || !item.id) return;
    // Open the stream URL in a new tab — server verifies grant
    const streamUrl = `/api/candidate/downloads/${item.id}/file`;
    window.open(streamUrl, '_blank');
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    setPreviewMeta({ allowCopy: false, pageLimit: null, item: null });
  };

  const handleOpen = async (item) => {
    if (!item) return;
    if (item.resource_type === 'question_paper') {
      // fetch preview blob and open modal like QuestionPapers
      try {
        const requested = String(item.filename || '').trim();
        if (!requested) return showToast('Unable to open paper', 'error');
        const safeFile = encodeURIComponent(requested);
        const res = await api.get(`/candidate/question-papers/preview/${safeFile}`, { responseType: 'blob' });
        const blob = res.data instanceof Blob ? new Blob([res.data], { type: 'application/pdf' }) : new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPreviewFile((item.title || item.filename) || 'question-paper');
        setPreviewUrl(url);
        setPreviewMeta({ allowCopy: String(res.headers['x-allow-copy'] || 'false').toLowerCase() === 'true', pageLimit: res.headers['x-preview-page-limit'] === 'full' ? null : Number(res.headers['x-preview-page-limit'] || 0) || null, item });
      } catch (err) {
        showToast(getErrorMessage(err, 'Unable to open question paper'), 'error');
      }
      return;
    }

    if (item.resource_type === 'report') {
      navigate(`/candidate/reports?reportId=${encodeURIComponent(String(item.resource_id || item.id))}`);
      return;
    }

    if (item.resource_type === 'presentation') {
      navigate(`/candidate/presentations?presentationId=${encodeURIComponent(String(item.resource_id || item.id))}`);
      return;
    }

    if (item.resource_type === 'internship_topic') {
      navigate(`/candidate/internship-topics?topicId=${encodeURIComponent(String(item.id))}`);
      return;
    }
  };

  const handleDelete = async (item) => {
    if (!item || !item.id) return;
    const confirmed = window.confirm(`Remove "${item.title || item.filename}" from My Downloads?`);
    if (!confirmed) return;

    try {
      await api.delete(`/candidate/downloads/${item.id}`);
      setDownloads((prev) => prev.filter((d) => d.id !== item.id));
      showToast('Download removed', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to remove download'), 'error');
    }
  };

  if (loading) return <div className={styles.container}><div className={styles.loading}>Loading...</div></div>;
  if (!downloads.length) return <div className={styles.container}><div className={styles.empty}>No saved downloads.</div></div>;

  const papers = downloads.filter((d) => d.resource_type === 'question_paper');
  const reports = downloads.filter((d) => d.resource_type === 'report');
  const presentations = downloads.filter((d) => d.resource_type === 'presentation');
  const internships = downloads.filter((d) => d.resource_type === 'internship_topic');

  const renderItem = (item, showDownload = true, showDelete = true) => (
    <div key={item.id} className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.titleSection}>
          <div className={styles.iconWrapper}>
            {item.resource_type === 'question_paper' && <FaFilePdf className={styles.icon} />}
            {item.resource_type === 'report' && <FaFileWord className={styles.icon} />}
            {item.resource_type === 'presentation' && <FaFilePowerpoint className={styles.icon} />}
            {item.resource_type === 'internship_topic' && <FaBook className={styles.icon} />}
          </div>
          <div>
            <h5 className={styles.title}>{item.title || item.filename}</h5>
            <p className={styles.meta}>
              {item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}` : (item.timestamp ? `Saved ${new Date(item.timestamp).toLocaleDateString()}` : '')}
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={() => handleOpen(item)} title="View">
            <FaEye /> Open
          </button>
          {showDelete && (
            <button className={styles.dangerBtn} onClick={() => handleDelete(item)} title="Delete">
              <FaTrash /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>My Downloads</h2>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Question Papers ({papers.length})</h3>
        {papers.length === 0 ? (
          <div className={styles.empty}>No saved question papers.</div>
        ) : (
          <div className={styles.grid}>
            {papers.map((d) => renderItem(d, false, true))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Reports ({reports.length})</h3>
        {reports.length === 0 ? (
          <div className={styles.empty}>No saved reports.</div>
        ) : (
          <div className={styles.grid}>
            {reports.map((d) => renderItem(d, false, true))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Presentations ({presentations.length})</h3>
        {presentations.length === 0 ? (
          <div className={styles.empty}>No saved presentations.</div>
        ) : (
          <div className={styles.grid}>
            {presentations.map((d) => renderItem(d, false, true))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Internship Topics ({internships.length})</h3>
        {internships.length === 0 ? (
          <div className={styles.empty}>No saved topics.</div>
        ) : (
          <div className={styles.grid}>
            {internships.map((d) => renderItem(d, false, true))}
          </div>
        )}
      </section>

      {/* Preview Modal */}
      {previewFile && (
        <div className={styles.modal} onClick={closePreview}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{previewFile}</h3>
              <button className={styles.closeBtn} onClick={closePreview}>✕</button>
            </div>
            {previewUrl && (
              <SecurePdfPreview
                fileUrl={previewUrl}
                maxPages={previewMeta.pageLimit}
                allowTextSelection={previewMeta.allowCopy}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyDownloads;
