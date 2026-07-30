import React, { useEffect, useState } from 'react';
import styles from '../Astyles/viewReport.module.css';
import api from '../services/api';
import { FaFilePdf, FaCalendarAlt, FaBuilding, FaClock, FaRegFileAlt, FaEllipsisV } from 'react-icons/fa';
import { showToast } from '../utility/ToastNotification';
import SecurePdfPreview from './SecurePdfPreview';
import GraduationCapLoader from './GraduationCapLoader';
import { useAuth } from '../context/AuthContext';

const formatTimeAgo = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
};

const CandidateReportGuides = () => {
  const { user: authUser } = useAuth();
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/candidate/reports/guides');
        if (!cancelled) setGuides(Array.isArray(data?.guides) ? data.guides : []);
      } catch (err) {
        if (!cancelled) showToast('Failed to load guides', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openPreview = async (guide) => {
    try {
      setLoading(true);
      const safe = encodeURIComponent(String(guide.file_path || ''));
      const res = await api.get(`/candidate/reports/preview/${safe}`, { responseType: 'blob' });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewFile(guide.title || 'Guide');
      setPreviewUrl(url);
    } catch (err) {
      showToast('Failed to open guide preview', 'error');
    } finally {
      setLoading(false);
    }
  };

  const normalizePlan = (plan) => String(plan || 'basic').toLowerCase();

  const formatPageLabel = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return `${parsed} ${parsed === 1 ? 'page' : 'pages'}`;
    }
    const text = String(value).trim();
    return text ? text : null;
  };

  const getDownloadPriceMeta = (item, plan) => {
    const normalizedPlan = normalizePlan(plan);
    const fallbackPrice = Number(item?.material_price ?? item?.subscription_access?.paygo_download_price ?? 0);
    if (['full-package', 'pro'].includes(normalizedPlan)) {
      return 'Included with your plan';
    }
    if (Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
      return `Download ${fallbackPrice.toLocaleString()} XAF`;
    }
    return 'Free guide';
  };

  const downloadGuide = async (guide) => {
    try {
      setLoading(true);
      const safe = encodeURIComponent(String(guide.file_path || ''));
      const res = await api.get(`/candidate/reports/file/${safe}`, { responseType: 'blob' });
      const filename = (guide.file_path || '').split('/').pop() || 'guide.pdf';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Download started', 'success');
    } catch (err) {
      showToast('Failed to download guide', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {loading ? <GraduationCapLoader fullscreen label="Loading guides…" /> : null}
      <section className={styles.heroPanel}>
        <h2 className={styles.heading}>Reports</h2>
        <p className={styles.heroSubtitle}>Report Guides</p>
      </section>

      <div className={styles.reportList}>
        {guides.length === 0 ? (
          <p className={styles.noResults}>No guides found.</p>
        ) : (
          guides.map((g) => (
            <div key={g.report_id} className={styles.card}>
              <div className={styles.headerRow}>
                <div className={styles.cardBadge}>Report Writing Guide</div>
                <button type="button" className={styles.menuButton} title="Guide actions">
                  <FaEllipsisV />
                </button>
              </div>

              <div className={styles.previewThumbnail}>
                <div className={styles.thumbnailPlaceholder}>
                  <div className={styles.thumbnailAccent} />
                  <div className={styles.thumbnailContent}>
                    <FaFilePdf className={styles.thumbnailIcon} />
                    <span className={styles.thumbnailLabel}>Study guide</span>
                  </div>
                </div>
              </div>

              <div className={styles.titleRow}>
                <h3 className={styles.cardTitle}>{`REPORT WRITING GUIDE FOR ${((g.departments||[])[0]?.dpt_name || g.program || '').toUpperCase()}`}</h3>
              </div>

              <div className={styles.presenterRow}>
                <FaBuilding className={styles.presenterIcon} />
                <span className={styles.presenterName}>{(g.departments || [])[0]?.dpt_name || 'General'}</span>
              </div>

              <div className={styles.metadataRow}>
                <span className={styles.metaChip}><FaCalendarAlt className={styles.metaIcon} /> {g.program}</span>
                {formatPageLabel(g.pages) ? (
                  <span className={styles.metaChip}><FaRegFileAlt className={styles.metaIcon} /> {formatPageLabel(g.pages)}</span>
                ) : null}
                <span className={styles.metaChip}><FaClock className={styles.metaIcon} /> {formatTimeAgo(g.upload_date)}</span>
              </div>

              <div className={styles.metadataRow2}>
                <span className={styles.priceTag}>
                  <span className={styles.priceValue}>{getDownloadPriceMeta(g, authUser?.subscription?.plan)}</span>
                </span>
              </div>

              <div className={styles.actions}>
                <button className={styles.previewBtn} onClick={() => openPreview(g)}>View</button>
                <button className={styles.downloadBtn} onClick={() => downloadGuide(g)}>Download</button>
              </div>

              <div className={styles.meta}>{g.writer_names || 'Acadex'}</div>
            </div>
          ))
        )}
      </div>

      {previewUrl && (
        <div className={styles.modalOverlay} onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setPreviewFile(null); }}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setPreviewFile(null); }}>×</button>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>
              <strong>{previewFile || 'Guide'}</strong>
            </div>
            <SecurePdfPreview fileUrl={previewUrl} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateReportGuides;
