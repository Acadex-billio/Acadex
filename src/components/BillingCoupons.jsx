import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import api from '../services/api';
import authService from '../services/authService';
import styles from '../Astyles/ManageBilling.module.css';
import GraduationCapLoader from './GraduationCapLoader';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';

const COUPON_SCOPES = ['subscription', 'material_access', 'center_access', 'tutorship_booking', 'invite_access'];
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

const BillingCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [couponStatusFilter, setCouponStatusFilter] = useState('all');
  const [couponSearch, setCouponSearch] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponEditCode, setCouponEditCode] = useState('');
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
  const [legacyMode, setLegacyMode] = useState(false);

  const loadCoupons = useCallback(async () => {
    try {
      setCouponLoading(true);
      const params = new URLSearchParams();
      if (couponStatusFilter) params.set('status', couponStatusFilter);
      if (couponSearch.trim()) params.set('q', couponSearch.trim());
      const { data } = await callBillingApi('get', `/admin/billing/coupons?${params.toString()}`);
      setCoupons(Array.isArray(data?.coupons) ? data.coupons : []);
      setLegacyMode(false);
    } catch (err) {
      if (err?.response?.status === 404) {
        setLegacyMode(true);
        showToast('Coupon API is not deployed on this backend yet.', 'warning');
        setCoupons([]);
      } else {
        showToast(getErrorMessage(err, 'Failed to load coupons'), 'error');
        setCoupons([]);
      }
    } finally {
      setCouponLoading(false);
    }
  }, [couponSearch, couponStatusFilter]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

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

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>Coupons</h2>
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

      {legacyMode && (
        <div className={styles.legacyWarning}>Coupon management is unavailable because the billing API is not deployed on this backend.</div>
      )}

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
                    <td>{coupon.starts_at ? new Date(coupon.starts_at).toLocaleDateString() : '—'} → {coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[statusLabel] || ''}`}>{statusLabel}</span>
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

      {couponModalOpen && (
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
      )}
    </div>
  );
};

export default BillingCoupons;
