import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/DeveloperProjectSubmissions.module.css';
import SecurePdfPreview from './SecurePdfPreview';
import { useNavigate } from 'react-router-dom';

const actions = [
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
  { value: 'grant-permission', label: 'Grant Permission' },
  { value: 'delete', label: 'Delete (Rejected Only)' },
];

const formatMoney = (value) => Number(value || 0).toFixed(2);
const toPrettyStatus = (value) => String(value || '').replace(/_/g, ' ');

const DeveloperProjectSubmissions = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteById, setNoteById] = useState({});
  const [actionById, setActionById] = useState({});
  const [actioningId, setActioningId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('Submission Preview');

  const stats = useMemo(() => {
    const summary = { total: items.length, pending: 0, approved: 0, rejected: 0 };
    items.forEach((item) => {
      if (item.status === 'pending_review') summary.pending += 1;
      if (item.status === 'approved') summary.approved += 1;
      if (item.status === 'rejected') summary.rejected += 1;
    });
    return summary;
  }, [items]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/project-submissions');
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to load submissions');
      setItems(res.data.submissions || []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to load candidate project submissions.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateSubmission = async (id, type) => {
    const action = actionById[id] || 'approve';
    const note = noteById[id] || '';
    if (action === 'delete') {
      const confirmed = window.confirm('Delete this rejected submission permanently?');
      if (!confirmed) return;
    }

    try {
      setActioningId(id);
      const res = await api.put(`/admin/project-submissions/${id}`, { action, note });
      if (!res.data?.success) throw new Error(res.data?.message || 'Update failed');
      const actionMessage = action === 'delete' ? 'deleted' : `${action}d`;
      showToast(`Submission ${actionMessage} successfully.`, 'success');

      if (action === 'approve') {
        const draftItem = items.find((entry) => String(entry._id) === String(id));
        if (type === 'report') {
          navigate(`/admin/reports?projectSubmissionId=${encodeURIComponent(id)}`, {
            state: { projectSubmissionDraft: draftItem || null },
          });
          return;
        }
        if (type === 'presentation') {
          navigate(`/admin/presentations?projectSubmissionId=${encodeURIComponent(id)}`, {
            state: { projectSubmissionDraft: draftItem || null },
          });
          return;
        }
      }

      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to update this submission.'), 'error');
    } finally {
      setActioningId(null);
    }
  };

  const onOpenPreview = async (item) => {
    try {
      setPreviewLoading(true);
      setPreviewTitle(item?.title || 'Submission Preview');
      const res = await api.get(`/admin/project-submissions/${item._id}/preview`, {
        responseType: 'arraybuffer',
      });
      const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
      const blob = contentType.includes('application/pdf')
        ? new Blob([res.data], { type: 'application/pdf' })
        : new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPreviewOpen(true);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to preview this submission file.'), 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  if (loading) return <div style={{ padding: 24 }}>Loading submissions…</div>;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h2 className={styles.heroTitle}>Candidate Project Review Queue</h2>
        <p className={styles.heroText}>Moderate candidate and lecturer uploads with a cleaner approval pipeline. Approved items now move into the full Report/Presentation upload editors for final enrichment before release.</p>
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span>Total</span>
            <strong>{stats.total}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Pending Review</span>
            <strong>{stats.pending}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Approved (Ready to Finalize)</span>
            <strong>{stats.approved}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Rejected</span>
            <strong>{stats.rejected}</strong>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Private Review Queue</h3>
        {items.length === 0 ? <p className={styles.emptyState}>No pending private submissions found.</p> : null}
        <div className={styles.queue}>
        {items.map((item) => (
          <article key={item._id} className={styles.card}>
            <div className={styles.cardTop}>
              <div>
                <h4 className={styles.cardTitle}>{item.title}</h4>
                <div className={styles.meta}>
                  {item.submission_type} by {item.uploader_name || item.uploader_cand_id}
                </div>
                <div className={styles.badges}>
                  <span className={`${styles.badge} ${styles.status}`}>{toPrettyStatus(item.status)}</span>
                  <span className={styles.badge}>Uploader: {item.uploader_program}</span>
                  <span className={styles.badge}>Target: {item.target_program}</span>
                  <span className={styles.badge}>Fee: {formatMoney(item.upload_fee)} FCFA</span>
                </div>
                {item.status === 'approved' ? (
                  <p className={styles.nextHint}>
                    Ready for final material setup. Use Apply with Approve again or use Open File and continue in the full upload form.
                  </p>
                ) : null}
              </div>
              <button type="button" onClick={() => onOpenPreview(item)} className={styles.linkBtn} disabled={previewLoading}>
                {previewLoading ? 'Opening...' : 'Open File'}
              </button>
            </div>

            <div className={styles.controls}>
              <select
                value={actionById[item._id] || 'approve'}
                onChange={(e) => setActionById((prev) => ({ ...prev, [item._id]: e.target.value }))}
                className={styles.actionSelect}
              >
                {actions.filter((entry) => entry.value !== 'delete' || item.status === 'rejected').map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={noteById[item._id] || ''}
                onChange={(e) => setNoteById((prev) => ({ ...prev, [item._id]: e.target.value }))}
                placeholder="Optional review note"
                className={styles.noteInput}
              />
              <button
                type="button"
                onClick={() => updateSubmission(item._id, item.submission_type)}
                className={styles.applyBtn}
                disabled={actioningId === item._id}
              >
                {actioningId === item._id ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </article>
        ))}
        </div>
      </section>

      {previewOpen && (
        <div className={styles.previewOverlay} role="dialog" aria-modal="true">
          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <h4>{previewTitle}</h4>
              <button type="button" className={styles.previewClose} onClick={closePreview}>Close</button>
            </div>
            <div className={styles.previewBody}>
              {previewUrl ? <SecurePdfPreview fileUrl={previewUrl} maxPages={null} allowTextSelection={true} /> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeveloperProjectSubmissions;
