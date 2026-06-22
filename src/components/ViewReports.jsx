import React, { useEffect, useState, useMemo, useCallback } from "react";
import styles from "../Astyles/viewReport.module.css";
import { getErrorMessage } from "../utility/getErrorMessage";
import { FaFileWord, FaFilePdf, FaCalendarAlt, FaBuilding, FaClock, FaRegFileAlt } from "react-icons/fa";
import api from "../services/api";
import GraduationCapLoader from "./GraduationCapLoader";
import { useLocation, useNavigate } from "react-router-dom";
import SecurePdfPreview from "./SecurePdfPreview";
import { showToast } from "../utility/ToastNotification";
import PaymentActionModal from "./PaymentActionModal";

// Remove axios defaults since we're using api service
// axios.defaults.withCredentials = true;

const ViewReport = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [myCounts, setMyCounts] = useState({ downloads: 0, previews: 0 });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionLabel, setActionLabel] = useState("Preparing material...");
  const [previewMeta, setPreviewMeta] = useState({ plan: 'basic', allowCopy: false, pageLimit: null, item: null });
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [linkMenu, setLinkMenu] = useState({ open: false, id: null, title: '', items: [], fallback: false });
  const [topicPopup, setTopicPopup] = useState({ open: false, id: null, topic: '' });
  const [studyLinksByDept, setStudyLinksByDept] = useState({});

  const openTopicPopup = (report) => {
    setTopicPopup({ open: true, id: report.report_id, topic: report.title || 'No topic available' });
  };

  const closeTopicPopup = () => setTopicPopup({ open: false, id: null, topic: '' });

  const isLongTopic = (text) => String(text || '').trim().length > 80;

  useEffect(() => {
    const loadStudyLinks = async () => {
      try {
        const { data } = await api.get('/candidate/question-papers');
        const papers = Array.isArray(data?.papers) ? data.papers : [];
        const map = {};
        papers.forEach((paper) => {
          const links = Array.isArray(paper.study_links) ? paper.study_links : [];
          const valid = links
            .map((ln) => String(ln || '').trim())
            .filter((ln) => /^https?:\/\//i.test(ln));
          (paper.departments || []).forEach((dept) => {
            const deptId = String(dept.dpt_id);
            map[deptId] = map[deptId] || [];
            valid.forEach((link) => {
              if (!map[deptId].includes(link)) map[deptId].push(link);
            });
          });
        });
        setStudyLinksByDept(map);
      } catch (_err) {
        setStudyLinksByDept({});
      }
    };
    loadStudyLinks();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadMyCounts = async () => {
      try {
        const { data } = await api.get('/candidate/analytics/materials/summary?period=week');
        const breakdown = Array.isArray(data?.breakdown) ? data.breakdown : [];
        const rows = breakdown.filter((r) => r.content_type === 'report');
        const downloads = rows.find((r) => r.action === 'download')?.count || 0;
        const previews = rows.find((r) => r.action === 'preview')?.count || 0;
        if (!cancelled) setMyCounts({ downloads, previews });
      } catch (_err) {
        if (!cancelled) setMyCounts({ downloads: 0, previews: 0 });
      }
    };
    loadMyCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Fetch reports - mount only */
  useEffect(() => {
    let cancelled = false;
    const fetchReports = async () => {
      try {
        const { data } = await api.get('/candidate/reports');
        if (!cancelled) setReports(data?.reports || []);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, "Failed to load reports. Check connection and try again."), 'error');
      }
    };
    fetchReports();
    return () => { cancelled = true; };
  }, []);

  // Filter reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) =>
      r.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [reports, search]);

  const extractFileName = useCallback((file) => file?.replace(/\\/g, "/").split("/").pop(), []);

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

  const getMaterialLinks = (report) => {
    if (Array.isArray(report.study_links) && report.study_links.length) {
      return report.study_links
        .map((link) => String(link || '').trim())
        .filter((link) => /^https?:\/\//i.test(link))
        .map((link) => ({ label: link.replace(/^https?:\/\/(www\.)?/, ''), href: link }));
    }

    const fallback = (report.departments || [])
      .flatMap((dept) => studyLinksByDept[String(dept.dpt_id)] || [])
      .filter((link, index, arr) => link && arr.indexOf(link) === index)
      .slice(0, 2)
      .map((link) => ({ label: link.replace(/^https?:\/\/(www\.)?/, ''), href: link }));

    if (fallback.length) return fallback;

    return (report.departments || []).map((department) => ({
      label: department.dpt_name || 'Department',
      href: null,
    }));
  };

  const openLinkMenu = (report) => {
    const items = getMaterialLinks(report);
    if (report.writer_email) {
      items.unshift({
        label: `Contact writer by email (${report.writer_email})`,
        href: `mailto:${report.writer_email}`,
      });
    }
    const hasOwnLinks = Array.isArray(report.study_links) && report.study_links.length;
    setLinkMenu({
      open: true,
      id: report.report_id,
      title: items.length
        ? hasOwnLinks
          ? 'Verified sites to get well structured notes that covers your syllabus'
          : 'Verified sites in your department to support the syllabus'
        : 'No related links found',
      items,
      fallback: !hasOwnLinks,
    });
  };

  const closeLinkMenu = () => setLinkMenu({ open: false, id: null, title: '', items: [], fallback: false });

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    setPreviewMeta({ plan: 'basic', allowCopy: false, pageLimit: null, item: null });
  };

  const handlePreventCopy = (e) => {
    if (previewMeta.allowCopy) return true;
    e.preventDefault();
    return false;
  };

  const handlePreventContextMenu = (e) => {
    if (previewMeta.allowCopy) return true;
    e.preventDefault();
    return false;
  };

  useEffect(() => {
    if (!previewFile || previewMeta.allowCopy) return undefined;

    const handleKeydown = (e) => {
      const key = String(e.key || '').toLowerCase();
      const isClipboardCombo = (e.ctrlKey || e.metaKey) && ['a', 'c', 'x', 's', 'p'].includes(key);
      const isPrintScreen = key === 'printscreen';
      if (isClipboardCombo || isPrintScreen) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleSelectStart = (e) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('selectstart', handleSelectStart, true);

    return () => {
      window.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('selectstart', handleSelectStart, true);
    };
  }, [previewFile, previewMeta.allowCopy]);

  const openPaymentModal = (config) => {
    setPaymentRequest(config);
  };

  const parseErrorPayload = async (err) => {
    const payload = err?.response?.data;
    if (!payload) return null;
    if (payload instanceof Blob) {
      try {
        const text = await payload.text();
        return text ? JSON.parse(text) : null;
      } catch (_) {
        return null;
      }
    }
    if (typeof payload === 'object') return payload;
    return null;
  };

  const createMaterialPaymentRequest = (report, action, requirement) => ({
    title: requirement?.title || (action === 'download' ? 'Unlock report download' : 'Unlock full report preview'),
    description: requirement?.message || (action === 'download'
      ? 'PAYGO requires a separate payment before you can download this report.'
      : 'PAYGO requires a separate payment before you can preview every page of this report.'),
    amount: requirement?.amount || 100,
    currency: requirement?.currency || 'XAF',
    onStartPayment: async ({ phoneNumber, paymentMethod = 'momo', promoCode = '' }) => {
      const { data } = await api.post('/candidate/payments/materials/checkout', {
        resourceType: 'report',
        resourceId: report.report_id,
        action,
        paymentMethod,
        phoneNumber,
        promoCode,
        referralCode: promoCode,
      });
      return data;
    },
    onSuccess: async () => {
      if (action === 'download') await handleDownload(report, { skipPaymentHandling: true });
      else await handlePreview(report, { skipPaymentHandling: true });
    },
  });

  const handlePreview = async (report, options = {}) => {
    const requested = String(report?.file_path || '').trim();
    if (!requested) return;

    setActionLabel('Preparing report preview...');
    setActionLoading(true);
    try {
      const safeFile = encodeURIComponent(requested);
      const res = await api.get(`/candidate/reports/preview/${safeFile}`, {
        responseType: 'blob',
        timeout: 120000,
      });

      const blob = res.data instanceof Blob
        ? new Blob([res.data], { type: 'application/pdf' })
        : new Blob([res.data], { type: 'application/pdf' });

      const url = URL.createObjectURL(blob);
      setPreviewFile(extractFileName(requested) || 'report');
      setPreviewUrl(url);
      setPreviewMeta({
        plan: String(res.headers['x-subscription-plan'] || 'basic').toLowerCase(),
        allowCopy: String(res.headers['x-allow-copy'] || 'false').toLowerCase() === 'true',
        pageLimit: res.headers['x-preview-page-limit'] === 'full' ? null : Number(res.headers['x-preview-page-limit'] || 0) || null,
        item: report,
      });
    } catch (err) {
      const errorData = await parseErrorPayload(err);
      if (!options.skipPaymentHandling && err?.response?.status === 402 && errorData?.payment_requirement) {
        openPaymentModal(createMaterialPaymentRequest(report, 'preview', errorData.payment_requirement));
        return;
      }
      if (err?.response?.status === 403 && errorData?.code === 'PLAN_UPGRADE_REQUIRED') {
        showToast(errorData.message || 'Upgrade your subscription to continue.', 'warning');
        navigate('/candidate/subscription');
        return;
      }
      if (err?.response?.status === 403 && errorData?.message) {
        showToast(errorData.message, 'warning');
        return;
      }
      showToast(getErrorMessage(err, errorData?.message || 'Failed to preview report.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (report, options = {}) => {
    const requested = String(report?.file_path || '').trim();
    if (!requested) return;

    setActionLabel('Preparing report download...');
    setActionLoading(true);
    try {
      const safeFile = encodeURIComponent(requested);
      const res = await api.get(`/candidate/reports/file/${safeFile}`, {
        responseType: 'blob',
      });
      const filename = extractFileName(requested) || 'report';
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast('Download started', 'success');
    } catch (err) {
      const errorData = await parseErrorPayload(err);
      if (!options.skipPaymentHandling && err?.response?.status === 402 && errorData?.payment_requirement) {
        openPaymentModal(createMaterialPaymentRequest(report, 'download', errorData.payment_requirement));
        return;
      }
      if (err?.response?.status === 403 && errorData?.code === 'PLAN_UPGRADE_REQUIRED') {
        showToast(errorData.message || 'Upgrade your subscription to continue.', 'warning');
        navigate('/candidate/subscription');
        return;
      }
      if (err?.response?.status === 403 && errorData?.message) {
        showToast(errorData.message, 'warning');
        return;
      }
      showToast(getErrorMessage(err, errorData?.message || 'Failed to download report.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!reports.length) return;

    const params = new URLSearchParams(location.search);
    const reportId = String(params.get('reportId') || '').trim();
    if (!reportId) return;

    const linkedReport = reports.find((r) => String(r.report_id) === reportId);
    if (linkedReport?.title) {
      setSearch(linkedReport.title);
    }

    navigate('/candidate/reports', { replace: true });
    // handlePreview intentionally omitted to avoid re-triggering this deep-link effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, location.search, navigate]);

  return (
    <>
      {actionLoading ? <GraduationCapLoader fullscreen label={actionLabel} /> : null}
      <div className={styles.container}>
      <h2 className={styles.heading}>Reports</h2>
      <p className={styles.noResults}>
        Your activity (last 7 days): Downloads {myCounts.downloads} • Previews {myCounts.previews}
      </p>

      <div className={styles.filterBox}>
        <input
          type="text"
          placeholder="Search report..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.input}
        />
      </div>

      <div className={styles.reportList}>
        {filteredReports.length === 0 ? (
          <p className={styles.noResults}>No report found.</p>
        ) : (
          filteredReports.map((r) => (
            <div key={r.report_id} className={styles.card}>
              <div className={styles.cardRow}>
                <div className={styles.cardSummary}>
                  <div className={styles.iconBlock}>
                    {r.file_path?.endsWith('.pdf') ? (
                      <FaFilePdf className={styles.fileIcon} />
                    ) : (
                      <FaFileWord className={styles.fileIcon} />
                    )}
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.badgeRow}>
                      <div className={styles.cardBadge}>Report</div>
                    </div>
                    <div className={styles.titleRow}>
                      <h3 className={styles.title}>{r.title}</h3>
                      {isLongTopic(r.title) && (
                        <button type="button" className={styles.readAllLink} onClick={() => openTopicPopup(r)}>
                          Read All
                        </button>
                      )}
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.chip}><FaCalendarAlt className={styles.chipIcon} /> {new Date(r.upload_date).getFullYear()}</span>
                      <span className={styles.chip}><FaBuilding className={styles.chipIcon} /> {(r.departments || [])[0]?.dpt_name || r.audience || 'General'}</span>
                      <span className={styles.chip}><FaRegFileAlt className={styles.chipIcon} /> {r.pages || 'N/A'} pages</span>
                      <span className={styles.chip}><FaClock className={styles.chipIcon} /> {formatTimeAgo(r.upload_date)}</span>
                    </div>
                    <div className={styles.meta}>
                      {r.writer_names || 'Unknown author'}
                      {r.writer_email ? ` • ${r.writer_email}` : ''}
                    </div>
                  </div>
                </div>

                <div className={styles.actionGroup}>
                  <button
                    type="button"
                    className={styles.menuButton}
                    onClick={() => linkMenu.open && linkMenu.id === r.report_id ? closeLinkMenu() : openLinkMenu(r)}
                  >
                    ⋯
                  </button>
                  <button className={`${styles.textAction} ${styles.primaryAction}`} onClick={() => handlePreview(r)}>Preview</button>
                  <button className={`${styles.textAction} ${styles.primaryAction}`} onClick={() => handleDownload(r)}>Download</button>
                  <button className={`${styles.textAction}`} onClick={async () => {
                    try {
                      const payload = { resourceType: 'report', filename: r.file_path, resourceId: r.report_id };
                      const { data } = await api.post('/candidate/reports/save', payload);
                      showToast(data?.message || 'Saved to My Downloads', 'success');
                    } catch (err) {
                      const errMsg = (err?.response?.data && err.response.data.message) || err.message || 'Failed to save';
                      showToast(errMsg, 'error');
                    }
                  }}>Save</button>
                </div>
              </div>

              {linkMenu.open && linkMenu.id === r.report_id && (
                <div className={styles.linkMenu}>
                  <div className={styles.linkMenuTitle}>{linkMenu.title}</div>
                  <div className={styles.linkMenuSubtitle}>Verified sites to get well structured notes that covers your syllabus.</div>
                  {linkMenu.items.length ? (
                    linkMenu.items.map((item, index) => (
                      <div key={index} className={styles.linkMenuItem}>
                        {item.href ? (
                          <a href={item.href} target="_blank" rel="noreferrer" className={styles.linkMenuLink}>
                            {item.label}
                          </a>
                        ) : (
                          <span>{item.label}</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className={styles.linkMenuItem}>No related links found.</div>
                  )}
                  <button type="button" className={styles.linkMenuClose} onClick={closeLinkMenu}>Close</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {topicPopup.open && (
        <div className={styles.topicPopupOverlay} onClick={closeTopicPopup}>
          <div className={styles.topicPopupBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.topicPopupHeader}>Full topic</div>
            <p className={styles.topicPopupText}>{topicPopup.topic}</p>
            <button type="button" className={styles.topicPopupClose} onClick={closeTopicPopup}>Close</button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div
          className={styles.modalOverlay}
          onClick={closePreview}
          onContextMenu={handlePreventContextMenu}
        >
          <div
            className={styles.modalBox}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={handlePreventContextMenu}
            onCopy={handlePreventCopy}
            onCut={handlePreventCopy}
            onDrag={handlePreventCopy}
            onSelectStart={handlePreventCopy}
          >
            <button
              className={styles.modalClose}
              onClick={closePreview}
            >
              ×
            </button>
            {previewUrl && (
              <>
                {previewMeta.pageLimit ? (
                  <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: '#f5f9fc', color: '#18415c' }}>
                    Preview limited to the first {previewMeta.pageLimit} page{previewMeta.pageLimit > 1 ? 's' : ''} on your current plan.
                    <div style={{ marginTop: 10 }}>
                      {previewMeta.plan === 'paygo' ? (
                        <button
                          type="button"
                          className={styles.previewBtn}
                          onClick={() => openPaymentModal(createMaterialPaymentRequest(previewMeta.item, 'preview'))}
                        >
                          Unlock full preview
                        </button>
                      ) : (
                        <button type="button" className={styles.previewBtn} onClick={() => navigate('/candidate/subscription')}>
                          Upgrade plan
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
                <SecurePdfPreview
                  fileUrl={previewUrl}
                  onContextMenu={handlePreventContextMenu}
                  onCopy={handlePreventCopy}
                  onCut={handlePreventCopy}
                  onDrag={handlePreventCopy}
                  maxPages={previewMeta.pageLimit}
                  allowTextSelection={previewMeta.allowCopy}
                />
              </>
            )}
          </div>
        </div>
      )}

      </div>

      <PaymentActionModal
        isOpen={Boolean(paymentRequest)}
        title={paymentRequest?.title || ''}
        description={paymentRequest?.description || ''}
        amount={paymentRequest?.amount || 0}
        currency={paymentRequest?.currency || 'XAF'}
        onClose={() => setPaymentRequest(null)}
        onStartPayment={paymentRequest?.onStartPayment}
        onSuccess={async (result) => {
          await paymentRequest?.onSuccess?.(result);
          setPaymentRequest(null);
        }}
      />
    </>
  );
};

export default ViewReport;
