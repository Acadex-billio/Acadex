import React, { useEffect, useState, useMemo, useCallback } from "react";
import styles from "../Astyles/viewReport.module.css";
import { getErrorMessage } from "../utility/getErrorMessage";
import { FaFileWord, FaFilePdf, FaCalendarAlt, FaBuilding, FaClock, FaRegFileAlt, FaSearch, FaRegChartBar, FaEllipsisV } from "react-icons/fa";
import api from "../services/api";
import GraduationCapLoader from "./GraduationCapLoader";
import { useLocation, useNavigate } from "react-router-dom";
import SecurePdfPreview from "./SecurePdfPreview";
import { showToast } from "../utility/ToastNotification";
import PaymentActionModal from "./PaymentActionModal";
import { useAuth } from "../context/AuthContext";

// Remove axios defaults since we're using api service
// axios.defaults.withCredentials = true;

const ViewReport = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState('');
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
    const params = new URLSearchParams(location.search);
    const category = String(params.get('category') || '').trim().toUpperCase();
    setFilterCategory(category || '');
  }, [location.search]);

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

  /** Fetch reports - mount and refresh when category changes */
  useEffect(() => {
    let cancelled = false;
    const fetchReports = async () => {
      try {
        const params = new URLSearchParams();
        if (filterCategory) params.set('category', filterCategory);
        const url = `/candidate/reports${params.toString() ? `?${params.toString()}` : ''}`;
        const { data } = await api.get(url);
        if (!cancelled) setReports(data?.reports || []);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, "Failed to load reports. Check connection and try again."), 'error');
      }
    };
    fetchReports();
    return () => { cancelled = true; };
  }, [filterCategory]);

  // Filter reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (filterCategory && String(r.report_category || '').toUpperCase() !== filterCategory) return false;
      return r.title.toLowerCase().includes(search.toLowerCase());
    });
  }, [reports, search, filterCategory]);

  const extractFileName = useCallback((file) => file?.replace(/\\/g, "/").split("/").pop(), []);

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
    return 'Download price available soon';
  };

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
    amount: requirement?.amount || (action === 'download' ? 200 : 150),
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

  const handlePaymentRequired = (report, action, requirement) => {
    const amount = Number(requirement?.amount || (action === 'download' ? 200 : 150));
    const currency = requirement?.currency || 'XAF';
    const actionText = action === 'download' ? 'download' : 'preview';

    showToast(`Payment is required to ${actionText} this report. Redirecting to payment (${amount} ${currency}).`, 'warning');
    openPaymentModal(createMaterialPaymentRequest(report, action, {
      ...(requirement || {}),
      amount,
      currency,
      message: requirement?.message || `Payment is required before you can ${actionText} this report.`,
    }));
  };

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
        handlePaymentRequired(report, 'preview', errorData.payment_requirement);
        return;
      }
      if (!options.skipPaymentHandling && err?.response?.status === 403 && /pay|payment|required|access/i.test(String(errorData?.message || ''))) {
        handlePaymentRequired(report, 'preview', errorData?.payment_requirement);
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
        handlePaymentRequired(report, 'download', errorData.payment_requirement);
        return;
      }
      if (!options.skipPaymentHandling && err?.response?.status === 403 && /pay|payment|required|access/i.test(String(errorData?.message || ''))) {
        handlePaymentRequired(report, 'download', errorData?.payment_requirement);
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
      <section className={styles.heroPanel}>
        <h2 className={styles.heading}>Reports</h2>
        <p className={styles.heroSubtitle}>Explore academic reports prepared for your department and study level.</p>
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
            <input
              type="text"
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>
      </section>

      <div className={styles.reportList}>
        {filteredReports.length === 0 ? (
          <p className={styles.noResults}>No report found.</p>
        ) : (
          filteredReports.map((r) => (
            <div key={r.report_id} className={styles.card}>
              <div className={styles.headerRow}>
                <div className={styles.cardBadge}>Report</div>
                <button
                  type="button"
                  className={styles.menuButton}
                  onClick={() => linkMenu.open && linkMenu.id === r.report_id ? closeLinkMenu() : openLinkMenu(r)}
                  title="View related links"
                >
                  <FaEllipsisV />
                </button>
              </div>

              <div className={styles.previewThumbnail}>
                <div className={styles.thumbnailPlaceholder}>
                  <div className={styles.thumbnailAccent} />
                  <div className={styles.thumbnailContent}>
                    {r.file_path?.endsWith('.pdf') ? (
                      <FaFilePdf className={styles.thumbnailIcon} />
                    ) : (
                      <FaFileWord className={styles.thumbnailIcon} />
                    )}
                    <span className={styles.thumbnailLabel}>Study resource</span>
                  </div>
                </div>
              </div>

              <div className={styles.titleRow}>
                <h3 className={styles.cardTitle}>{r.title}</h3>
                {isLongTopic(r.title) && (
                  <button type="button" className={styles.readAllLink} onClick={() => openTopicPopup(r)}>
                    Read all
                  </button>
                )}
              </div>

              <div className={styles.presenterRow}>
                <FaBuilding className={styles.presenterIcon} />
                <span className={styles.presenterName}>{(r.departments || [])[0]?.dpt_name || r.audience || 'General'}</span>
              </div>

              <div className={styles.metadataRow}>
                <span className={styles.metaChip}><FaCalendarAlt className={styles.metaIcon} /> {new Date(r.upload_date).getFullYear()}</span>
                {formatPageLabel(r.pages) ? (
                  <span className={styles.metaChip}><FaRegFileAlt className={styles.metaIcon} /> {formatPageLabel(r.pages)}</span>
                ) : null}
                <span className={styles.metaChip}><FaClock className={styles.metaIcon} /> {formatTimeAgo(r.upload_date)}</span>
              </div>

              <div className={styles.metadataRow2}>
                <span className={styles.priceTag}>
                  <span className={styles.priceValue}>{getDownloadPriceMeta(r, authUser?.subscription?.plan)}</span>
                </span>
              </div>

              <div className={styles.actions}>
                <button className={styles.previewBtn} onClick={() => handlePreview(r)}>Preview</button>
                <button className={styles.downloadBtn} onClick={() => handleDownload(r)}>Download</button>
              </div>

              <div className={styles.meta}>
                {r.writer_names || 'Unknown author'}
                {r.writer_email ? ` • ${r.writer_email}` : ''}
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
