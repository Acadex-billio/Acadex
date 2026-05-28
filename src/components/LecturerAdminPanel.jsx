import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/lecturerPortal.module.css';
import { showToast } from '../utility/ToastNotification';
import { maskCandidateId } from '../utility/maskCandidateId';

const DOCS = [
  { key: 'id_card_front', label: 'ID Card Front', urlField: 'id_card_front_url', keyField: 'id_card_front_key' },
  { key: 'id_card_back', label: 'ID Card Back', urlField: 'id_card_back_url', keyField: 'id_card_back_key' },
  { key: 'certificate_scan', label: 'Certificate', urlField: 'certificate_scan_url', keyField: 'certificate_scan_key' },
];

const normalizeDocUrl = (value) => {
  const backendOrigin = api.defaults.baseURL?.replace(/\/api$/, '')?.replace(/\/$/, '') || '';
  const toAbsolute = (raw) => {
    const input = String(raw || '').trim();
    if (!input || input === '[object Object]') return '';
    if (/^https?:\/\//i.test(input) || /^data:/i.test(input) || /^blob:/i.test(input)) return input;
    if (!backendOrigin) return input;
    if (input.startsWith('/')) return `${backendOrigin}${input}`;
    return `${backendOrigin}/${input}`;
  };

  if (typeof value === 'string') return toAbsolute(value);
  if (value && typeof value === 'object') {
    const candidate = value.url || value.href || value.location || '';
    return toAbsolute(candidate);
  }
  return '';
};

const LecturerAdminPanel = () => {
  const now = new Date();
  const [pending, setPending] = useState([]);
  const [noteByLecturer, setNoteByLecturer] = useState({});
  const [rejectModeByDoc, setRejectModeByDoc] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewAsFrame, setPreviewAsFrame] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const blobUrlRef = useRef('');

  const revokePreview = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = '';
    }
  };

  const closePreview = () => {
    revokePreview();
    setPreviewDoc(null);
    setPreviewAsFrame(false);
  };

  const loadPending = async () => {
    try {
      const res = await api.get('/lecturers/admin/pending');
      setPending(Array.isArray(res.data?.pending) ? res.data.pending : []);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to load pending lecturers', 'error');
    }
  };

  useEffect(() => {
    loadPending();
    return () => revokePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewDoc = async (lecturerId, docType, label, fallbackUrl) => {
    const loadKey = `${lecturerId}:${docType}`;
    setLoadingDoc(loadKey);
    try {
      const res = await api.get(
        `/lecturers/admin/${encodeURIComponent(lecturerId)}/doc-stream/${encodeURIComponent(docType)}`,
        { responseType: 'blob' }
      );
      revokePreview();
      const blobUrl = URL.createObjectURL(res.data);
      blobUrlRef.current = blobUrl;
      setPreviewAsFrame(false);
      setPreviewDoc({ label, url: blobUrl, fallbackUrl });
    } catch (err) {
      // If stream endpoint fails (no key stored), try the raw URL if available
      if (fallbackUrl) {
        revokePreview();
        setPreviewAsFrame(false);
        setPreviewDoc({ label, url: fallbackUrl, fallbackUrl });
      } else {
        showToast('Document could not be loaded. Ask the lecturer to re-upload.', 'error');
      }
    } finally {
      setLoadingDoc('');
    }
  };

  const resetDoc = async (lecturerId, docType, label) => {
    if (!window.confirm(`Reset "${label}" and ask the lecturer to re-upload? This cannot be undone.`)) return;
    try {
      await api.post(`/lecturers/admin/${encodeURIComponent(lecturerId)}/doc-reset/${encodeURIComponent(docType)}`);
      showToast(`${label} reset. Lecturer can now re-upload.`, 'success');
      await loadPending();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to reset document', 'error');
    }
  };

  const setApproval = async (lecturerId, approval) => {
    try {
      await api.put(`/lecturers/admin/${encodeURIComponent(lecturerId)}/approval`, {
        approval,
        note: noteByLecturer[lecturerId] || '',
      });
      showToast(`Lecturer ${approval} successfully.`, 'success');
      await loadPending();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to update lecturer approval', 'error');
    }
  };

  const setDocDecision = async (lecturerId, docType, decision) => {
    try {
      const noteKey = `${lecturerId}:${docType}`;
      const res = await api.put(`/lecturers/admin/${encodeURIComponent(lecturerId)}/docs/${encodeURIComponent(docType)}`, {
        decision,
        note: decision === 'rejected' ? (noteByLecturer[noteKey] || '') : '',
      });
      if (res.data?.account_activated) {
        showToast('All documents approved — lecturer account has been activated!', 'success');
      } else {
        showToast(`${docType} ${decision}.`, 'success');
      }
      setRejectModeByDoc((prev) => ({ ...prev, [noteKey]: false }));
      await loadPending();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to update document decision', 'error');
    }
  };

  const deactivateLecturer = async (lecturerId) => {
    try {
      await api.put(`/lecturers/admin/${encodeURIComponent(lecturerId)}/deactivate`, {
        note: noteByLecturer[lecturerId] || '',
      });
      showToast('Lecturer account deactivated successfully.', 'success');
      await loadPending();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to deactivate lecturer account', 'error');
    }
  };

  const runPayout = async () => {
    try {
      const res = await api.post('/lecturers/admin/payouts/run', { year, month });
      showToast(res.data?.message || 'Payout run completed.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to run monthly payout', 'error');
    }
  };

  return (
    <div className={styles.page}>
      {previewDoc ? (
        <div className={styles.docPreviewOverlay} onClick={closePreview}>
          <div className={styles.docPreviewModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.videoHeader}>
              <span>{previewDoc.label}</span>
              <button className={styles.videoClose} onClick={closePreview}>Close</button>
            </div>
            <div className={styles.docPreviewBody}>
              {previewAsFrame ? (
                <iframe className={styles.docPreviewFrame} src={previewDoc.url} title={previewDoc.label} />
              ) : (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.label}
                  className={styles.docPreviewImage}
                  onError={() => setPreviewAsFrame(true)}
                />
              )}
              <div className={styles.actions}>
                <button className={styles.buttonAlt} type="button" onClick={() => setPreviewAsFrame((v) => !v)}>
                  {previewAsFrame ? 'Try Image View' : 'Open File Viewer'}
                </button>
                {previewDoc.fallbackUrl ? (
                  <a className={styles.buttonAlt} href={previewDoc.fallbackUrl} target="_blank" rel="noopener noreferrer">Open in New Tab</a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.header}>
        <div>
          <div className={styles.title}>Lecturer Admin Panel</div>
          <div className={styles.subtitle}>Approve lecturer profiles and trigger monthly payouts manually.</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.rowTitle}>Manual monthly payout (50/50 split already computed per paid booking)</div>
        <div className={styles.inline}>
          <input className={styles.input} type="number" value={year} onChange={(e) => setYear(Number(e.target.value || now.getFullYear()))} />
          <input className={styles.input} type="number" min="1" max="12" value={month} onChange={(e) => setMonth(Number(e.target.value || now.getMonth() + 1))} />
          <button className={styles.button} onClick={runPayout}>Run Monthly Payout</button>
        </div>
      </div>

      <div className={styles.list}>
        {pending.map((item) => (
          <div className={styles.row} key={item.cand_id}>
            <div className={styles.rowTitle}>{item.name} ({maskCandidateId(item.cand_id)})</div>
            <div className={styles.meta}>{item.email}</div>
            <div className={styles.meta}>Headline: {item.profile?.headline || 'N/A'}</div>
            <div className={styles.meta}>Qualifications: {(item.profile?.qualifications || []).join(', ') || 'N/A'}</div>
            <div className={styles.meta}>Highest Qualification: {item.profile?.highest_qualification || 'N/A'}</div>
            <div className={styles.meta}>Account Status: {item.account_status || 'pending_approval'}</div>

            <div className={styles.docAdminGrid}>
              {DOCS.map((doc) => {
                const review = item.profile?.doc_review?.[doc.key] || { status: 'pending', note: '' };
                const reviewStatus = String(review.status || 'pending').toLowerCase();
                const noteKey = `${item.cand_id}:${doc.key}`;
                const docUrl = normalizeDocUrl(item.profile?.[doc.urlField]);
                const docKey = String(item.profile?.[doc.keyField] || '').trim();
                // Has upload if: valid URL stored, OR S3 key stored, OR doc was previously reviewed
                const hasUpload = Boolean(docUrl) || Boolean(docKey) || reviewStatus === 'approved' || reviewStatus === 'rejected';
                const canReset = Boolean(docUrl) || Boolean(docKey);
                const loadKey = `${item.cand_id}:${doc.key}`;
                const rejectMode = Boolean(rejectModeByDoc[noteKey]);
                return (
                  <div key={doc.key} className={styles.docAdminCard}>
                    <div className={styles.rowTitle}>{doc.label}</div>
                    <div className={styles.meta}>Status: {review.status || 'pending'}</div>
                    {hasUpload ? (
                      <button
                        type="button"
                        className={styles.buttonAlt}
                        disabled={loadingDoc === loadKey}
                        onClick={() => viewDoc(item.cand_id, doc.key, `${item.name} - ${doc.label}`, docUrl || null)}
                      >
                        {loadingDoc === loadKey ? 'Loading...' : 'View uploaded document'}
                      </button>
                    ) : (
                      <div className={styles.docPlaceholder}>No upload yet</div>
                    )}
                    {canReset ? (
                      <button
                        type="button"
                        className={styles.buttonAlt}
                        style={{ fontSize: '0.75rem', opacity: 0.7 }}
                        onClick={() => resetDoc(item.cand_id, doc.key, doc.label)}
                      >
                        Reset &amp; request re-upload
                      </button>
                    ) : null}

                    {rejectMode ? (
                      <textarea
                        className={styles.textarea}
                        placeholder={`Rejection note for ${doc.label}`}
                        value={noteByLecturer[noteKey] ?? (review.note || '')}
                        onChange={(e) => setNoteByLecturer((prev) => ({ ...prev, [noteKey]: e.target.value }))}
                      />
                    ) : null}

                    <div className={styles.actions}>
                      {reviewStatus !== 'approved' ? (
                        <button
                          className={styles.button}
                          disabled={!hasUpload}
                          onClick={() => setDocDecision(item.cand_id, doc.key, 'approved')}
                        >
                          Approve Doc
                        </button>
                      ) : (
                        <button className={styles.button} type="button" disabled>
                          Document Approved
                        </button>
                      )}
                      {rejectMode ? (
                        <>
                          <button
                            className={styles.buttonAlt}
                            disabled={!hasUpload}
                            onClick={() => setDocDecision(item.cand_id, doc.key, 'rejected')}
                          >
                            Confirm Reject
                          </button>
                          <button
                            className={styles.buttonAlt}
                            type="button"
                            onClick={() => setRejectModeByDoc((prev) => ({ ...prev, [noteKey]: false }))}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className={styles.buttonAlt}
                          disabled={!hasUpload}
                          onClick={() => setRejectModeByDoc((prev) => ({ ...prev, [noteKey]: true }))}
                        >
                          Reject Doc
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <textarea
              className={styles.textarea}
              placeholder="Final profile approval note"
              value={noteByLecturer[item.cand_id] || ''}
              onChange={(e) => setNoteByLecturer((prev) => ({ ...prev, [item.cand_id]: e.target.value }))}
            />
            <div className={styles.actions}>
              <button className={styles.button} onClick={() => setApproval(item.cand_id, 'approved')}>Activate Lecturer Account</button>
              <button className={styles.buttonAlt} onClick={() => setApproval(item.cand_id, 'rejected')}>Reject Profile</button>
              {String(item.account_status || '').toLowerCase() === 'active' ? (
                <button className={styles.buttonAlt} onClick={() => deactivateLecturer(item.cand_id)}>Deactivate Account</button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LecturerAdminPanel;
