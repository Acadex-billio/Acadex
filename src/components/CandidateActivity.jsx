import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../utility/getErrorMessage';
import GraduationCapLoader from './GraduationCapLoader';
import styles from '../Astyles/activity.module.css';

const formatDate = (value) => {
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return String(value || '');
  }
};

const CandidateActivity = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  const loadActivity = async () => {
    setLoading(true);
    setError('');
    try {
      const me = await api.get('/auth/me');
      const candId = me.data?.user?.cand_id;
      if (!candId) throw new Error('Candidate ID not available');
      const res = await api.get(`/candidate/history/${encodeURIComponent(candId)}`);
      const logsArray = Array.isArray(res.data?.logs) ? res.data.logs : [];
      setLogs(logsArray);
      setTotal(logsArray.length);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load your activity.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, []);

  if (loading) return <GraduationCapLoader fullscreen label="Loading activity…" />;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h2>Your Activity</h2>
          <p className={styles.subtitle}>Track your recent downloads, previews, and page actions.</p>
        </div>
        <div className={styles.summaryBadge}>{total} records</div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.logList}>
        {logs.length === 0 ? (
          <div className={styles.emptyState}>No activity records available.</div>
        ) : (
          logs.map((item) => (
            <div key={item.history_id} className={styles.logRow}>
              <div className={styles.logHeader}>
                <span className={styles.logUser}>{item.user_name || item.user_id}</span>
                <span className={styles.logTime}>{formatDate(item.timestamp)}</span>
              </div>
              <div className={styles.logAction}>{item.action}</div>
              <div className={styles.logMeta}>{item.content_type} — {item.content_title}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CandidateActivity;
