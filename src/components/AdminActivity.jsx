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

const AdminActivity = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [filterName, setFilterName] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filterName.trim()) params.set('candidate_name', filterName.trim());
      if (filterAction.trim()) params.set('action', filterAction.trim());
      if (filterFrom) params.set('from', new Date(filterFrom).toISOString());
      if (filterTo) params.set('to', new Date(filterTo).toISOString());

      const res = await api.get(`/ai-tools/history?${params.toString()}`);
      setLogs(Array.isArray(res.data?.logs) ? res.data.logs : []);
      setTotal(res.data?.pagination?.total || 0);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load activity log.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <GraduationCapLoader fullscreen label="Loading admin activity…" />;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h2>Activity Log</h2>
          <p className={styles.subtitle}>Recent platform actions from candidates and admins.</p>
        </div>
        <div className={styles.summaryBadge}>{total} events</div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <input
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          placeholder="Filter by username"
          style={{ height: 40, borderRadius: 10, border: '1px solid #cbd5e1', padding: '0 10px' }}
        />
        <input
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          placeholder="Filter by activity"
          style={{ height: 40, borderRadius: 10, border: '1px solid #cbd5e1', padding: '0 10px' }}
        />
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          style={{ height: 40, borderRadius: 10, border: '1px solid #cbd5e1', padding: '0 10px' }}
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          style={{ height: 40, borderRadius: 10, border: '1px solid #cbd5e1', padding: '0 10px' }}
        />
        <button type="button" onClick={loadLogs} className={styles.summaryBadge} style={{ border: 'none', cursor: 'pointer' }}>
          Apply Filters
        </button>
      </div>

      <div className={styles.logList}>
        {logs.length === 0 ? (
          <div className={styles.emptyState}>No recent activity found.</div>
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

export default AdminActivity;
