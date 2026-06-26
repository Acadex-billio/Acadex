import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';

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

  if (!pricing) return <div style={{ padding: 24 }}>Loading pricing settings...</div>;

  const sectionCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginTop: 14 };
  const row = { display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(140px, 180px)', gap: 10, alignItems: 'center', marginBottom: 10 };
  const input = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
      <h2 style={{ marginBottom: 8 }}>PRICING</h2>
      <p style={{ color: '#475569', marginTop: 0 }}>Manage all platform prices centrally. Unset values default to 00.00.</p>
      <p style={{ color: '#334155', marginTop: 0 }}>Published at: {publishedAt ? new Date(publishedAt).toLocaleString() : 'Not published yet'}</p>

      <div style={sectionCard}>
        <h3>Plans</h3>
        {['basic', 'pro', 'paygo'].map((plan) => (
          <div key={plan} style={row}>
            <label>{plan.toUpperCase()} Plan Price (XAF)</label>
            <input type="number" min="0" step="0.01" value={toCurrencyString(pricing?.plans?.[plan]?.price)} onChange={(e) => setField(`plans.${plan}.price`, Number(e.target.value || 0))} style={input} />
          </div>
        ))}
      </div>

      <div style={sectionCard}>
        <h3>PAYGO Material Charges</h3>
        {['report', 'presentation', 'question_paper'].map((material) => (
          <React.Fragment key={material}>
            <div style={{ fontWeight: 700, marginTop: 10, marginBottom: 8 }}>{material.replace('_', ' ').toUpperCase()}</div>
            <div style={row}>
              <label>Full Preview Price</label>
              <input type="number" min="0" step="0.01" value={toCurrencyString(pricing?.materials?.[material]?.paygo_full_preview_price)} onChange={(e) => setField(`materials.${material}.paygo_full_preview_price`, Number(e.target.value || 0))} style={input} />
            </div>
            <div style={row}>
              <label>Download Price</label>
              <input type="number" min="0" step="0.01" value={toCurrencyString(pricing?.materials?.[material]?.paygo_download_price)} onChange={(e) => setField(`materials.${material}.paygo_download_price`, Number(e.target.value || 0))} style={input} />
            </div>
          </React.Fragment>
        ))}
      </div>

      <div style={sectionCard}>
        <h3>Center Pricing By Plan</h3>
        {['create', 'join'].map((action) => (
          <React.Fragment key={action}>
            <div style={{ fontWeight: 700, marginTop: 10, marginBottom: 8 }}>{action.toUpperCase()} Center</div>
            {['basic', 'pro', 'paygo'].map((plan) => (
              <div key={`${action}-${plan}`} style={row}>
                <label>{plan.toUpperCase()}</label>
                <input type="number" min="0" step="0.01" value={toCurrencyString(pricing?.center?.[action]?.[plan]?.amount)} onChange={(e) => setField(`center.${action}.${plan}.amount`, Number(e.target.value || 0))} style={input} />
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div style={sectionCard}>
        <h3>AI Study Mode</h3>
        <div style={row}>
          <label>Session Price (XAF)</label>
          <input type="number" min="0" step="0.01" value={toCurrencyString(pricing?.ai_study_mode?.session_price)} onChange={(e) => setField('ai_study_mode.session_price', Number(e.target.value || 0))} style={input} />
        </div>
      </div>

      <div style={sectionCard}>
        <h3>Candidate Project Upload Fees</h3>
        {['HND', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER', 'BTS'].map((program) => (
          <div key={program} style={row}>
            <label>{program}</label>
            <input type="number" min="0" step="0.01" value={toCurrencyString(pricing?.candidate_project_upload?.[program])} onChange={(e) => setField(`candidate_project_upload.${program}`, Number(e.target.value || 0))} style={input} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={savePricing} disabled={saving} style={{ border: 'none', background: '#0369a1', color: '#fff', borderRadius: 9, padding: '10px 14px' }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={publishPricing} disabled={saving} style={{ border: '1px solid #0369a1', background: '#fff', color: '#0369a1', borderRadius: 9, padding: '10px 14px' }}>
          Publish
        </button>
      </div>
    </div>
  );
};

export default DeveloperPricing;
