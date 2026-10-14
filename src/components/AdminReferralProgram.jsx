import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/ReferralProgram.module.css';
import GraduationCapLoader from './GraduationCapLoader';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';
import { useTranslation } from 'react-i18next';

const PURCHASE_TYPES = [
  ['subscription', 'Subscriptions'],
  ['material_access', 'Materials'],
  ['center_access', 'Chat centers'],
  ['tutorship_booking', 'Tutorship bookings'],
  ['concours_partnership', 'Concours partnerships'],
];

const DEFAULT_PROGRAM = {
  is_active: false,
  title: 'Acadex Referral Program',
  description: '',
  rules: [],
  benefits: [],
};

const AdminReferralProgram = () => {
  const { t } = useTranslation();
  const [program, setProgram] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [redemptionFilter, setRedemptionFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [programResponse, redemptionResponse] = await Promise.all([
        api.get('/admin/referrals/program'),
        api.get(`/admin/referrals/redemptions?status=${redemptionFilter}`),
      ]);
      setProgram({ ...DEFAULT_PROGRAM, ...programResponse.data?.program });
      setRedemptions(Array.isArray(redemptionResponse.data?.redemptions) ? redemptionResponse.data.redemptions : []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, t('referralProgram.adminLoadError')));
    } finally {
      setLoading(false);
    }
  }, [redemptionFilter, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateProgram = (patch) => setProgram((current) => ({ ...current, ...patch }));

  const updateRule = (index, patch) => {
    setProgram((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule),
    }));
  };

  const updateBenefit = (index, patch) => {
    setProgram((current) => ({
      ...current,
      benefits: current.benefits.map((benefit, benefitIndex) => benefitIndex === index ? { ...benefit, ...patch } : benefit),
    }));
  };

  const addRule = (trigger) => {
    const code = `${trigger === 'first_purchase' ? 'first' : 'purchase'}-${Date.now()}`;
    setProgram((current) => ({
      ...current,
      rules: [...current.rules, {
        code,
        trigger,
        purchase_type: trigger === 'each_purchase' ? 'subscription' : null,
        referrer_points: 0,
        referred_points: 0,
        is_active: true,
      }],
    }));
  };

  const addBenefit = (mode) => {
    setProgram((current) => ({
      ...current,
      benefits: [...current.benefits, {
        code: `benefit-${Date.now()}`,
        name: '',
        description: '',
        mode,
        points_required: 100,
        is_active: true,
      }],
    }));
  };

  const saveProgram = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = {
        is_active: program.is_active,
        title: program.title,
        description: program.description,
        rules: program.rules,
        benefits: program.benefits,
      };
      const response = await api.put('/admin/referrals/program', payload);
      setProgram({ ...DEFAULT_PROGRAM, ...response.data.program });
      showToast(t('referralProgram.programSaved'), 'success');
    } catch (saveError) {
      showToast(getErrorMessage(saveError, t('referralProgram.adminSaveError')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const reviewRedemption = async (redemption, decision) => {
    try {
      await api.put(`/admin/referrals/redemptions/${redemption._id}`, { decision });
      showToast(
        decision === 'fulfilled' ? t('referralProgram.fulfilledToast') : t('referralProgram.rejectedToast'),
        'success'
      );
      await loadData();
    } catch (reviewError) {
      showToast(getErrorMessage(reviewError, t('referralProgram.reviewError')), 'error');
    }
  };

  if (loading && !program) return <GraduationCapLoader fullscreen label={t('common.loading')} />;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('referralProgram.candidateTitleAdmin')}</h1>
          <p className={styles.subtitle}>{t('referralProgram.adminSubtitle')}</p>
        </div>
      </header>
      {error ? <div className={styles.error}>{error}</div> : null}
      {program ? (
        <form onSubmit={saveProgram}>
          <section className={styles.section}>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label} htmlFor="program-title">{t('referralProgram.programName')}</label>
                <input id="program-title" className={styles.input} value={program.title} maxLength={120} onChange={(event) => updateProgram({ title: event.target.value })} required />
              </div>
              <div>
                <label className={styles.label}>{t('referralProgram.programStatus')}</label>
                <label className={styles.inlineControl}>
                  <input className={styles.check} type="checkbox" checked={program.is_active} onChange={(event) => updateProgram({ is_active: event.target.checked })} />
                  {t('referralProgram.programActive')}
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className={styles.label} htmlFor="program-description">{t('referralProgram.explanation')}</label>
                <textarea id="program-description" className={styles.textarea} value={program.description} maxLength={1000} onChange={(event) => updateProgram({ description: event.target.value })} />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('referralProgram.pointsRulesAdmin')}</h2>
              <div className={styles.formActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => addRule('first_purchase')}>{t('referralProgram.addFirstPurchaseRule')}</button>
                <button type="button" className={styles.secondaryButton} onClick={() => addRule('each_purchase')}>{t('referralProgram.addRepeatPurchaseRule')}</button>
              </div>
            </div>
            <p className={styles.itemText}>{t('referralProgram.rulesHelp')}</p>
            <div className={styles.list} style={{ marginTop: 14 }}>
              {program.rules.map((rule, index) => (
                <article className={styles.item} key={`${rule.code}-${index}`}>
                  <div className={styles.formGrid}>
                    <div>
                      <label className={styles.label}>{t('referralProgram.ruleCode')}</label>
                      <input className={styles.input} value={rule.code} maxLength={50} onChange={(event) => updateRule(index, { code: event.target.value })} required />
                    </div>
                    <div>
                      <label className={styles.label}>{t('referralProgram.rewardEvent')}</label>
                      <select className={styles.select} value={rule.trigger} onChange={(event) => updateRule(index, {
                        trigger: event.target.value,
                        purchase_type: event.target.value === 'each_purchase' ? 'subscription' : null,
                      })}>
                        <option value="first_purchase">{t('referralProgram.firstSuccessfulPurchase')}</option>
                        <option value="each_purchase">{t('referralProgram.eachPurchaseOfType')}</option>
                      </select>
                    </div>
                    {rule.trigger === 'each_purchase' ? (
                      <div>
                        <label className={styles.label}>{t('referralProgram.purchaseType')}</label>
                        <select className={styles.select} value={rule.purchase_type} onChange={(event) => updateRule(index, { purchase_type: event.target.value })}>
                          {PURCHASE_TYPES.map(([value]) => (
                            <option value={value} key={value}>{t(`referralProgram.${{
                              subscription: 'subscriptions',
                              material_access: 'materials',
                              center_access: 'chatCenters',
                              tutorship_booking: 'tutorshipBookings',
                              concours_partnership: 'concoursPartnerships',
                            }[value]}`)}</option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div>
                      <label className={styles.label}>{t('referralProgram.referrerPoints')}</label>
                      <input className={styles.input} type="number" min="0" max="1000000" step="1" value={rule.referrer_points} onChange={(event) => updateRule(index, { referrer_points: Number(event.target.value) })} />
                    </div>
                    <div>
                      <label className={styles.label}>{t('referralProgram.referredPoints')}</label>
                      <input className={styles.input} type="number" min="0" max="1000000" step="1" value={rule.referred_points} onChange={(event) => updateRule(index, { referred_points: Number(event.target.value) })} />
                    </div>
                    <div className={styles.formActions}>
                      <label className={styles.inlineControl}>
                        <input className={styles.check} type="checkbox" checked={rule.is_active} onChange={(event) => updateRule(index, { is_active: event.target.checked })} />
                        {t('referralProgram.active')}
                      </label>
                      <button type="button" className={styles.dangerButton} onClick={() => updateProgram({ rules: program.rules.filter((_, ruleIndex) => ruleIndex !== index) })}>{t('referralProgram.remove')}</button>
                    </div>
                  </div>
                </article>
              ))}
              {!program.rules.length ? <p className={styles.empty}>{t('referralProgram.noRulesAdmin')}</p> : null}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('referralProgram.benefitsAdmin')}</h2>
              <div className={styles.formActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => addBenefit('automatic')}>{t('referralProgram.addAutomatic')}</button>
                <button type="button" className={styles.secondaryButton} onClick={() => addBenefit('redeem')}>{t('referralProgram.addRedeemable')}</button>
              </div>
            </div>
            <p className={styles.itemText}>{t('referralProgram.benefitsHelp')}</p>
            <div className={styles.list} style={{ marginTop: 14 }}>
              {program.benefits.map((benefit, index) => (
                <article className={styles.item} key={`${benefit.code}-${index}`}>
                  <div className={styles.formGrid}>
                    <div>
                      <label className={styles.label}>{t('referralProgram.benefitCode')}</label>
                      <input className={styles.input} value={benefit.code} maxLength={50} onChange={(event) => updateBenefit(index, { code: event.target.value })} required />
                    </div>
                    <div>
                      <label className={styles.label}>{t('referralProgram.benefitName')}</label>
                      <input className={styles.input} value={benefit.name} maxLength={120} onChange={(event) => updateBenefit(index, { name: event.target.value })} required />
                    </div>
                    <div>
                      <label className={styles.label}>{t('referralProgram.benefitType')}</label>
                      <select className={styles.select} value={benefit.mode} onChange={(event) => updateBenefit(index, { mode: event.target.value })}>
                        <option value="automatic">{t('referralProgram.automaticUnlock')}</option>
                        <option value="redeem">{t('referralProgram.reviewedRedemption')}</option>
                      </select>
                    </div>
                    <div>
                      <label className={styles.label}>{t('referralProgram.pointsThreshold')}</label>
                      <input className={styles.input} type="number" min="1" max="1000000" step="1" value={benefit.points_required} onChange={(event) => updateBenefit(index, { points_required: Number(event.target.value) })} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className={styles.label}>{t('referralProgram.whatBenefitDoes')}</label>
                      <textarea className={styles.textarea} value={benefit.description} maxLength={1000} onChange={(event) => updateBenefit(index, { description: event.target.value })} />
                    </div>
                    <div className={styles.formActions}>
                      <label className={styles.inlineControl}>
                        <input className={styles.check} type="checkbox" checked={benefit.is_active} onChange={(event) => updateBenefit(index, { is_active: event.target.checked })} />
                        {t('referralProgram.published')}
                      </label>
                      <button type="button" className={styles.dangerButton} onClick={() => updateProgram({ benefits: program.benefits.filter((_, benefitIndex) => benefitIndex !== index) })}>{t('referralProgram.remove')}</button>
                    </div>
                  </div>
                </article>
              ))}
              {!program.benefits.length ? <p className={styles.empty}>{t('referralProgram.noBenefitsAdmin')}</p> : null}
            </div>
          </section>

          <div className={styles.formActions}>
            <button className={styles.button} type="submit" disabled={saving}>{saving ? t('referralProgram.saving') : t('referralProgram.saveProgram')}</button>
          </div>
        </form>
      ) : null}

      <section className={styles.section} style={{ marginTop: 28 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('referralProgram.redemptionRequests')}</h2>
          <select className={styles.select} style={{ width: 'auto' }} value={redemptionFilter} onChange={(event) => setRedemptionFilter(event.target.value)}>
            <option value="pending">{t('referralProgram.pending')}</option>
            <option value="fulfilled">{t('referralProgram.fulfilled')}</option>
            <option value="rejected">{t('referralProgram.rejected')}</option>
            <option value="all">{t('referralProgram.all')}</option>
          </select>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>{t('referralProgram.candidate')}</th><th>{t('referralProgram.benefitName')}</th><th>{t('referralProgram.points')}</th><th>{t('referralProgram.status')}</th><th>{t('referralProgram.requested')}</th><th>{t('referralProgram.review')}</th></tr>
            </thead>
            <tbody>
              {redemptions.map((redemption) => (
                <tr key={redemption._id}>
                  <td>{redemption.candidate_id?.name || redemption.candidate_id?.cand_id || 'Candidate'}</td>
                  <td>{redemption.benefit_name}</td>
                  <td>{redemption.points_spent}</td>
                  <td className={styles.status}>{redemption.status}</td>
                  <td>{new Date(redemption.createdAt).toLocaleDateString()}</td>
                  <td>
                    {redemption.status === 'pending' ? (
                      <div className={styles.formActions}>
                        <button type="button" className={styles.button} onClick={() => reviewRedemption(redemption, 'fulfilled')}>{t('referralProgram.fulfill')}</button>
                        <button type="button" className={styles.dangerButton} onClick={() => reviewRedemption(redemption, 'rejected')}>{t('referralProgram.reject')}</button>
                      </div>
                    ) : redemption.review_note || '—'}
                  </td>
                </tr>
              ))}
              {!redemptions.length ? <tr><td colSpan="6">{t('referralProgram.noRequests')}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
};

export default AdminReferralProgram;
