import React, { useEffect, useState, useMemo } from "react";
import styles from "../Astyles/viewpresentations.module.css";
import { FaCalendarAlt, FaBuilding, FaClock, FaRegFileAlt, FaSearch, FaRegChartBar, FaUser, FaEllipsisV } from "react-icons/fa";
import api from "../services/api";
import { getErrorMessage } from "../utility/getErrorMessage";
import GraduationCapLoader from "./GraduationCapLoader";
import SecurePdfPreview from "./SecurePdfPreview";
import { showToast } from "../utility/ToastNotification";
import PaymentActionModal from "./PaymentActionModal";
import { useNavigate } from "react-router-dom";

// Remove axios defaults since we're using api service
// axios.defaults.withCredentials = true;

const normalizeFilePath = (filePath) => String(filePath || '').trim();

const ViewPresentation = () => {
  const navigate = useNavigate();
  const [presentations, setPresentations] = useState([]);
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
  const [thumbnailCache, setThumbnailCache] = useState({});

  const closeTopicPopup = () => setTopicPopup({ open: false, id: null, topic: '', description: '' });

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
        const rows = breakdown.filter((r) => r.content_type === 'presentation');
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const presentationId = String(params.get('presentationId') || '').trim();
    if (!presentationId || !presentations.length) return;
    const linked = presentations.find((p) => String(p.presentation_id) === presentationId);
    if (linked?.presentation_title) {
      setSearch(linked.presentation_title);
    }
    // clear param
    window.history.replaceState({}, document.title, '/candidate/presentations');
  }, [presentations]);

  const [loadingPresentations, setLoadingPresentations] = useState(true);

  /** Fetch presentations - mount only */
  useEffect(() => {
    let cancelled = false;
    const fetchPresentations = async () => {
      try {
        const { data } = await api.get('/candidate/presentations');
        const payload = data?.presentations ?? data ?? [];
        if (!cancelled) setPresentations(Array.isArray(payload) ? payload : []);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, "Failed to load presentations. Check connection and try again."), 'error');
      } finally {
        if (!cancelled) setLoadingPresentations(false);
      }
    };
    fetchPresentations();
    return () => { cancelled = true; };
  }, []);

  /** Load thumbnails for presentations */
  useEffect(() => {
    if (!presentations.length) return;
    
    let cancelled = false;
    const loadThumbnails = async () => {
      const cache = { ...thumbnailCache };
      const uncachedPaths = presentations
        .map((presentation) => normalizeFilePath(presentation?.file_path))
        .filter((filePath) => filePath && cache[filePath] === undefined);
      if (!uncachedPaths.length) return;
      
      // Load thumbnails with max 3 concurrent requests
      const loadingPromises = [];
      for (const filePath of uncachedPaths) {
        if (cancelled) break;
        
        const loadPromise = (async () => {
          try {
            const res = await api.get(
              `/candidate/presentations/thumbnail/${encodeURIComponent(filePath)}`,
              { responseType: 'blob', timeout: 120000 }
            );
            
            if (res.status === 200 && res.data instanceof Blob && res.data.size > 0) {
              const url = URL.createObjectURL(res.data);
              cache[filePath] = url;
              console.log('[Thumbnails] Loaded:', filePath, `size: ${res.data.size} bytes`);
            } else {
              console.warn('[Thumbnails] Received invalid blob:', filePath, `status: ${res.status}, size: ${res.data?.size || 0}`);
              cache[filePath] = null;
            }
          } catch (err) {
            console.warn('[Thumbnails] Failed to load:', filePath, err.message);
            // Mark as failed to avoid retrying
            cache[filePath] = null;
          }
        })();
        
        loadingPromises.push(loadPromise);
        
        // Limit concurrent requests to 3
        if (loadingPromises.length >= 3) {
          await Promise.race(loadingPromises);
          loadingPromises.splice(0, 1);
        }
      }
      
      // Wait for remaining promises
      await Promise.all(loadingPromises);
      
      if (!cancelled) {
        setThumbnailCache(cache);
      }
    };
    
    loadThumbnails();
    
    return () => { 
      cancelled = true;
    };
  }, [presentations, thumbnailCache]);

  /** Cleanup thumbnail URLs on unmount */
  useEffect(() => {
    return () => {
      // Cleanup blob URLs on component unmount only
      Object.values(thumbnailCache).forEach(url => {
        if (url && typeof url === 'string' && url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(url);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredPresentations = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    return presentations.filter((p) =>
      String(p?.presentation_title || p?.title || '').toLowerCase().includes(q)
    );
  }, [presentations, search]);

  const extractFileName = (file) => file?.replace(/\\/g, "/").split("/").pop();

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

  const navigateToLinkedReport = (presentation) => {
    if (!presentation?.report_id) return;
    closeLinkMenu();
    navigate(`/candidate/reports?reportId=${encodeURIComponent(String(presentation.report_id))}`);
  };

  const getMaterialLinks = (presentation) => {
    if (Array.isArray(presentation.study_links) && presentation.study_links.length) {
      return presentation.study_links
        .map((link) => String(link || '').trim())
        .filter((link) => /^https?:\/\//i.test(link))
        .map((link) => ({ label: link.replace(/^https?:\/\/(www\.)?/, ''), href: link }));
    }

    const fallback = (presentation.report_departments || [])
      .flatMap((dept) => studyLinksByDept[String(dept.dpt_id)] || [])
      .filter((link, index, arr) => link && arr.indexOf(link) === index)
      .slice(0, 2)
      .map((link) => ({ label: link.replace(/^https?:\/\/(www\.)?/, ''), href: link }));

    if (fallback.length) return fallback;

    return (presentation.report_departments || []).map((department) => ({
      label: department.dpt_name || 'Department',
      href: null,
    }));
  };

  const openLinkMenu = (presentation) => {
    const items = [];
    const hasLinkedReport = Boolean(presentation.report_id && presentation.report_title);

    if (hasLinkedReport) {
      items.push({
        label: `View linked report: ${presentation.report_title}`,
        onClick: () => navigateToLinkedReport(presentation),
      });
    }

    if (presentation.presenter_email) {
      items.push({
        label: `Contact writer by email (${presentation.presenter_email})`,
        href: `mailto:${presentation.presenter_email}`,
      });
    }

    items.push(...getMaterialLinks(presentation));

    const hasOwnLinks = Array.isArray(presentation.study_links) && presentation.study_links.length;
    setLinkMenu({
      open: true,
      id: presentation.presentation_id,
      title: items.length
        ? hasLinkedReport
          ? 'Linked report and verified resources'
          : hasOwnLinks
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

  const openPaymentModal = (config) => setPaymentRequest(config);

  const handlePaymentRequired = (presentation, action, requirement) => {
    const amount = Number(requirement?.amount ?? presentation.material_price ?? (action === 'download' ? 150 : 100));
    const currency = requirement?.currency || 'XAF';
    const actionText = action === 'download' ? 'download' : 'preview';

    showToast(`Payment is required to ${actionText} this presentation. Redirecting to payment (${amount} ${currency}).`, 'warning');
    openPaymentModal(createMaterialPaymentRequest(presentation, action, {
      ...(requirement || {}),
      amount,
      currency,
      message: requirement?.message || `Payment is required before you can ${actionText} this presentation.`,
    }));
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

  const createMaterialPaymentRequest = (presentation, action, requirement) => ({
    title: requirement?.title || (action === 'download' ? 'Unlock presentation download' : 'Unlock full presentation preview'),
    description: requirement?.message || (action === 'download'
      ? 'A payment is required before you can download this presentation.'
      : 'A payment is required before you can preview every page of this presentation.'),
    amount: requirement?.amount ?? presentation.material_price ?? (action === 'download' ? 150 : 100),
    currency: requirement?.currency || 'XAF',
    onStartPayment: async ({ phoneNumber, paymentMethod = 'momo', promoCode = '' }) => {
      const { data } = await api.post('/candidate/payments/materials/checkout', {
        resourceType: 'presentation',
        resourceId: presentation.presentation_id,
        action,
        paymentMethod,
        phoneNumber,
        promoCode,
        referralCode: promoCode,
      });
      return data;
    },
    onSuccess: async () => {
      if (action === 'download') await handleDownload(presentation, { skipPaymentHandling: true });
      else await handlePreview(presentation, { skipPaymentHandling: true });
    },
  });

  const handlePreview = async (presentation, options = {}) => {
    const requested = String(presentation?.file_path || '').trim();
    if (!requested) return;

    setActionLabel('Preparing presentation preview...');
    setActionLoading(true);
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
      setPreviewFile(extractFileName(requested) || 'presentation');
      setPreviewUrl(url);
      setPreviewMeta({
        plan: String(res.headers['x-subscription-plan'] || 'basic').toLowerCase(),
        allowCopy: String(res.headers['x-allow-copy'] || 'false').toLowerCase() === 'true',
        pageLimit: res.headers['x-preview-page-limit'] === 'full' ? null : Number(res.headers['x-preview-page-limit'] || 0) || null,
        item: presentation,
      });
    } catch (err) {
      const errorData = await parseErrorPayload(err);
      if (!options.skipPaymentHandling && err?.response?.status === 402 && errorData?.payment_requirement) {
        openPaymentModal(createMaterialPaymentRequest(presentation, 'preview', errorData.payment_requirement));
        return;
      }
      if (!options.skipPaymentHandling && err?.response?.status === 403 && /pay|payment|required|access/i.test(String(errorData?.message || ''))) {
        handlePaymentRequired(presentation, 'preview', errorData?.payment_requirement);
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
      showToast(getErrorMessage(err, errorData?.message || 'Failed to preview presentation.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (presentation, options = {}) => {
    const requested = String(presentation?.file_path || '').trim();
    if (!requested) return;

    setActionLabel('Preparing presentation download...');
    setActionLoading(true);
    try {
      const safeFile = encodeURIComponent(requested);
      const res = await api.get(`/candidate/presentations/file/${safeFile}`, {
        responseType: 'blob',
      });
      const filename = extractFileName(requested) || 'presentation';
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
        openPaymentModal(createMaterialPaymentRequest(presentation, 'download', errorData.payment_requirement));
        return;
      }
      if (!options.skipPaymentHandling && err?.response?.status === 403 && /pay|payment|required|access/i.test(String(errorData?.message || ''))) {
        handlePaymentRequired(presentation, 'download', errorData?.payment_requirement);
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
      showToast(getErrorMessage(err, errorData?.message || 'Failed to download presentation.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {actionLoading ? <GraduationCapLoader fullscreen label={actionLabel} /> : null}
      <div className={styles.container}>
      <section className={styles.heroPanel}>
        <h2 className={styles.heading}>PowerPoint Presentations</h2>
        <p className={styles.heroSubtitle}>Review presentation slides and resources prepared by your academic community.</p>
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

      <div className={styles.presentationList}>
        {loadingPresentations ? (
          <p className={styles.noResults}>Loading presentations…</p>
        ) : filteredPresentations.length === 0 ? (
          <p className={styles.noResults}>No presentation found.</p>
        ) : (
          filteredPresentations.map((p) => {
            const normalizedFilePath = normalizeFilePath(p.file_path);
            return (
              <div key={p.presentation_id} className={styles.card}>
              {/* Top Row: Badge + Menu */}
              <div className={styles.headerRow}>
                <div className={styles.cardBadge}>Presentation</div>
                <button
                  className={styles.menuButton}
                  onClick={() => openLinkMenu(p)}
                  title="View related links"
                >
                  <FaEllipsisV />
                </button>
              </div>

              {/* Document Preview Thumbnail */}
              <div className={styles.previewThumbnail}>
                {thumbnailCache[normalizedFilePath] ? (
                  <img
                    src={thumbnailCache[normalizedFilePath]}
                    alt={p.presentation_title || 'Presentation preview'}
                    className={styles.thumbnailImage}
                  />
                ) : thumbnailCache.hasOwnProperty(normalizedFilePath) && thumbnailCache[normalizedFilePath] === null ? (
                  <div className={styles.thumbnailPlaceholder}>
                    <span style={{color: '#cbd5e1', fontSize: '12px', textAlign: 'center'}}>Preview unavailable</span>
                  </div>
                ) : (
                  <div className={styles.thumbnailPlaceholder}>
                    <span style={{color: '#64748b', fontSize: '13px'}}>Loading preview...</span>
                  </div>
                )}
              </div>

              {/* Title Section */}
              <h3 className={styles.cardTitle}>
                {(p.presentation_title || p.title || '').length > 80
                  ? (p.presentation_title || p.title).substring(0, 80) + '...'
                  : p.presentation_title || p.title}
              </h3>

              {/* Presenter Section */}
              <div className={styles.presenterRow}>
                <FaUser className={styles.presenterIcon} />
                <span className={styles.presenterName}>{p.presenter_name || 'Unknown'}</span>
              </div>

              {/* Metadata Row 1: Date, Audience, Pages */}
              <div className={styles.metadataRow}>
                <span className={styles.metaChip}>
                  <FaCalendarAlt className={styles.metaIcon} />
                  {new Date(p.upload_date).getFullYear()}
                </span>
                <span className={styles.metaChip}>
                  <FaBuilding className={styles.metaIcon} />
                  {p.audience || p.program || 'GENERAL'}
                </span>
                <span className={styles.metaChip}>
                  <FaRegFileAlt className={styles.metaIcon} />
                  {p.pages || 'N/A'} Slides
                </span>
              </div>

              {/* Metadata Row 2: Price + Time Ago */}
              <div className={styles.metadataRow2}>
                {Number.isFinite(Number(p.material_price)) && Number(p.material_price) > 0 ? (
                  <span className={styles.priceTag}>
                    <span className={styles.priceValue}>{Number(p.material_price).toLocaleString()} XAF</span>
                  </span>
                ) : null}
                <span className={styles.timeTag}>
                  <FaClock className={styles.metaIcon} />
                  {formatTimeAgo(p.upload_date)}
                </span>
              </div>

              {/* Action Buttons */}
              <div className={styles.actions}>
                <button
                  className={styles.previewBtn}
                  onClick={() => handlePreview(p)}
                  title="Preview this presentation"
                >
                  👁 Preview
                </button>
                <button
                  className={styles.downloadBtn}
                  onClick={() => handleDownload(p)}
                  title="Download this presentation"
                >
                  ⬇ Download
                </button>
                <button
                  className={styles.saveBtn}
                  onClick={async () => {
                    try {
                      const payload = { resourceType: 'presentation', filename: p.file_path, resourceId: p.presentation_id };
                      const { data } = await api.post('/candidate/presentations/save', payload);
                      showToast(data?.message || 'Saved to My Downloads', 'success');
                    } catch (err) {
                      const errMsg = (err?.response?.data && err.response.data.message) || err.message || 'Failed to save';
                      showToast(errMsg, 'error');
                    }
                  }}
                  title="Save this presentation to your collection"
                >
                  💾 Save
                </button>
              </div>

              {/* Menu for additional links */}
              {linkMenu.open && linkMenu.id === p.presentation_id && (
                <div className={styles.linkMenu}>
                  <div className={styles.linkMenuTitle}>{linkMenu.title}</div>
                  <div className={styles.linkMenuSubtitle}>Verified sites to get well structured notes that covers your syllabus.</div>
                  {linkMenu.items.length ? (
                    linkMenu.items.map((item, index) => (
                      <div key={index} className={styles.linkMenuItem}>
                        {item.onClick ? (
                          <button type="button" className={styles.linkMenuAction} onClick={item.onClick}>
                            {item.label}
                          </button>
                        ) : item.href ? (
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
          );
        })
      )}
      </div>

      {topicPopup.open && (
        <div className={styles.topicPopupOverlay} onClick={closeTopicPopup}>
          <div className={styles.topicPopupBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.topicPopupHeader}>Full topic</div>
            <p className={styles.topicPopupText}>{topicPopup.topic}</p>
            {topicPopup.description ? (
              <p style={{ marginTop: 16, color: '#334155', lineHeight: 1.65, fontSize: 14 }}>
                {topicPopup.description}
              </p>
            ) : null}
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
              ├ù
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

export default ViewPresentation;
