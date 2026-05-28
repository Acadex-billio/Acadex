import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/adminHistory.module.css';

const fmt = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch (_) {
    return String(d || '');
  }
};

const AdminHistory = () => {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusStats, setStatusStats] = useState(null);
  const [recentMaterials, setRecentMaterials] = useState(null);
  const [recentAnnouncements, setRecentAnnouncements] = useState([]);
  const [filterName, setFilterName] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const load = async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: '25' });
      if (filterName.trim()) params.set('candidate_name', filterName.trim());
      if (filterAction.trim()) params.set('action', filterAction.trim());
      if (filterFrom) params.set('from', new Date(filterFrom).toISOString());
      if (filterTo) params.set('to', new Date(filterTo).toISOString());

      const [h, s, m, a] = await Promise.all([
        api.get(`/ai-tools/history?${params.toString()}`),
        api.get('/ai-tools/accounts/status-stats'),
        api.get('/ai-tools/materials/recent?limit=5'),
        api.get('/ai-tools/announcements/recent?limit=5'),
      ]);

      setLogs(Array.isArray(h.data?.logs) ? h.data.logs : []);
      setPage(h.data?.pagination?.page || p);
      setTotal(h.data?.pagination?.total || 0);

      setStatusStats(s.data || null);
      setRecentMaterials(m.data?.materials || null);
      setRecentAnnouncements(Array.isArray(a.data?.announcements) ? a.data.announcements : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load admin history'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pages = useMemo(() => {
    const per = 25;
    return Math.max(1, Math.ceil((total || 0) / per));
  }, [total]);

  if (loading) return <GraduationCapLoader fullscreen label="Loading history dashboard..." />;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Admin Activity & History</h2>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Current Candidate Status</div>
          <div className={styles.panelBody}>
            <div>Active: {statusStats?.current?.active ?? '-'}</div>
            <div>Suspended: {statusStats?.current?.suspended ?? '-'}</div>
            <div>Blocked: {statusStats?.current?.blocked ?? '-'}</div>
            <div className={styles.small}>
              Avg suspensions/month: {Number(statusStats?.averages?.suspensions_per_month || 0).toFixed(2)}
            </div>
            <div className={styles.small}>
              Avg blocks/month: {Number(statusStats?.averages?.blocks_per_month || 0).toFixed(2)}
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle}>Recently Added Materials</div>
          <div className={styles.panelBody}>
            {(recentMaterials?.question_papers || []).map((x) => (
              <div key={x.id} className={styles.rowItem}>
                <span className={styles.tag}>Paper</span>
                <span>{x.title}</span>
                <span className={styles.small}>{fmt(x.created_at)}</span>
              </div>
            ))}
            {(recentMaterials?.reports || []).map((x) => (
              <div key={x.id} className={styles.rowItem}>
                <span className={styles.tag}>Report</span>
                <span>{x.title}</span>
                <span className={styles.small}>{fmt(x.created_at)}</span>
              </div>
            ))}
            {(recentMaterials?.presentations || []).map((x) => (
              <div key={x.id} className={styles.rowItem}>
                <span className={styles.tag}>PPT</span>
                <span>{x.title}</span>
                <span className={styles.small}>{fmt(x.created_at)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle}>Recent Announcements</div>
          <div className={styles.panelBody}>
            {recentAnnouncements.map((x) => (
              <div key={x.announcement_id} className={styles.rowItem}>
                <span className={styles.tag}>Ann</span>
                <span>{x.title}</span>
                <span className={styles.small}>{fmt(x.created_at)}</span>
              </div>
            ))}
            {recentAnnouncements.length === 0 ? <div className={styles.small}>No announcements.</div> : null}
          </div>
        </div>
      </div>

      <div className={styles.historyHeader}>
        <div className={styles.panelTitle}>Platform History Logs</div>
        <div className={styles.pager}>
          <button className={styles.pagerBtn} type="button" onClick={() => load(Math.max(1, page - 1))} disabled={loading || page <= 1}>
            Prev
          </button>
          <span className={styles.small}>
            Page {page} / {pages}
          </span>
          <button
            className={styles.pagerBtn}
            type="button"
            onClick={() => load(Math.min(pages, page + 1))}
            disabled={loading || page >= pages}
          >
            Next
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <input
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          placeholder="Filter by candidate name"
          style={{ height: 40, borderRadius: 10, border: '1px solid #cbd5e1', padding: '0 10px' }}
        />
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          style={{ height: 40, borderRadius: 10, border: '1px solid #cbd5e1', padding: '0 10px' }}
        >
          <option value="">All activity types</option>
          <option value="preview">Preview</option>
          <option value="download">Download</option>
        </select>
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
        <button type="button" className={styles.pagerBtn} onClick={() => load(1)} disabled={loading}>
          Apply Filters
        </button>
      </div>

      {loading ? <div className={styles.small}>Loading...</div> : null}

      <div className={styles.table}>
        {logs.map((l) => (
          <div key={l.history_id} className={styles.logRow}>
            <div className={styles.user}>{l.user_name || l.user_id}</div>
            <div className={styles.action}>{l.action}</div>
            <div className={styles.meta}>
              {l.content_type} — {l.content_title}
            </div>
            <div className={styles.time}>{fmt(l.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminHistory;
