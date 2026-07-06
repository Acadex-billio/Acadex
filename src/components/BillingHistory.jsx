import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/adminHistory.module.css';

const fmt = (value) => {
  try {
    return value ? new Date(value).toLocaleString() : '—';
  } catch (_) {
    return String(value || '—');
  }
};

const renderValue = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const BillingHistory = ({ onCreateAccess }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const normalizeStatus = (value) => {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'grant-success' || status === 'successful' || status === 'success') return 'successful';
    if (status === 'grant-expired' || status === 'expired') return 'expired';
    if (status === 'grant-failed' || status === 'failed') return 'failed';
    if (status === 'pending') return 'pending';
    if (status === 'cancelled') return 'cancelled';
    return status;
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/purchase-history');
      setRecords(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load purchase history'));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return records.filter((item) => {
      if (typeFilter !== 'all' && item.item_type !== typeFilter) return false;
      if (statusFilter !== 'all' && normalizeStatus(item.status) !== statusFilter) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return [
        item.candidate_name,
        item.candidate_email,
        item.plan,
        item.item_type,
        item.item_title,
        item.provider_reference,
        item.item_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [records, search, statusFilter, typeFilter]);

  return (
    <div className={styles.container}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h2 className={styles.title}>Purchase History</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className={styles.pagerBtn} onClick={onCreateAccess}>
            Create Access History
          </button>
          <button type="button" className={styles.pagerBtn} onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr', marginTop: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by candidate, plan, item or reference"
            className={styles.pagerBtn}
            style={{ width: '100%', minWidth: 0 }}
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={styles.pagerBtn}>
            <option value="all">All item types</option>
            <option value="plan">Subscription</option>
            <option value="paper">Question Paper</option>
            <option value="report">Report</option>
            <option value="presentation">Presentation</option>
            <option value="center">Center Access</option>
            <option value="ai_mode">AI Access</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.pagerBtn}>
            <option value="all">All statuses</option>
            <option value="successful">Successful</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {loading ? (
        <GraduationCapLoader fullscreen label="Loading purchase history…" />
      ) : filtered.length === 0 ? (
        <div className={styles.panelBody} style={{ marginTop: 18 }}>No purchases found.</div>
      ) : (
        <div className={styles.table} style={{ marginTop: 18, overflowX: 'auto' }}>
          <div className={styles.logRow} style={{ fontWeight: 900, background: '#f8fafc', gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr 1fr 1fr 1fr' }}>
            <div>Candidate</div>
            <div>Item</div>
            <div>Type</div>
            <div>Plan</div>
            <div>Amount</div>
            <div>Status</div>
            <div>Paid</div>
          </div>
          {filtered.map((item) => (
            <div key={`${item._id}-${item.provider_reference || item.paid_at}`} className={styles.logRow} style={{ gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr 1fr 1fr 1fr' }}>
              <div>
                <div>{renderValue(item.candidate_name, 'Unknown')}</div>
                <div className={styles.small}>{renderValue(item.candidate_email)}</div>
              </div>
              <div>
                <div>{renderValue(item.item_title, renderValue(item.item_id, 'Subscription'))}</div>
                {item.item_id ? <div className={styles.small}>ID: {renderValue(item.item_id)}</div> : null}
                {item.provider_reference ? <div className={styles.small}>Ref: {renderValue(item.provider_reference)}</div> : null}
              </div>
              <div>{renderValue(item.item_type)}</div>
              <div>{renderValue(item.plan)}</div>
              <div>{Number(item.amount || 0).toFixed(2)} {renderValue(item.currency, 'XAF')}</div>
              <div>{renderValue(item.status)}</div>
              <div>{fmt(item.paid_at || item.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BillingHistory;
