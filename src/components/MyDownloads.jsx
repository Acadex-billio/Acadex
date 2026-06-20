import React, { useEffect, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/pastQuestion.module.css';
import GraduationCapLoader from './GraduationCapLoader';
import SecurePdfPreview from './SecurePdfPreview';
import { showToast } from '../utility/ToastNotification';
import { FaFilePdf, FaClock } from 'react-icons/fa';

const MyDownloads = () => {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/candidate/downloads');
        if (cancelled) return;
        const rows = Array.isArray(res.data?.downloads) ? res.data.downloads : [];
        setDownloads(rows);
      } catch (err) {
        showToast('Failed to load downloads', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handlePreview = async (fileRef, title) => {
    if (!fileRef) return showToast('No file reference available', 'warning');
    try {
      setLoading(true);
      const safeFile = encodeURIComponent(fileRef);
      const res = await api.get(`/candidate/question-papers/preview/${safeFile}`, { responseType: 'blob' });
      const blob = res.data instanceof Blob ? new Blob([res.data], { type: 'application/pdf' }) : new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      // store title in preview (not used elsewhere)
      setPreviewUrl(url);
    } catch (err) {
      showToast('Unable to preview file', 'error');
    } finally {
      setLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>My Downloads</h2>
      {loading ? <GraduationCapLoader fullscreen label="Loading downloads…" /> : null}

      {!loading && downloads.length === 0 ? (
        <p className={styles.noResults}>You have not saved any downloads yet.</p>
      ) : null}

      <div className={styles.paperList}>
        {downloads.map((d, idx) => (
          <div key={idx} className={styles.paperCard}>
            <div className={styles.cardRow}>
              <div className={styles.cardSummary}>
                <div className={styles.iconBlock}><FaFilePdf className={styles.fileIcon} /></div>
                <div className={styles.cardContent}>
                  <div className={styles.titleRow}>
                    <h3 className={styles.title}>{d.title}</h3>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.chip}><FaClock className={styles.chipIcon} /> {new Date(d.downloaded_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className={styles.actionGroup}>
                <button className={`${styles.textAction} ${styles.primaryAction}`} onClick={() => handlePreview(d.file, d.title)}>Preview</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {previewUrl && (
        <div className={styles.modalOverlay} onClick={closePreview}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closePreview}>×</button>
            <SecurePdfPreview fileUrl={previewUrl} maxPages={null} allowTextSelection={true} />
          </div>
        </div>
      )}
    </div>
  );
};

export default MyDownloads;
