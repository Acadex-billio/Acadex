import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import api from '../services/api';
import authService from '../services/authService';
import styles from '../Astyles/ManageBilling.module.css';
import GraduationCapLoader from './GraduationCapLoader';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { maskCandidateId } from '../utility/maskCandidateId';

const PLANS = ['basic', 'pro', 'paygo'];
const STATUSES = ['active', 'expired'];

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const billingApi = axios.create({ timeout: 30000 });

const callBillingApi = async (method, url, data) => {
  const token = authService.getToken();
  return billingApi({
    method,
    baseURL: api?.defaults?.baseURL,
    url,
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
};

const BillingPlans = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [legacyMode, setLegacyMode] = useState(false);
  const [legacyNoticeShown, setLegacyNoticeShown] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ plan: '', status: '', expires_at: '' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (planFilter) params.set('plan', planFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const { data } = await callBillingApi('get', `/admin/billing/subscriptions?${params.toString()}`);
      setLegacyMode(false);
      setSubscriptions(Array.isArray(data?.subscriptions) ? data.subscriptions : []);
      if (data?.pagination) {
        setPagination(data.pagination);
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        try {
          const usersParams = new URLSearchParams({ page: String(page), limit: '50', role: 'candidate' });
          if (search.trim()) usersParams.set('q', search.trim());
          const { data } = await api.get(`/admin/users?${usersParams.toString()}`);
          const users = Array.isArray(data?.users) ? data.users : [];
          const mapped = users.map((u) => ({
            cand_id: u.cand_id,
            name: u.name,
            email: u.email,
            plan: 'basic',
            status: 'active',
            activated_at: null,
            expires_at: null,
            last_payment_at: null,
          }));
          const filtered = mapped.filter((item) => {
            if (planFilter && item.plan !== planFilter) return false;
            if (statusFilter && item.status !== statusFilter) return false;
            return true;
          });
          setLegacyMode(true);
          if (!legacyNoticeShown) {
            showToast('Billing API is not deployed on this backend yet. Showing read-only compatibility list.', 'warning');
            setLegacyNoticeShown(true);
          }
          setSubscriptions(filtered);
          setPagination(data?.pagination || {
            page,
            limit: 50,
            total: filtered.length,
            totalPages: 1,
          });
        } catch (fallbackErr) {
          showToast(getErrorMessage(fallbackErr, 'Failed to load compatibility subscription list'), 'error');
        }
      } else {
        showToast(getErrorMessage(err, 'Failed to load subscriptions'), 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [legacyNoticeShown, page, planFilter, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [planFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const all = subscriptions;
    return {
      total: pagination.total,
      pro: all.filter((s) => s.plan === 'pro').length,
      paygo: all.filter((s) => s.plan === 'paygo').length,
      expired: all.filter((s) => s.status === 'expired').length,
    };
  }, [subscriptions, pagination.total]);

  const openEdit = (sub) => {
    setEditTarget(sub);
    setEditForm({
      plan: sub.plan,
      status: sub.status,
      expires_at: sub.expires_at ? new Date(sub.expires_at).toISOString().slice(0, 10) : '',
    });
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditForm({ plan: '', status: '', expires_at: '' });
  };

  const handleSave = async () => {
    if (!editTarget) return;
    if (legacyMode) {
      showToast('Billing edit actions are unavailable until the backend billing routes are deployed.', 'warning');
      return;
    }
    try {
      setSaving(true);
      const body = {
        plan: editForm.plan,
        status: editForm.status,
        expires_at: editForm.expires_at || null,
      };
      await callBillingApi('put', `/admin/billing/subscriptions/${encodeURIComponent(editTarget.cand_id)}`, body);
      showToast('Subscription updated', 'success');
      closeEdit();
      load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update subscription'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (sub) => {
    if (legacyMode) {
      showToast('Billing cancel actions are unavailable until the backend billing routes are deployed.', 'warning');
      return;
    }
    if (!window.confirm(`Cancel subscription for ${sub.name} (${maskCandidateId(sub.cand_id)})?`)) return;
    try {
      await callBillingApi('delete', `/admin/billing/subscriptions/${encodeURIComponent(sub.cand_id)}`);
      showToast('Subscription cancelled', 'success');
      load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to cancel subscription'), 'error');
    }
  };

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>User Plans</h2>
        <div className={styles.controls}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search name, email, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={styles.filterSelect} value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
            <option value="">All plans</option>
            {PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
          <select className={styles.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Subscribers</span>
          <span className={styles.statValue}>{pagination.total}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pro</span>
          <span className={styles.statValue}>{stats.pro}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pay-Go</span>
          <span className={styles.statValue}>{stats.paygo}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Expired</span>
          <span className={styles.statValue}>{stats.expired}</span>
        </div>
      </div>

      {legacyMode && (
        <div className={styles.legacyWarning}>
          Billing routes are not available on the current backend deployment yet. This view is currently read-only compatibility mode.
        </div>
      )}

      {loading ? (
        <GraduationCapLoader label="Loading subscriptions…" />
      ) : subscriptions.length === 0 ? (
        <div className={styles.emptyState}>No subscriptions found.</div>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Candidate ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Activated</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
                  <tr key={sub.cand_id}>
                    <td>{maskCandidateId(sub.cand_id)}</td>
                    <td>{sub.name}</td>
                    <td>{sub.email}</td>
                    <td>
                      <span className={`${styles.planBadge} ${styles[sub.plan] || ''}`}>
                        {sub.plan}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[sub.status] || ''}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td>{fmt(sub.activated_at)}</td>
                    <td>{fmt(sub.expires_at)}</td>
                    <td>
                      <button
                        className={`${styles.actionBtn} ${styles.editBtn}`}
                        onClick={() => openEdit(sub)}
                        disabled={legacyMode}
                      >
                        Edit
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.cancelBtn}`}
                        onClick={() => handleCancel(sub)}
                        disabled={legacyMode || (sub.status === 'expired' && sub.plan === 'basic')}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹ Prev
            </button>
            <span className={styles.pageInfo}>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              className={styles.pageBtn}
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next ›
            </button>
          </div>
        </>
      )}

      {editTarget && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Edit Subscription — {editTarget.name}</h2>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Plan</label>
              <select
                className={styles.formControl}
                value={editForm.plan}
                onChange={(e) => setEditForm((f) => ({ ...f, plan: e.target.value }))}
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Status</label>
              <select
                className={styles.formControl}
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Expires At</label>
              <input
                className={styles.formControl}
                type="date"
                value={editForm.expires_at}
                onChange={(e) => setEditForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
            </div>

            <div className={styles.modalActions}>
              <button className={styles.closeBtn} onClick={closeEdit}>Cancel</button>
              <button className={styles.saveBtn} disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPlans;
