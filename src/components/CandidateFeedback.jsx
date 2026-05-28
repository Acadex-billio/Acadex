import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/feedback.module.css';
import { FaPaperPlane, FaHistory } from 'react-icons/fa';

const formatDate = (value) => {
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return String(value || '');
  }
};

const CandidateFeedback = () => {
  const [mode, setMode] = useState('complaint');
  const [message, setMessage] = useState('');
  const [accountStatus, setAccountStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastSeenReviewed, setLastSeenReviewed] = useState(() => {
    try {
      return localStorage.getItem('candidate_feedback_last_seen_reviewed') || '';
    } catch (_) {
      return '';
    }
  });

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/candidate/account/status');
      setAccountStatus(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load your feedback history.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      loadStatus();
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitComplaint = async () => {
    const trimmed = String(message).trim();
    if (!trimmed) {
      showToast('Please enter your complaint or feedback before submitting.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/candidate/account/complaint', { text: trimmed });
      showToast('Your feedback has been submitted.', 'success');
      setMessage('');
      await loadStatus();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to submit feedback.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const complaints = useMemo(() => Array.isArray(accountStatus?.complaints) ? accountStatus.complaints : [], [accountStatus]);
  const pendingCount = complaints.filter((c) => c.status === 'pending').length;

  useEffect(() => {
    const allowPushFromServer = Boolean(accountStatus?.user?.allow_push_notifications);
    const allowPushFromLocal = String(localStorage.getItem('allowPushNotifications') || '').toLowerCase() === 'true';
    const canNotify = allowPushFromServer || allowPushFromLocal;
    if (!canNotify) return;

    const reviewed = complaints
      .filter((c) => String(c.status || '') === 'reviewed')
      .sort((a, b) => new Date(a.reviewedAt || a.createdAt || 0).getTime() - new Date(b.reviewedAt || b.createdAt || 0).getTime());

    if (!reviewed.length) return;

    const newest = reviewed[reviewed.length - 1];
    const marker = String(newest.reviewedAt || newest.createdAt || '');
    if (!marker || marker === lastSeenReviewed) return;

    showToast('Your complaint/feedback has been reviewed by admin.', 'success');
    setLastSeenReviewed(marker);
    try {
      localStorage.setItem('candidate_feedback_last_seen_reviewed', marker);
    } catch (_) {
      // ignore
    }
  }, [complaints, accountStatus, lastSeenReviewed]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.pageTitle}>Feedback & Complaints</div>
          <div className={styles.pageSubtitle}>Share your issue and follow your complaint history.</div>
        </div>
        <div className={styles.inlineBadge}>
          <FaHistory />
          <span>{pendingCount} pending</span>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.grid}>
        <div className={styles.leftPanel}>
          <div className={styles.sectionTitle}>Submit a {mode === 'feedback' ? 'Feedback' : 'Complaint'}</div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${mode === 'complaint' ? styles.toggleActive : ''}`}
              onClick={() => setMode('complaint')}
            >
              Complaint
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${mode === 'feedback' ? styles.toggleActive : ''}`}
              onClick={() => setMode('feedback')}
            >
              Feedback
            </button>
          </div>
          <textarea
            className={styles.textArea}
            rows={10}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={mode === 'feedback' ? 'Share your thoughts, suggestions or experience.' : 'Describe the problem, issue or complaint in detail.'}
          />
          <button
            type="button"
            className={styles.submitBtn}
            onClick={submitComplaint}
            disabled={submitting}
          >
            <FaPaperPlane />
            Submit {mode === 'feedback' ? 'Feedback' : 'Complaint'}
          </button>
          <div className={styles.helpText}>Your submission will be reviewed by the admin team and updated in your complaint history below.</div>
        </div>

        <div className={styles.rightPanel}>
          <div className={styles.sectionTitle}>Your complaint history</div>
          <div className={styles.list}>
            {loading ? <div className={styles.loading}>Loading history…</div> : null}
            {!loading && complaints.length === 0 ? (
              <div className={styles.emptyState}>No feedback or complaints yet.</div>
            ) : null}
            {complaints.map((item, index) => (
              <div key={`${item.createdAt}-${index}`} className={styles.historyItem}>
                <div className={styles.historyRow}>
                  <span>{item.status || 'pending'}</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CandidateFeedback;
