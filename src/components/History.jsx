import React, { useEffect, useMemo, useState } from 'react';
import styles from '../Astyles/history.module.css';
import api from '../services/api';
import { getErrorMessage } from '../utility/getErrorMessage';

const fmt = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch (_) {
    return String(d || '');
  }
};

export default function History() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [materialSummary, setMaterialSummary] = useState(null);
  const [chatStats, setChatStats] = useState(null);
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState(() => {
    try {
      const raw = localStorage.getItem('candidate_hidden_history_ids');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  useEffect(() => {
    // No need for axios defaults when using api service
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const me = await api.get('/auth/me');
      const candId = me.data?.user?.cand_id;
      if (!candId) {
        setLogs([]);
        setMaterialSummary(null);
        setChatStats(null);
        return;
      }

      const [h, m, c] = await Promise.all([
        api.get(`/candidate/history/${encodeURIComponent(candId)}`),
        api.get('/candidate/analytics/materials/summary?period=month'),
        api.get('/candidate/analytics/chat/stats?period=month&limit=8'),
      ]);

      setLogs(Array.isArray(h.data?.logs) ? h.data.logs : []);
      setMaterialSummary(m.data || null);
      setChatStats(c.data || null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load history'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('candidate_hidden_history_ids', JSON.stringify(hiddenHistoryIds));
    } catch (_) {
      // ignore
    }
  }, [hiddenHistoryIds]);

  const visibleLogs = useMemo(
    () => logs.filter((item) => !hiddenHistoryIds.includes(String(item.history_id))),
    [logs, hiddenHistoryIds]
  );

  const clearVisibleHistoryOnly = () => {
    const ids = logs.map((item) => String(item.history_id));
    setHiddenHistoryIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const materialBreakdown = useMemo(() => {
    const rows = Array.isArray(materialSummary?.breakdown) ? materialSummary.breakdown : [];
    const pick = (type, action) => rows.find((r) => r.content_type === type && r.action === action)?.count || 0;
    return {
      qpDownloads: pick('question_paper', 'download'),
      qpPreviews: pick('question_paper', 'preview'),
      reportDownloads: pick('report', 'download'),
      reportPreviews: pick('report', 'preview'),
      presDownloads: pick('presentation', 'download'),
      presPreviews: pick('presentation', 'preview'),
    };
  }, [materialSummary]);

  const recentRooms = useMemo(() => {
    const rooms = Array.isArray(chatStats?.recent_rooms) ? chatStats.recent_rooms : [];
    return rooms.filter(Boolean);
  }, [chatStats]);

  return (
    <div className={styles.container}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 className={styles.title}>Your Activity & History</h2>
        <button
          type="button"
          onClick={load}
          style={{
            border: 'none',
            background: '#0f172a',
            color: '#fff',
            padding: '10px 12px',
            borderRadius: 10,
            cursor: 'pointer',
            fontWeight: 800,
          }}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: '#fee2e2', color: '#b91c1c', fontWeight: 800 }}>
          {error}
        </div>
      ) : null}

      {loading ? <div className={styles.loading}>Loading...</div> : null}

      {!loading ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
            <div
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: 14,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.10)',
              }}
            >
              <div style={{ fontWeight: 900, color: '#0f172a', marginBottom: 10 }}>Materials (Last 30 days)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, color: '#0f172a' }}>
                <div>Question papers: Downloads {materialBreakdown.qpDownloads} • Previews {materialBreakdown.qpPreviews}</div>
                <div>Reports: Downloads {materialBreakdown.reportDownloads} • Previews {materialBreakdown.reportPreviews}</div>
                <div>Presentations: Downloads {materialBreakdown.presDownloads} • Previews {materialBreakdown.presPreviews}</div>
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: 14,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.10)',
              }}
            >
              <div style={{ fontWeight: 900, color: '#0f172a', marginBottom: 10 }}>Chat (Last 30 days)</div>
              <div style={{ color: '#0f172a' }}>
                <div>Messages sent: {chatStats?.messages_sent ?? 0}</div>
                <div>Average message rate: {Number(chatStats?.avg_messages_per_day || 0).toFixed(2)} / day</div>
              </div>
              <div style={{ marginTop: 10, fontWeight: 800, color: '#0f172a' }}>Recent rooms</div>
              {recentRooms.length === 0 ? (
                <div style={{ marginTop: 6, color: '#475569' }}>No recent rooms.</div>
              ) : (
                <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  {recentRooms.map((r) => (
                    <div
                      key={String(r.room_id)}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid rgba(15,23,42,0.08)',
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <div style={{ fontWeight: 900, color: '#0f172a' }}>{r.room_name || 'Chat Room'}</div>
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        Type: {r.room_type || '-'}
                        {r.last_message?.createdAt ? ` • Last message: ${fmt(r.last_message.createdAt)}` : ''}
                      </div>
                      {r.last_message?.text ? (
                        <div style={{ marginTop: 6, color: '#0f172a' }}>{r.last_message.text}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 16, fontWeight: 900, color: '#0f172a' }}>Full history log</div>

          <div style={{ marginTop: 10, marginBottom: 8 }}>
            <button
              type="button"
              onClick={clearVisibleHistoryOnly}
              style={{
                border: 'none',
                background: '#b91c1c',
                color: '#fff',
                padding: '10px 12px',
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: 800,
              }}
              disabled={logs.length === 0}
            >
              Clear Full History (This View Only)
            </button>
          </div>

          {visibleLogs.length === 0 ? (
            <div className={styles.empty}>No history available yet.</div>
          ) : (
            <ul className={styles.list}>
              {visibleLogs.map((item) => (
                <li key={item.history_id} className={styles.item}>
                  <div className={styles.action}>{item.action}</div>
                  <div className={styles.meta}>
                    {item.content_type} — {item.content_title}
                  </div>
                  <div className={styles.time}>{fmt(item.timestamp)}</div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
