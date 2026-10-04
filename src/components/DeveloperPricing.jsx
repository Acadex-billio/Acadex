import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/DeveloperPricing.module.css';

const PLAN_ORDER = ['basic', 'pro', 'paygo', 'full-package'];
const MATERIAL_ORDER = ['report', 'presentation', 'question_paper'];
const PLAN_LABELS = {
  basic: 'Basic',
  pro: 'Pro',
  paygo: 'PAYGO',
  'full-package': 'Full Package',
};
const MATERIAL_LABELS = {
  report: 'Report',
  presentation: 'Presentation',
  question_paper: 'Question Paper',
};

const PLAN_FEATURES = {
  basic: [
    'Preview only for the first 3 pages.',
    'No full preview or downloads.',
    'No AI or center access.',
  ],
  pro: [
    'Full preview and download access.',
    'AI study mode included.',
    'Group tools available.',
  ],
  paygo: [
    'Preview first 3 pages before payment.',
    'Pay per material action used.',
    'Center and AI actions are chargeable.',
  ],
  'full-package': [
    'All materials included for free.',
    'AI access included without checkout.',
    'Groups are fully unlocked during validity.',
  ],
};

const toCurrencyString = (value) => Number(value || 0).toFixed(2);

const DeveloperPricing = () => {
  const [pricing, setPricing] = useState(null);
  const [publishedAt, setPublishedAt] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadPricing = async () => {
    try {
      const res = await api.get('/admin/pricing');
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to load pricing');
      const pricingData = res.data.pricing || {};
      setPricing(pricingData);
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
        const key = keys[i];
        if (!cursor[key] || typeof cursor[key] !== 'object') {
          cursor[key] = {};
        } else {
          cursor[key] = { ...cursor[key] };
        }
        cursor = cursor[key];
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

  const getNestedValue = (obj, path, fallback = 0) => {
    const keys = path.split('.');
    let cursor = obj;
    for (const key of keys) {
      cursor = cursor?.[key];
      if (cursor === undefined) return fallback;
    }
    return cursor !== undefined ? cursor : fallback;
  };

  if (!pricing) return <div className={styles.loading}>Loading pricing settings...</div>;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Developer billing</div>
          <h2 className={styles.title}>Pricing control center</h2>
          <p className={styles.subtitle}>Configure the exact subscription and material rules used by the platform. Values that are left empty default back to the safe zero-rate baseline.</p>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Plans</span>
            <strong>{PLAN_ORDER.length}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Materials</span>
            <strong>{MATERIAL_ORDER.length}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Published</span>
            <strong>{publishedAt ? new Date(publishedAt).toLocaleDateString() : 'Draft'}</strong>
          </div>
        </div>
      </section>

      <section className={styles.cardSection}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionEyebrow}>Plans</div>
            <h3>Subscription cards</h3>
          </div>
          <span>One source of truth for candidate pricing</span>
        </div>

        <div className={styles.planGrid}>
          {PLAN_ORDER.map((plan) => {
            const price = Number(getNestedValue(pricing, `plans.${plan}.price`, 0));
            const currency = String(getNestedValue(pricing, `plans.${plan}.currency`, 'XAF'));
            const durationDays = Number(getNestedValue(pricing, `plans.${plan}.durationDays`, getNestedValue(pricing, `plans.${plan}.duration_days`, 90)));
            const description = String(getNestedValue(pricing, `plans.${plan}.description`, PLAN_FEATURES[plan][0] || 'Subscription access.'));

            return (
              <article key={plan} className={styles.planCard}>
                <div className={styles.planCardTop}>
                  <span className={styles.planBadge}>{PLAN_LABELS[plan]}</span>
                  <span className={styles.planPrice}>{price === 0 ? 'Free' : `${Number(price).toFixed(2)} ${currency}`}</span>
                </div>

                <div className={styles.planMetaBlock}>
                  <div className={styles.metaLabel}>Validity</div>
                  <div className={styles.metaValue}>{durationDays} days</div>
                </div>

                <p className={styles.planDescription}>{description}</p>

                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Price</span>
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={toCurrencyString(price)}
                      onChange={(e) => setField(`plans.${plan}.price`, Number(e.target.value || 0))}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Duration</span>
                    <input
                      className={styles.input}
                      type="number"
                      min="1"
                      step="1"
                      value={String(durationDays)}
                      onChange={(e) => setField(`plans.${plan}.durationDays`, Number(e.target.value || 90))}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Currency</span>
                    <input
                      className={styles.input}
                      type="text"
                      maxLength="5"
                      value={currency}
                      onChange={(e) => setField(`plans.${plan}.currency`, e.target.value.toUpperCase())}
                    />
                  </label>
                </div>

                <ul className={styles.featureList}>
                  {(PLAN_FEATURES[plan] || []).map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.cardSection}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionEyebrow}>Materials</div>
            <h3>Material access rules</h3>
          </div>
          <span>Set 0 for free access or at least 100 XAF for paid actions.</span>
        </div>

        <div className={styles.materialGrid}>
          {MATERIAL_ORDER.map((material) => (
            <article key={material} className={styles.materialCard}>
              <div className={styles.materialTitle}>{MATERIAL_LABELS[material]}</div>

              <div className={styles.materialPlanStack}>
                <div className={styles.materialPlanRow}>
                  <div className={styles.planMiniLabel}>Basic</div>
                  <div className={styles.materialFieldGrid}>
                    <label className={styles.field}>
                      <span>Preview pages</span>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        step="1"
                        value={String(getNestedValue(pricing, `materials.${material}.plan_pricing.basic.preview_pages`, 3))}
                        onChange={(e) => setField(`materials.${material}.plan_pricing.basic.preview_pages`, Number(e.target.value || 1))}
                      />
                    </label>
                  </div>
                </div>

                <div className={styles.materialPlanRow}>
                  <div className={styles.planMiniLabel}>PAYGO</div>
                  <div className={styles.materialFieldGrid}>
                    <label className={styles.field}>
                      <span>Preview pages</span>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        step="1"
                        value={String(getNestedValue(pricing, `materials.${material}.plan_pricing.paygo.preview_pages`, 3))}
                        onChange={(e) => setField(`materials.${material}.plan_pricing.paygo.preview_pages`, Number(e.target.value || 1))}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Preview price</span>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        step="0.01"
                        value={toCurrencyString(getNestedValue(pricing, `materials.${material}.plan_pricing.paygo.preview_price`, 0))}
                        onChange={(e) => setField(`materials.${material}.plan_pricing.paygo.preview_price`, Number(e.target.value || 0))}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Download price</span>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        step="0.01"
                        value={toCurrencyString(getNestedValue(pricing, `materials.${material}.plan_pricing.paygo.download_price`, 0))}
                        onChange={(e) => setField(`materials.${material}.plan_pricing.paygo.download_price`, Number(e.target.value || 0))}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Access mins</span>
                      <input
                        className={styles.input}
                        type="number"
                        min="1"
                        step="1"
                        value={String(getNestedValue(pricing, `materials.${material}.plan_pricing.paygo.access_minutes`, 60))}
                        onChange={(e) => setField(`materials.${material}.plan_pricing.paygo.access_minutes`, Number(e.target.value || 60))}
                      />
                    </label>
                  </div>
                </div>

                <div className={styles.materialPlanRow}>
                  <div className={styles.planMiniLabel}>Full Package</div>
                  <div className={styles.materialFieldGrid}>
                    <label className={styles.field}>
                      <span>Included</span>
                      <input className={styles.input} type="text" value="Included" readOnly />
                    </label>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.bottomGrid}>
        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionEyebrow}>Center</div>
              <h3>Center actions</h3>
            </div>
          </div>

          {['create', 'join'].map((action) => (
            <div key={action} className={styles.inlineGroup}>
              <div className={styles.inlineHeader}>{action === 'create' ? 'Create center' : 'Join center'}</div>
              <div className={styles.inlineGrid}>
                {PLAN_ORDER.map((plan) => (
                  <label key={`${action}-${plan}`} className={styles.field}>
                    <span>{PLAN_LABELS[plan]}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={toCurrencyString(getNestedValue(pricing, `center.${action}.${plan}.amount`))}
                      onChange={(e) => setField(`center.${action}.${plan}.amount`, Number(e.target.value || 0))}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionEyebrow}>AI + partner</div>
              <h3>Study and partner pricing</h3>
            </div>
          </div>

          <div className={styles.inlineGridSingle}>
            <label className={styles.field}>
              <span>AI session price</span>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={toCurrencyString(getNestedValue(pricing, 'ai_study_mode.session_price'))}
                onChange={(e) => setField('ai_study_mode.session_price', Number(e.target.value || 0))}
              />
            </label>
            <p className={styles.sectionEyebrow}>Set 0 for free sessions; paid checkouts require at least 100 XAF.</p>

            <label className={styles.field}>
              <span>Concours partnership fee</span>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={toCurrencyString(getNestedValue(pricing, 'concours_partnership.amount'))}
                onChange={(e) => setField('concours_partnership.amount', Number(e.target.value || 0))}
              />
            </label>
          </div>
        </section>

        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionEyebrow}>Uploads</div>
              <h3>Candidate project upload fees</h3>
            </div>
          </div>

          <div className={styles.inlineGridSingle}>
            {['HND', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER', 'BTS'].map((program) => (
              <label key={program} className={styles.field}>
                <span>{program}</span>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={toCurrencyString(getNestedValue(pricing, `candidate_project_upload.${program}`))}
                  onChange={(e) => setField(`candidate_project_upload.${program}`, Number(e.target.value || 0))}
                />
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={savePricing} disabled={saving} className={styles.saveBtn}>
          {saving ? 'Saving...' : 'Save pricing'}
        </button>
        <button type="button" onClick={publishPricing} disabled={saving} className={styles.publishBtn}>
          Publish now
        </button>
      </div>
    </div>
  );
};

export default DeveloperPricing;
