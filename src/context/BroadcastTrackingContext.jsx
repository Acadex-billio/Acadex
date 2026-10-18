import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { useAuth } from './AuthContext';
import styles from '../Astyles/BroadcastProgressTracker.module.css';

const STORAGE_KEY = 'acadexBroadcastJobs';
const BroadcastTrackingContext = createContext(null);

const readStoredJobs = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('[BroadcastTracking] Stored job references could not be read:', error);
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }
};

const BroadcastProgress = ({ job, onDismiss }) => {
  const total = Math.max(0, Number(job.total) || 0);
  const processed = Math.min(total, Math.max(0, Number(job.processed) || 0));
  const progress = total ? processed / total : 0;
  const pending = Math.max(0, Number(job.pending ?? total - processed) || 0);
  const circumference = 2 * Math.PI * 19;
  const complete = ['completed', 'failed'].includes(job.status);
  const kindLabel = job.kind === 'email' ? 'Email broadcast' : 'Push notification';
  const failures = Array.isArray(job.failedRecipients) ? job.failedRecipients : [];
  const pollError = job.pollError || '';

  if (!complete) {
    return (
      <aside className={styles.floating} aria-live="polite" aria-label={`${kindLabel} progress`}>
        <div className={styles.progressRing}>
          <svg viewBox="0 0 48 48" role="img" aria-label={`${processed} of ${total} processed`}>
            <circle className={styles.ringTrack} cx="24" cy="24" r="19" />
            <circle
              className={styles.ringProgress}
              cx="24"
              cy="24"
              r="19"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <span>{pending}</span>
        </div>
        <div className={styles.progressCopy}>
          <strong>{kindLabel} in progress</strong>
          <span>{processed} of {total} final outcomes · {pending} pending</span>
          {job.kind === 'email' && <span>{Number(job.accepted) || 0} accepted by provider, awaiting outcome as applicable</span>}
          <span>Batch {Math.min(job.batchesProcessed || 0, job.totalBatches || 0)} of {job.totalBatches || 0}</span>
          {pollError && <span className={styles.pollWarning} role="status">{pollError}</span>}
        </div>
      </aside>
    );
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="broadcast-complete-title">
        <button type="button" className={styles.closeButton} onClick={onDismiss} aria-label="Close broadcast results">×</button>
        <div className={styles.completeIcon} aria-hidden="true">{job.status === 'failed' ? '!' : '✓'}</div>
        <h2 id="broadcast-complete-title">{job.status === 'failed' ? 'Broadcast interrupted' : 'Broadcast complete'}</h2>
        <p className={styles.modalSubtitle}>{kindLabel} · {processed} of {total} final outcomes</p>

        <div className={`${styles.summary} ${job.kind === 'email' ? styles.emailSummary : ''}`}>
          <div>
            <strong>{job.succeeded || 0}</strong>
            <span>{job.kind === 'email' ? 'Delivered to mail server' : 'Accepted by push service'}</span>
          </div>
          <div className={styles.failedSummary}>
            <strong>{job.failed || 0}</strong>
            <span>Failed</span>
          </div>
          {job.kind === 'email' && (
            <div className={styles.pendingSummary}>
              <strong>{pending}</strong>
              <span>Awaiting delivery result</span>
            </div>
          )}
        </div>

        {job.kind === 'email' && (
          <p className={styles.deliveryNote}>
            Delivery means Resend confirmed receipt by the recipient's mail server. It does not confirm inbox placement or that the message was read.
          </p>
        )}
        {job.kind === 'push' && (
          <p className={styles.deliveryNote}>
            Accepted means the push service accepted the notification. Web Push does not confirm that it appeared on or was read on the recipient's device.
          </p>
        )}
        {job.error && <p className={styles.jobError}>{job.error}</p>}

        {failures.length > 0 && (
          <div className={styles.failedList}>
            <h3>Failed recipients ({failures.length})</h3>
            <ul>
              {failures.map((recipient, index) => (
                <li key={`${recipient.email}-${index}`}>
                  <strong>{recipient.email}</strong>
                  <span>{recipient.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button type="button" className={styles.dismissButton} onClick={onDismiss}>Close</button>
      </section>
    </div>
  );
};

export const BroadcastTrackingProvider = ({ children }) => {
  const { user } = useAuth();
  const owner = String(user?.cand_id || user?.email || '');
  const [job, setJob] = useState(null);
  const requestInFlight = useRef(false);
  const pollFailures = useRef(0);

  useEffect(() => {
    if (!owner) {
      setJob(null);
      return;
    }
    const storedJobId = readStoredJobs()[owner];
    setJob(storedJobId ? { id: storedJobId, status: 'queued' } : null);
  }, [owner]);

  const startTracking = useCallback((jobDetails) => {
    if (!owner) throw new Error('Sign in to track this broadcast.');
    const storedJobs = readStoredJobs();
    storedJobs[owner] = jobDetails.jobId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedJobs));
    pollFailures.current = 0;
    setJob({
      id: jobDetails.jobId,
      kind: jobDetails.kind,
      status: 'queued',
      total: jobDetails.total,
      processed: 0,
      succeeded: 0,
      failed: 0,
      accepted: 0,
      pending: jobDetails.total,
      totalBatches: jobDetails.totalBatches,
      batchesProcessed: 0,
      failedRecipients: [],
      pollError: '',
    });
  }, [owner]);

  const dismiss = useCallback(() => {
    const storedJobs = readStoredJobs();
    delete storedJobs[owner];
    if (Object.keys(storedJobs).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(storedJobs));
    else localStorage.removeItem(STORAGE_KEY);
    setJob(null);
  }, [owner]);

  useEffect(() => {
    if (!job?.id || ['completed', 'failed'].includes(job.status)) return undefined;
    let cancelled = false;

    const poll = async () => {
      if (requestInFlight.current) return;
      requestInFlight.current = true;
      try {
        const { data } = await api.get(`/developer/alerts/jobs/${encodeURIComponent(job.id)}`, {
          params: { _statusCheck: Date.now() },
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (cancelled) return;
        pollFailures.current = 0;
        if (data?.job) setJob({ ...data.job, pollError: '' });
      } catch (error) {
        if (cancelled) return;
        if ([403, 404].includes(error?.response?.status)) {
          showToast(error?.response?.data?.message || 'This broadcast job is no longer available.', 'warning');
          dismiss();
          return;
        }
        pollFailures.current += 1;
        setJob((current) => current?.id === job.id
          ? { ...current, pollError: 'Progress refresh is temporarily unavailable. Retrying automatically…' }
          : current);
        if (pollFailures.current === 3) {
          showToast(error?.response?.data?.message || 'Unable to refresh broadcast progress. Retrying…', 'warning');
        }
      } finally {
        requestInFlight.current = false;
      }
    };

    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [dismiss, job?.id, job?.status]);

  const value = {
    job,
    isActive: Boolean(job && !['completed', 'failed'].includes(job.status)),
    startTracking,
  };

  return (
    <BroadcastTrackingContext.Provider value={value}>
      {children}
      {job && <BroadcastProgress job={job} onDismiss={dismiss} />}
    </BroadcastTrackingContext.Provider>
  );
};

export const useBroadcastTracking = () => {
  const context = useContext(BroadcastTrackingContext);
  if (!context) throw new Error('useBroadcastTracking must be used within BroadcastTrackingProvider');
  return context;
};
