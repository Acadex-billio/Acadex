import React, { useEffect, useState, useMemo, useCallback } from "react";
import styles from "../Astyles/viewReport.module.css";
import { getErrorMessage } from "../utility/getErrorMessage";
import { FaFileWord, FaFilePdf } from "react-icons/fa";
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

  useEffect(() => {
    // No need for axios defaults when using api service
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
    onStartPayment: async (phoneNumber, _paymentMethod = 'momo', promoCode = '') => {
      const { data } = await api.post('/candidate/payments/materials/checkout', {
        resourceType: 'report',
        resourceId: report.report_id,
        action,
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
    if (linkedReport?.file_path) {
      if (linkedReport?.title) setSearch(linkedReport.title);
      handlePreview(linkedReport);
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
              <div className={styles.docPreview}>
                <div className={styles.docPreviewLabel}>Report</div>
                <div className={styles.docPreviewTitle}>{r.title}</div>
              </div>

              <div className={styles.docBody}>
                <div className={styles.docIconWrap}>
                  {r.file_path?.endsWith('.pdf') ? (
                    <FaFilePdf className={styles.fileIcon} />
                  ) : (
                    <FaFileWord className={styles.fileIcon} />
                  )}
                </div>

                <div className={styles.docTextWrap}>
                  <h3 className={styles.title}>{r.title}</h3>
                  <p className={styles.meta}>
                    Author: {r.writer_names} ({r.writer_email})
                    <br />
                    Location: {r.location} | Pages: {r.pages}
                  </p>
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  className={styles.previewBtn}
                  onClick={() => handlePreview(r)}
                >
                  Preview
                </button>
                <button
                  className={styles.downloadBtn}
                  onClick={() => handleDownload(r)}
                >
                  Download
                </button>
              </div>
            </div>
          ))
        )}
      </div>

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
