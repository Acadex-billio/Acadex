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
const COUPON_SCOPES = ['subscription', 'material_access', 'center_access', 'tutorship_booking', 'invite_access'];

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

const ManageBilling = () => {
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

  const [editTarget, setEditTarget] = useState(null); // { cand_id, name, plan, status, expires_at }
  const [editForm, setEditForm] = useState({ plan: '', status: '', expires_at: '' });
  const [coupons, setCoupons] = useState([]);
  const [couponStatusFilter, setCouponStatusFilter] = useState('all');
  const [couponSearch, setCouponSearch] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponEditCode, setCouponEditCode] = useState('');
  const [manualQueue, setManualQueue] = useState([]);
  const [manualQueueLoading, setManualQueueLoading] = useState(false);
  const [manualReviewingTxId, setManualReviewingTxId] = useState('');
  const [couponForm, setCouponForm] = useState({
    code: '',
    name: '',
    description: '',
    applies_to: ['subscription'],
    target_plans: [],
    outcome_type: 'amount_off',
    amount_off: 0,
    percent_off: 0,
    starts_at: '',
    expires_at: '',
    is_published: false,
  });

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
          const usersParams = new URLSearchParams({
            page: String(page),
            limit: '50',
            role: 'candidate',
          });
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

  const loadCoupons = useCallback(async () => {
    if (legacyMode) return;
    try {
      setCouponLoading(true);
      const params = new URLSearchParams();
      if (couponStatusFilter) params.set('status', couponStatusFilter);
      if (couponSearch.trim()) params.set('q', couponSearch.trim());
      const { data } = await callBillingApi('get', `/admin/billing/coupons?${params.toString()}`);
      setCoupons(Array.isArray(data?.coupons) ? data.coupons : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load coupons'), 'error');
      setCoupons([]);
    } finally {
      setCouponLoading(false);
    }
  }, [couponSearch, couponStatusFilter, legacyMode]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const loadManualQueue = useCallback(async () => {
    if (legacyMode) {
      setManualQueue([]);
      return;
    }

    try {
      setManualQueueLoading(true);
      const { data } = await callBillingApi('get', '/admin/billing/manual-payments?status=pending&limit=100');
      setManualQueue(Array.isArray(data?.queue) ? data.queue : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load manual payment queue'), 'error');
      setManualQueue([]);
    } finally {
      setManualQueueLoading(false);
    }
  }, [legacyMode]);

  useEffect(() => {
    loadManualQueue();
  }, [loadManualQueue]);

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

  const openCouponCreate = () => {
    const now = new Date();
    const end = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
    setCouponEditCode('');
    setCouponForm({
      code: '',
      name: '',
      description: '',
      applies_to: ['subscription'],
      target_plans: [],
      outcome_type: 'amount_off',
      amount_off: 0,
      percent_off: 0,
      starts_at: now.toISOString().slice(0, 10),
      expires_at: end.toISOString().slice(0, 10),
      is_published: false,
    });
    setCouponModalOpen(true);
  };

  const openCouponEdit = (coupon) => {
    setCouponEditCode(String(coupon.code || ''));
    setCouponForm({
      code: String(coupon.code || ''),
      name: String(coupon.name || ''),
      description: String(coupon.description || ''),
      applies_to: Array.isArray(coupon.applies_to) && coupon.applies_to.length ? coupon.applies_to : ['subscription'],
      target_plans: Array.isArray(coupon.target_plans) ? coupon.target_plans : [],
      outcome_type: String(coupon.outcome_type || 'amount_off'),
      amount_off: Number(coupon.amount_off || 0),
      percent_off: Number(coupon.percent_off || 0),
      starts_at: coupon.starts_at ? new Date(coupon.starts_at).toISOString().slice(0, 10) : '',
      expires_at: coupon.expires_at ? new Date(coupon.expires_at).toISOString().slice(0, 10) : '',
      is_published: Boolean(coupon.is_published),
    });
    setCouponModalOpen(true);
  };

  const closeCouponModal = () => {
    setCouponModalOpen(false);
    setCouponEditCode('');
  };

  const toggleCouponScope = (scope) => {
    setCouponForm((prev) => {
      const has = prev.applies_to.includes(scope);
      const next = has ? prev.applies_to.filter((s) => s !== scope) : [...prev.applies_to, scope];
      return { ...prev, applies_to: next.length ? next : ['subscription'] };
    });
  };

  const toggleCouponPlan = (plan) => {
    setCouponForm((prev) => {
      const has = prev.target_plans.includes(plan);
      return { ...prev, target_plans: has ? prev.target_plans.filter((p) => p !== plan) : [...prev.target_plans, plan] };
    });
  };

  const saveCoupon = async () => {
    if (legacyMode) {
      showToast('Coupon actions are unavailable in compatibility mode.', 'warning');
      return;
    }
    if (!couponForm.code.trim() || !couponForm.name.trim()) {
      showToast('Coupon code and name are required.', 'warning');
      return;
    }
    if (!couponForm.starts_at || !couponForm.expires_at) {
      showToast('Start and expiry dates are required.', 'warning');
      return;
    }

    try {
      setCouponSaving(true);
      const body = {
        code: couponForm.code.trim().toUpperCase(),
        name: couponForm.name.trim(),
        description: couponForm.description.trim(),
        applies_to: couponForm.applies_to,
        target_plans: couponForm.target_plans,
        outcome_type: couponForm.outcome_type,
        amount_off: Number(couponForm.amount_off || 0),
        percent_off: Number(couponForm.percent_off || 0),
        starts_at: new Date(`${couponForm.starts_at}T00:00:00.000Z`).toISOString(),
        expires_at: new Date(`${couponForm.expires_at}T23:59:59.999Z`).toISOString(),
        is_published: Boolean(couponForm.is_published),
      };

      if (couponEditCode) {
        await callBillingApi('put', `/admin/billing/coupons/${encodeURIComponent(couponEditCode)}`, body);
        showToast('Coupon updated.', 'success');
      } else {
        await callBillingApi('post', '/admin/billing/coupons', body);
        showToast('Coupon created.', 'success');
      }

      closeCouponModal();
      loadCoupons();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to save coupon'), 'error');
    } finally {
      setCouponSaving(false);
    }
  };

  const togglePublishCoupon = async (coupon) => {
    try {
      await callBillingApi('post', `/admin/billing/coupons/${encodeURIComponent(coupon.code)}/${coupon.is_published ? 'unpublish' : 'publish'}`);
      showToast(coupon.is_published ? 'Coupon unpublished.' : 'Coupon published.', 'success');
      loadCoupons();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update coupon status'), 'error');
    }
  };

  const deleteCoupon = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}? This revokes related access.`)) return;
    try {
      await callBillingApi('delete', `/admin/billing/coupons/${encodeURIComponent(coupon.code)}`);
      showToast('Coupon deleted.', 'success');
      loadCoupons();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete coupon'), 'error');
    }
  };

  const approveManualPayment = async (item) => {
    if (!item?.transaction_id) return;
    const optionalNote = window.prompt('Optional approval note (visible to your team):', '') || '';
    try {
      setManualReviewingTxId(String(item.transaction_id));
      await callBillingApi('post', `/admin/billing/manual-payments/${encodeURIComponent(item.transaction_id)}/approve`, {
        note: optionalNote,
      });
      showToast('Payment verified and subscription activated.', 'success');
      await Promise.all([load(), loadManualQueue()]);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to approve payment'), 'error');
    } finally {
      setManualReviewingTxId('');
    }
  };

  const rejectManualPayment = async (item) => {
    if (!item?.transaction_id) return;
    const reason = window.prompt('Reason for rejection (required):', 'Proof is invalid or incomplete');
    if (!reason || !reason.trim()) return;
    try {
      setManualReviewingTxId(String(item.transaction_id));
      await callBillingApi('post', `/admin/billing/manual-payments/${encodeURIComponent(item.transaction_id)}/reject`, {
        reason: reason.trim(),
      });
      showToast('Payment proof rejected.', 'success');
      await loadManualQueue();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to reject payment'), 'error');
    } finally {
      setManualReviewingTxId('');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Manage Billing</h1>
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

      <div className={styles.couponHeaderRow}>
        <h2 className={styles.sectionTitle}>Manual Payment Verification Queue</h2>
        <div className={styles.controls}>
          <button className={styles.saveBtn} type="button" onClick={loadManualQueue} disabled={manualQueueLoading || legacyMode}>
            {manualQueueLoading ? 'Refreshing...' : 'Refresh queue'}
          </button>
        </div>
      </div>

      {legacyMode ? (
        <div className={styles.emptyState}>Manual verification queue is unavailable in compatibility mode.</div>
      ) : manualQueueLoading ? (
        <GraduationCapLoader label="Loading manual payment queue..." />
      ) : manualQueue.length === 0 ? (
        <div className={styles.emptyState}>No pending manual payment verifications.</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Proof Message</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {manualQueue.map((item) => {
                const pendingAction = manualReviewingTxId === String(item.transaction_id);
                return (
                  <tr key={item.transaction_id}>
                    <td>
                      <div>{item.candidate_name || '-'}</div>
                      <div className={styles.smallMuted}>{maskCandidateId(item.cand_id)}</div>
                      <div className={styles.smallMuted}>{item.candidate_email || '-'}</div>
                    </td>
                    <td>{String(item.requested_plan || '').toUpperCase()}</td>
                    <td>{item.amount} {item.currency}</td>
                    <td>{item.proof_text || '-'}</td>
                    <td>{fmt(item.submitted_at || item.createdAt)}</td>
                    <td>
                      <button
                        className={`${styles.actionBtn} ${styles.editBtn}`}
                        type="button"
                        disabled={pendingAction}
                        onClick={() => approveManualPayment(item)}
                      >
                        {pendingAction ? 'Please wait...' : 'Approve'}
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.cancelBtn}`}
                        type="button"
                        disabled={pendingAction}
                        onClick={() => rejectManualPayment(item)}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.couponHeaderRow}>
        <h2 className={styles.sectionTitle}>Coupons</h2>
        <div className={styles.controls}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search coupon code/name"
            value={couponSearch}
            onChange={(e) => setCouponSearch(e.target.value)}
          />
          <select className={styles.filterSelect} value={couponStatusFilter} onChange={(e) => setCouponStatusFilter(e.target.value)}>
            <option value="all">All coupons</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="expired">Expired</option>
          </select>
          <button className={styles.saveBtn} type="button" onClick={openCouponCreate}>New Coupon</button>
        </div>
      </div>

      {couponLoading ? (
        <GraduationCapLoader label="Loading coupons…" />
      ) : coupons.length === 0 ? (
        <div className={styles.emptyState}>No coupons found.</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Outcome</th>
                <th>Scopes</th>
                <th>Plans</th>
                <th>Window</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => {
                const isExpired = coupon.expires_at ? new Date(coupon.expires_at).getTime() < Date.now() : false;
                const statusLabel = coupon.is_published ? (isExpired ? 'expired' : 'published') : 'draft';
                return (
                  <tr key={coupon.code}>
                    <td>{coupon.code}</td>
                    <td>{coupon.name}</td>
                    <td>
                      {coupon.outcome_type === 'free'
                        ? 'Free'
                        : coupon.outcome_type === 'percent_off'
                          ? `${Number(coupon.percent_off || 0)}% off`
                          : `${Number(coupon.amount_off || 0)} XAF off`}
                    </td>
                    <td>{Array.isArray(coupon.applies_to) ? coupon.applies_to.join(', ') : 'subscription'}</td>
                    <td>{Array.isArray(coupon.target_plans) && coupon.target_plans.length ? coupon.target_plans.join(', ') : 'all'}</td>
                    <td>{fmt(coupon.starts_at)} → {fmt(coupon.expires_at)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[statusLabel] || ''}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td>
                      <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => openCouponEdit(coupon)}>Edit</button>
                      <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => togglePublishCoupon(coupon)}>
                        {coupon.is_published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button className={`${styles.actionBtn} ${styles.cancelBtn}`} onClick={() => deleteCoupon(coupon)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>
              Edit Subscription — {editTarget.name}
            </h2>

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

      {couponModalOpen ? (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>{couponEditCode ? 'Edit Coupon' : 'Create Coupon'}</h2>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Code</label>
              <input
                className={styles.formControl}
                value={couponForm.code}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, code: e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 30) }))}
                disabled={Boolean(couponEditCode)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Name</label>
              <input className={styles.formControl} value={couponForm.name} onChange={(e) => setCouponForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <input className={styles.formControl} value={couponForm.description} onChange={(e) => setCouponForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Applies To</label>
              <div className={styles.inlineChecks}>
                {COUPON_SCOPES.map((scope) => (
                  <label key={scope} className={styles.checkLabel}>
                    <input type="checkbox" checked={couponForm.applies_to.includes(scope)} onChange={() => toggleCouponScope(scope)} />
                    <span>{scope}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Outcome</label>
              <select className={styles.formControl} value={couponForm.outcome_type} onChange={(e) => setCouponForm((prev) => ({ ...prev, outcome_type: e.target.value }))}>
                <option value="amount_off">Amount Off</option>
                <option value="percent_off">Percent Off</option>
                <option value="free">Free</option>
              </select>
            </div>

            {couponForm.outcome_type === 'amount_off' ? (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Amount Off (XAF)</label>
                <input className={styles.formControl} type="number" min="0" value={couponForm.amount_off} onChange={(e) => setCouponForm((prev) => ({ ...prev, amount_off: Number(e.target.value || 0) }))} />
              </div>
            ) : null}

            {couponForm.outcome_type === 'percent_off' ? (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Percent Off</label>
                <input className={styles.formControl} type="number" min="0" max="100" value={couponForm.percent_off} onChange={(e) => setCouponForm((prev) => ({ ...prev, percent_off: Number(e.target.value || 0) }))} />
              </div>
            ) : null}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Target Subscription Plans (optional)</label>
              <div className={styles.inlineChecks}>
                {['pro', 'paygo'].map((plan) => (
                  <label key={plan} className={styles.checkLabel}>
                    <input type="checkbox" checked={couponForm.target_plans.includes(plan)} onChange={() => toggleCouponPlan(plan)} />
                    <span>{plan}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Starts At</label>
              <input className={styles.formControl} type="date" value={couponForm.starts_at} onChange={(e) => setCouponForm((prev) => ({ ...prev, starts_at: e.target.value }))} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Expires At</label>
              <input className={styles.formControl} type="date" value={couponForm.expires_at} onChange={(e) => setCouponForm((prev) => ({ ...prev, expires_at: e.target.value }))} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={couponForm.is_published} onChange={(e) => setCouponForm((prev) => ({ ...prev, is_published: e.target.checked }))} />
                <span>Publish now</span>
              </label>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.closeBtn} onClick={closeCouponModal}>Cancel</button>
              <button className={styles.saveBtn} disabled={couponSaving} onClick={saveCoupon}>
                {couponSaving ? 'Saving…' : 'Save Coupon'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ManageBilling;
