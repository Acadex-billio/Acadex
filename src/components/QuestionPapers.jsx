import React, { useEffect, useState, useMemo } from "react";
import api from "../services/api";
import styles from "../Astyles/pastQuestion.module.css";
import { getErrorMessage } from "../utility/getErrorMessage";
import GraduationCapLoader from "./GraduationCapLoader";
import SecurePdfPreview from "./SecurePdfPreview";
import { showToast } from "../utility/ToastNotification";
import PaymentActionModal from "./PaymentActionModal";
import { useNavigate } from "react-router-dom";
import { FaFilePdf, FaCalendarAlt, FaBuilding, FaClock, FaRegFileAlt } from "react-icons/fa";

const QuestionPapers = () => {
  const navigate = useNavigate();
  const [papers, setPapers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [myCounts, setMyCounts] = useState({ downloads: 0, previews: 0 });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionLabel, setActionLabel] = useState("Preparing material...");
  const [previewMeta, setPreviewMeta] = useState({ plan: 'basic', allowCopy: false, pageLimit: null, item: null });
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [linkMenu, setLinkMenu] = useState({ open: false, id: null, title: '', items: [], fallback: false });

  useEffect(() => {
    // JWT handles credentials automatically
  }, []);

  /** ----------------------------
   * Fetch Departments
   * -----------------------------*/
  /** Fetch departments - mount only */
  useEffect(() => {
    let cancelled = false;
    const loadDepartments = async () => {
      try {
        const { data } = await api.get('/candidate/departments');
        if (!cancelled) setDepartments(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, "Unable to load departments. Check connection and try again."), 'error');
      }
    };
    loadDepartments();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadMyCounts = async () => {
      try {
        const { data } = await api.get('/candidate/analytics/materials/summary?period=week');
        const breakdown = Array.isArray(data?.breakdown) ? data.breakdown : [];
        const qp = breakdown.filter((r) => r.content_type === 'question_paper');
        const downloads = qp.find((r) => r.action === 'download')?.count || 0;
        const previews = qp.find((r) => r.action === 'preview')?.count || 0;
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

  /** Fetch question papers - mount only */
  useEffect(() => {
    let cancelled = false;
    const loadPapers = async () => {
      try {
        const { data } = await api.get('/candidate/question-papers');
        if (!cancelled) setPapers(Array.isArray(data?.papers) ? data.papers : []);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, "Unable to load question papers. Check connection and try again."), 'error');
      }
    };
    loadPapers();
    return () => { cancelled = true; };
  }, []);

  /** ----------------------------
   * Filtered Papers
   * -----------------------------*/
  const filteredPapers = useMemo(() => {
    return papers.filter((p) => {
      if (search && !p.paper_title.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedDept && !p.departments.some((d) => String(d.dpt_id) === selectedDept)) return false;
      if (selectedYear && String(p.hnd_year) !== selectedYear) return false;
      return true;
    });
  }, [papers, search, selectedDept, selectedYear]);

  /** ----------------------------
   * Preview Handler
   * -----------------------------*/
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

  const createMaterialPaymentRequest = (paper, action, requirement) => ({
    title: requirement?.title || (action === 'download' ? 'Unlock question paper download' : 'Unlock full question paper preview'),
    description: requirement?.message || (action === 'download'
      ? 'PAYGO requires a separate payment before you can download this question paper.'
      : 'PAYGO requires a separate payment before you can preview every page of this question paper.'),
    amount: requirement?.amount || (action === 'download' ? 100 : 50),
    currency: requirement?.currency || 'XAF',
    onStartPayment: async ({ phoneNumber, paymentMethod = 'momo', promoCode = '' }) => {
      const { data } = await api.post('/candidate/payments/materials/checkout', {
        resourceType: 'question_paper',
        resourceId: paper.qp_id,
        action,
        paymentMethod,
        phoneNumber,
        promoCode,
        referralCode: promoCode,
      });
      return data;
    },
    onSuccess: async () => {
      if (action === 'download') await handleDownload(paper, { skipPaymentHandling: true });
      else await handlePreview(paper, { skipPaymentHandling: true });
    },
  });

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

  const findFallbackLinks = (sourcePaper) => {
    const sourceDeptIds = (sourcePaper.departments || []).map((d) => String(d.dpt_id));
    const links = [];
    papers.forEach((item) => {
      if (String(item.qp_id) === String(sourcePaper.qp_id)) return;
      const itemDeptIds = (item.departments || []).map((d) => String(d.dpt_id));
      if (!itemDeptIds.some((id) => sourceDeptIds.includes(id))) return;
      const raw = Array.isArray(item.study_links) ? item.study_links : [];
      raw.forEach((link) => {
        const normalized = String(link || '').trim();
        if (/^https?:\/\//i.test(normalized) && !links.includes(normalized)) {
          links.push(normalized);
        }
      });
    });
    return links.slice(0, 2).map((link) => ({
      label: link.replace(/^https?:\/\/(www\.)?/, ''),
      href: link,
    }));
  };

  const getMaterialLinks = (paper) => {
    const raw = Array.isArray(paper.study_links) ? paper.study_links : [];
    const validUrls = raw
      .map((link) => String(link || '').trim())
      .filter((link) => /^https?:\/\//i.test(link));

    if (validUrls.length) {
      return validUrls.map((link) => ({
        label: link.replace(/^https?:\/\/(www\.)?/, ''),
        href: link,
      }));
    }

    const fallback = findFallbackLinks(paper);
    if (fallback.length) return fallback;

    return (paper.departments || []).map((department) => ({
      label: department.dpt_name || 'Department',
      href: null,
    }));
  };

  const openLinkMenu = (paper) => {
    const items = getMaterialLinks(paper);
    const hasOwnLinks = Array.isArray(paper.study_links) && paper.study_links.length;
    setLinkMenu({
      open: true,
      id: paper.qp_id,
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

  const handlePreview = async (paper, options = {}) => {
    const requested = String(paper?.paper_file || '').trim();
    if (!requested) return;

    setActionLabel('Preparing question paper preview...');
    setActionLoading(true);
    try {
      const safeFile = encodeURIComponent(requested);
      const res = await api.get(`/candidate/question-papers/preview/${safeFile}`, {
        responseType: 'blob',
      });

      const blob = res.data instanceof Blob
        ? new Blob([res.data], { type: 'application/pdf' })
        : new Blob([res.data], { type: 'application/pdf' });
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
      const errorData = await parseErrorPayload(err);
      if (!options.skipPaymentHandling && err?.response?.status === 402 && errorData?.payment_requirement) {
        openPaymentModal(createMaterialPaymentRequest(paper, 'preview', errorData.payment_requirement));
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
      showToast(getErrorMessage(err, errorData?.message || 'Unable to preview file'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /** --------------------------------------------------------------
   * Download Handler – Using Blob (forces OS Save File Dialog)
   * ---------------------------------------------------------------*/
  const handleDownload = async (paper, options = {}) => {
    setActionLabel('Preparing question paper download...');
    setActionLoading(true);
    try {
      const requested = String(paper?.paper_file || '').trim();
      if (!requested) return;

      const safeFile = encodeURIComponent(requested);
      const response = await api.get(`/candidate/question-papers/file/${safeFile}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = extractFileName(requested) || 'question-paper';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast("Download started", 'success');
    } catch (err) {
      const errorData = await parseErrorPayload(err);
      if (!options.skipPaymentHandling && err?.response?.status === 402 && errorData?.payment_requirement) {
        openPaymentModal(createMaterialPaymentRequest(paper, 'download', errorData.payment_requirement));
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
      showToast(errorData?.message || "Unable to download file", 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {actionLoading ? <GraduationCapLoader fullscreen label={actionLabel} /> : null}
      <div className={styles.container}>
      <h2 className={styles.heading}>Question Papers</h2>
      <p className={styles.noResults}>
        Your activity (last 7 days): Downloads {myCounts.downloads} • Previews {myCounts.previews}
      </p>

      {/* Filters */}
      <div className={styles.filterBox}>
        <input
          type="text"
          value={search}
          placeholder="Search by title..."
          onChange={(e) => setSearch(e.target.value)}
          className={styles.input}
        />

        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className={styles.select}
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.dpt_id} value={d.dpt_id}>
              {d.department_name}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className={styles.select}
        >
          <option value="">All Years</option>
          {[2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Paper Cards */}
      <div className={styles.paperList}>
        {filteredPapers.length === 0 ? (
          <p className={styles.noResults}>No matching question papers found.</p>
        ) : (
          filteredPapers.map((p) => (
            <div key={p.qp_id} className={styles.paperCard}>
              <div className={styles.cardRow}>
                <div className={styles.cardSummary}>
                  <div className={styles.iconBlock}>
                    <FaFilePdf className={styles.fileIcon} />
                  </div>
                  <div className={styles.cardContent}>
                    <h3 className={styles.title}>{p.paper_title}</h3>
                    <div className={styles.chipRow}>
                      <span className={styles.chip}><FaCalendarAlt className={styles.chipIcon} /> Year {p.hnd_year}</span>
                      <span className={styles.chip}><FaBuilding className={styles.chipIcon} /> {p.departments.map((d) => d.dpt_name).join(', ') || 'General'}</span>
                    </div>
                    <div className={styles.statsRow}>
                      <span className={styles.smallMeta}><FaClock className={styles.smallIcon} /> {formatTimeAgo(p.upload_date)}</span>
                      <span className={styles.smallMeta}><FaRegFileAlt className={styles.smallIcon} /> Pages: N/A</span>
                    </div>
                  </div>
                </div>

                <div className={styles.actionGroup}>
                  <button className={styles.textAction} onClick={() => handlePreview(p)}>Preview</button>
                  <button className={styles.textAction} onClick={() => handleDownload(p)}>Download</button>
                  <button
                    type="button"
                    className={styles.menuButton}
                    onClick={() => linkMenu.open && linkMenu.id === p.qp_id ? closeLinkMenu() : openLinkMenu(p)}
                  >
                    ⋯
                  </button>
                </div>
              </div>

              {linkMenu.open && linkMenu.id === p.qp_id && (
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

      {/* Preview Modal */}
      {previewFile && (
        <div className={styles.modalOverlay} onClick={closePreview} onContextMenu={handlePreventContextMenu}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()} onContextMenu={handlePreventContextMenu} onCopy={handlePreventCopy} onCut={handlePreventCopy} onDrag={handlePreventCopy} onSelectStart={handlePreventCopy}>
            <button className={styles.modalClose} onClick={closePreview}>
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

export default QuestionPapers;
