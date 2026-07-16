import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/DeveloperPricing.module.css';

const toCurrencyString = (value) => Number(value || 0).toFixed(2);

const DeveloperPricing = () => {
  const [pricing, setPricing] = useState(null);
  const [publishedAt, setPublishedAt] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadPricing = async () => {
    try {
      const res = await api.get('/admin/pricing');
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to load pricing');
      setPricing(res.data.pricing || {});
      setPublishedAt(res.data.published_at || null);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to load pricing settings.'), 'error');
    }
  };

  useEffect(() => {
    loadPricing();
  }, []);

  const setField = (path, value) => {
    setPricing((prev) => {
      const next = { ...(prev || {}) };
      const keys = path.split('.');
      let cursor = next;
      for (let i = 0; i < keys.length - 1; i += 1) {
        cursor[keys[i]] = { ...(cursor[keys[i]] || {}) };
        cursor = cursor[keys[i]];
      }
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const savePricing = async () => {
    try {
      setSaving(true);
      const res = await api.put('/admin/pricing', { pricing });
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to save pricing');
      showToast('Pricing settings saved.', 'success');
      await loadPricing();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to save pricing settings.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const publishPricing = async () => {
    try {
      setSaving(true);
      const res = await api.post('/admin/pricing/publish');
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to publish pricing');
      showToast('Pricing published successfully.', 'success');
      await loadPricing();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to publish pricing.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!pricing) return <div className={styles.loading}>Loading pricing settings...</div>;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h2 className={styles.title}>Pricing Control Center</h2>
        <p className={styles.subtitle}>Manage all platform prices centrally. Unset values default to 0.00.</p>
        <p className={styles.publishMeta}>Published at: {publishedAt ? new Date(publishedAt).toLocaleString() : 'Not published yet'}</p>
      </section>

      <div className={styles.grid}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Plans</h3>
        {['basic', 'pro', 'paygo', 'full-package'].map((plan) => (
          <div key={plan} className={styles.row}>
            <label className={styles.label}>{plan === 'full-package' ? 'FULL PACKAGE' : plan.toUpperCase()} Plan Price (XAF)</label>
            <input className={styles.input} type="number" min="0" step="0.01" value={toCurrencyString(pricing?.plans?.[plan]?.price)} onChange={(e) => setField(`plans.${plan}.price`, Number(e.target.value || 0))} />
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>PAYGO Material Charges</h3>
        {['report', 'presentation', 'question_paper'].map((material) => (
          <React.Fragment key={material}>
            <div className={styles.subTitle}>{material.replace('_', ' ').toUpperCase()}</div>
            <div className={styles.row}>
              <label className={styles.label}>Basic Preview Price</label>
              <input className={styles.input} type="number" min="0" step="0.01" value={toCurrencyString(pricing?.materials?.[material]?.basic_full_preview_price)} onChange={(e) => setField(`materials.${material}.basic_full_preview_price`, Number(e.target.value || 0))} />
            </div>
            <div className={styles.row}>
              <label className={styles.label}>Basic Download Price</label>
              <input className={styles.input} type="number" min="0" step="0.01" value={toCurrencyString(pricing?.materials?.[material]?.basic_download_price)} onChange={(e) => setField(`materials.${material}.basic_download_price`, Number(e.target.value || 0))} />
            </div>
            <div className={styles.row}>
              <label className={styles.label}>PAYGO Full Preview Price</label>
              <input className={styles.input} type="number" min="0" step="0.01" value={toCurrencyString(pricing?.materials?.[material]?.paygo_full_preview_price)} onChange={(e) => setField(`materials.${material}.paygo_full_preview_price`, Number(e.target.value || 0))} />
            </div>
            <div className={styles.row}>
              <label className={styles.label}>PAYGO Download Price</label>
              <input className={styles.input} type="number" min="0" step="0.01" value={toCurrencyString(pricing?.materials?.[material]?.paygo_download_price)} onChange={(e) => setField(`materials.${material}.paygo_download_price`, Number(e.target.value || 0))} />
            </div>
          </React.Fragment>
        ))}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Center Pricing By Plan</h3>
        {['create', 'join'].map((action) => (
          <React.Fragment key={action}>
            <div className={styles.subTitle}>{action.toUpperCase()} Center</div>
            {['basic', 'pro', 'paygo', 'full-package'].map((plan) => (
              <div key={`${action}-${plan}`} className={styles.row}>
                <label className={styles.label}>{plan === 'full-package' ? 'FULL PACKAGE' : plan.toUpperCase()}</label>
                <input className={styles.input} type="number" min="0" step="0.01" value={toCurrencyString(pricing?.center?.[action]?.[plan]?.amount)} onChange={(e) => setField(`center.${action}.${plan}.amount`, Number(e.target.value || 0))} />
              </div>
            ))}
          </React.Fragment>
        ))}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>AI Study Mode</h3>
        <div className={styles.row}>
          <label className={styles.label}>Session Price (XAF)</label>
          <input className={styles.input} type="number" min="0" step="0.01" value={toCurrencyString(pricing?.ai_study_mode?.session_price)} onChange={(e) => setField('ai_study_mode.session_price', Number(e.target.value || 0))} />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Candidate Project Upload Fees</h3>
        {['HND', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER', 'BTS'].map((program) => (
          <div key={program} className={styles.row}>
            <label className={styles.label}>{program}</label>
            <input className={styles.input} type="number" min="0" step="0.01" value={toCurrencyString(pricing?.candidate_project_upload?.[program])} onChange={(e) => setField(`candidate_project_upload.${program}`, Number(e.target.value || 0))} />
          </div>
        ))}
      </section>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={savePricing} disabled={saving} className={styles.saveBtn}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={publishPricing} disabled={saving} className={styles.publishBtn}>
          Publish
        </button>
      </div>
    </div>
  );
};

export default DeveloperPricing;
