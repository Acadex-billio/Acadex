import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import styles from '../Astyles/pastQuestion.module.css';
import { getErrorMessage } from '../utility/getErrorMessage';
import GraduationCapLoader from './GraduationCapLoader';
import { showToast } from '../utility/ToastNotification';
import PaymentActionModal from './PaymentActionModal';
import SecurePdfPreview from './SecurePdfPreview';
import { FaFilePdf, FaCalendarAlt, FaBuilding, FaClock, FaRegFileAlt, FaSearch, FaRegChartBar } from 'react-icons/fa';

const PAPER_TYPE_LABELS = {
  hnd: 'HND Papers',
  ca: 'CA Papers',
  exam: 'Exam Papers',
  mock: 'Mock Papers',
};

const QuestionPapersType = () => {
  const navigate = useNavigate();
  const { paperType } = useParams();
  const [papers, setPapers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [myCounts, setMyCounts] = useState({ downloads: 0, previews: 0 });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionLabel, setActionLabel] = useState('Preparing material...');
  const [previewMeta, setPreviewMeta] = useState({ plan: 'basic', allowCopy: false, pageLimit: null, item: null });
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [linkMenu, setLinkMenu] = useState({ open: false, id: null, title: '', items: [], fallback: false });
  const [topicPopup, setTopicPopup] = useState({ open: false, id: null, topic: '' });

  const loadPapers = async () => {
    try {
      const { data } = await api.get(`/candidate/question-papers?paper_type=${encodeURIComponent(paperType)}`);
      setPapers(Array.isArray(data?.papers) ? data.papers : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to load question papers. Check connection and try again.'), 'error');
    }
  };

  const loadDepartments = async () => {
    try {
      const { data } = await api.get('/candidate/departments');
      setDepartments(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to load departments. Check connection and try again.'), 'error');
    }
  };

  const loadMyCounts = async () => {
    try {
      const { data } = await api.get('/candidate/analytics/materials/summary?period=week');
      const breakdown = Array.isArray(data?.breakdown) ? data.breakdown : [];
      const qp = breakdown.filter((r) => r.content_type === 'question_paper');
      const downloads = qp.find((r) => r.action === 'download')?.count || 0;
      const previews = qp.find((r) => r.action === 'preview')?.count || 0;
      setMyCounts({ downloads, previews });
    } catch (_) {
      setMyCounts({ downloads: 0, previews: 0 });
    }
  };

  useEffect(() => {
    loadDepartments();
    loadPapers();
    loadMyCounts();
  }, [paperType]);

  const isLongTopic = (text) => String(text || '').trim().length > 80;
  const extractFileName = (file) => String(file || '').replace(/\\/g, '/').split('/').pop();
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

  const filteredPapers = useMemo(() => {
    return papers.filter((p) => {
      if (search && !p.paper_title.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedDept && !p.departments.some((d) => String(d.dpt_id) === selectedDept)) return false;
      if (selectedYear && String(p.hnd_year) !== selectedYear) return false;
      return true;
    });
  }, [papers, search, selectedDept, selectedYear]);

  const openTopicPopup = (paper) => {
    setTopicPopup({ open: true, id: paper.qp_id, topic: paper.paper_title || 'No title available' });
  };

  const closeTopicPopup = () => setTopicPopup({ open: false, id: null, topic: '' });
  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    setPreviewMeta({ plan: 'basic', allowCopy: false, pageLimit: null, item: null });
  };

  const handlePreview = async (paper) => {
    const requested = String(paper?.paper_file || '').trim();
    if (!requested) return;
    setActionLabel('Preparing question paper preview...');
    setActionLoading(true);
    try {
      const safeFile = encodeURIComponent(requested);
      const res = await api.get(`/candidate/question-papers/preview/${safeFile}`, { responseType: 'blob' });
      const blob = res.data instanceof Blob ? new Blob([res.data], { type: 'application/pdf' }) : new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewFile(extractFileName(requested) || 'question-paper');
      setPreviewUrl(url);
      setPreviewMeta({
        plan: String(res.headers['x-subscription-plan'] || 'basic').toLowerCase(),
        allowCopy: String(res.headers['x-allow-copy'] || 'false').toLowerCase() === 'true',
        pageLimit: res.headers['x-preview-page-limit'] === 'full' ? null : Number(res.headers['x-preview-page-limit'] || 0) || null,
        item: paper,
      });
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to preview file'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (paper) => {
    setActionLabel('Preparing question paper download...');
    setActionLoading(true);
    try {
      const requested = String(paper?.paper_file || '').trim();
      if (!requested) return;
      const safeFile = encodeURIComponent(requested);
      const response = await api.get(`/candidate/question-papers/file/${safeFile}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = extractFileName(requested) || 'question-paper';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Download started', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to download file'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!previewFile || previewMeta.allowCopy) return undefined;
    const handleKeydown = (e) => {
      const key = String(e.key || '').toLowerCase();
      const isClipboardCombo = (e.ctrlKey || e.metaKey) && ['a', 'c', 'x', 's', 'p'].includes(key);
      if (isClipboardCombo || key === 'printscreen') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const handleSelectStart = (e) => e.preventDefault();
    window.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('selectstart', handleSelectStart, true);
    return () => {
      window.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('selectstart', handleSelectStart, true);
    };
  }, [previewFile, previewMeta.allowCopy]);

  const pageTitle = PAPER_TYPE_LABELS[paperType] || 'Question Papers';

  return (
    <>
      {actionLoading ? <GraduationCapLoader fullscreen label={actionLabel} /> : null}
      <div className={styles.container}>
        <section className={styles.heroPanel}>
          <h2 className={styles.heading}>{pageTitle}</h2>
          <p className={styles.heroSubtitle}>Access past papers to practice smarter and excel in your exams.</p>
          <div className={styles.activityPill}>
            <FaRegChartBar className={styles.activityIcon} />
            <span>Your activity (last 7 days):</span>
            <strong>Downloads {myCounts.downloads}</strong>
            <span className={styles.activityDivider}>|</span>
            <span>Previews {myCounts.previews}</span>
          </div>
          <div className={styles.filterBox}>
            <div className={styles.filterField}>
              <FaSearch className={styles.filterIcon} />
              <input type="text" value={search} placeholder="Search by title..." onChange={(e) => setSearch(e.target.value)} className={styles.input} />
            </div>
            <div className={styles.filterField}>
              <FaBuilding className={styles.filterIcon} />
              <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className={styles.select}>
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.dpt_id} value={d.dpt_id}>{d.department_name}</option>
                ))}
              </select>
            </div>
            <div className={styles.filterField}>
              <FaCalendarAlt className={styles.filterIcon} />
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className={styles.select}>
                <option value="">All Years</option>
                {[2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <div className={styles.paperList}>
          {filteredPapers.length === 0 ? (
            <p className={styles.noResults}>No matching question papers found.</p>
          ) : (
            filteredPapers.map((p) => (
              <div key={p.qp_id} className={styles.paperCard}>
                <div className={styles.cardRow}>
                  <div className={styles.cardSummary}>
                    <div className={styles.iconBlock}><FaFilePdf className={styles.fileIcon} /></div>
                    <div className={styles.cardContent}>
                      <div className={styles.titleRow}>
                        <h3 className={styles.title}>{p.paper_title}</h3>
                        {isLongTopic(p.paper_title) && (
                          <button type="button" className={styles.readAllLink} onClick={() => openTopicPopup(p)}>Read All</button>
                        )}
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.chip}><FaCalendarAlt className={styles.chipIcon} /> Year {p.hnd_year}</span>
                        <span className={styles.chip}><FaBuilding className={styles.chipIcon} /> {p.departments.map((d) => d.dpt_name).join(', ') || 'General'}</span>
                        <span className={styles.chip}><FaRegFileAlt className={styles.chipIcon} /> Pages: N/A</span>
                        <span className={styles.chip}><FaClock className={styles.chipIcon} /> {formatTimeAgo(p.upload_date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.actionGroup}>
                    <button type="button" className={styles.menuButton} onClick={() => linkMenu.open && linkMenu.id === p.qp_id ? setLinkMenu({ ...linkMenu, open: false }) : setLinkMenu({ open: true, id: p.qp_id, title: 'Resource Links', items: [], fallback: false })}>⋯</button>
                    <button className={`${styles.textAction} ${styles.primaryAction}`} onClick={() => handlePreview(p)}>Preview</button>
                    <button className={`${styles.textAction} ${styles.primaryAction}`} onClick={() => handleDownload(p)}>Download</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {topicPopup.open && (
          <div className={styles.topicPopupOverlay} onClick={closeTopicPopup}>
            <div className={styles.topicPopupBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.topicPopupHeader}>Full title</div>
              <div className={styles.topicPopupBody}>{topicPopup.topic}</div>
              <button type="button" className={styles.topicPopupClose} onClick={closeTopicPopup}>Close</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default QuestionPapersType;
