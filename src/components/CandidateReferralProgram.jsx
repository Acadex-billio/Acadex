import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/ReferralProgram.module.css';
import GraduationCapLoader from './GraduationCapLoader';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';
import { useTranslation } from 'react-i18next';

const CandidateReferralProgram = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [redeemingCode, setRedeemingCode] = useState('');

  const loadProgram = useCallback(async () => {
    setError('');
    try {
      const response = await api.get('/candidate/referral');
      setData(response.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError, t('referralProgram.candidateLoadError')));
    }
  }, [t]);

  useEffect(() => {
    loadProgram();
  }, [loadProgram]);

  const copyReferralLink = async () => {
    const link = data?.referral_link
      ? new URL(data.referral_link, window.location.origin).toString()
      : '';
    try {
      await navigator.clipboard.writeText(link);
      showToast(t('referralProgram.linkCopied'), 'success');
    } catch (copyError) {
      showToast(getErrorMessage(copyError, t('referralProgram.copyFailed')), 'error');
    }
  };

  const redeemBenefit = async (benefit) => {
    setRedeemingCode(benefit.code);
    try {
      await api.post('/candidate/referral/redemptions', { benefitCode: benefit.code });
      showToast(t('referralProgram.redemptionSent'), 'success');
      await loadProgram();
    } catch (redeemError) {
      showToast(getErrorMessage(redeemError, t('referralProgram.reviewError')), 'error');
    } finally {
      setRedeemingCode('');
    }
  };

  if (!data && !error) return <GraduationCapLoader fullscreen label="Loading referral program..." />;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{data.program.title || t('referralProgram.candidateTitle')}</h1>
          <p className={styles.subtitle}>{t('referralProgram.candidateSubtitle')}</p>
        </div>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {data ? (
        <>
          {!data.program.active ? (
            <div className={styles.notice}>{t('referralProgram.inactiveNotice')}</div>
          ) : null}

          <section className={styles.grid} aria-label="Points summary">
            <article className={styles.card}>
              <p className={styles.cardLabel}>{t('referralProgram.availablePoints')}</p>
              <p className={styles.cardValue}>{data.points.balance}</p>
            </article>
            <article className={styles.card}>
              <p className={styles.cardLabel}>{t('referralProgram.lifetimePoints')}</p>
              <p className={styles.cardValue}>{data.points.lifetime_earned}</p>
            </article>
            <article className={styles.card}>
              <p className={styles.cardLabel}>{t('referralProgram.referredFriends')}</p>
              <p className={styles.cardValue}>{data.referral_count}</p>
            </article>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('referralProgram.yourLink')}</h2>
            <p className={styles.itemText}>{t('referralProgram.friendInstructions')}</p>
            <div className={styles.shareRow} style={{ marginTop: 12 }}>
              <div className={styles.shareField}>
                <label className={styles.label} htmlFor="candidate-referral-code">{t('referralProgram.code')}</label>
                <input id="candidate-referral-code" className={styles.input} readOnly value={data.referral_code} />
              </div>
              <div className={styles.shareField}>
                <label className={styles.label} htmlFor="candidate-referral-link">{t('referralProgram.link')}</label>
                <input
                  id="candidate-referral-link"
                  className={styles.input}
                  readOnly
                  value={new URL(data.referral_link, window.location.origin).toString()}
                />
              </div>
              <button type="button" className={styles.button} onClick={copyReferralLink}>{t('referralProgram.copyLink')}</button>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('referralProgram.pointsRules')}</h2>
            </div>
            {data.program.description ? <p className={styles.itemText}>{data.program.description}</p> : null}
            {data.program.rules.length ? (
              <div className={styles.list}>
                {data.program.rules.map((rule) => (
                  <div className={styles.item} key={rule.code}>
                    <p className={styles.itemTitle}>
                      {rule.trigger === 'first_purchase'
                        ? t('referralProgram.firstPurchase')
                        : t('referralProgram.eachPurchase', { type: t(`referralProgram.${{
                          subscription: 'subscriptions',
                          material_access: 'materials',
                          center_access: 'chatCenters',
                          tutorship_booking: 'tutorshipBookings',
                          concours_partnership: 'concoursPartnerships',
                        }[rule.purchase_type] || 'materials'}`) })}
                    </p>
                    <p className={styles.itemText}>
                      {rule.referrer_points > 0
                        ? t('referralProgram.youEarn', { points: rule.referrer_points })
                        : t('referralProgram.noReferrerPoints')}
                      {rule.referred_points > 0 ? `; ${t('referralProgram.friendEarns', { points: rule.referred_points })}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>{t('referralProgram.noRules')}</p>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('referralProgram.benefits')}</h2>
            <div className={styles.list} style={{ marginTop: 12 }}>
              {data.benefits.length ? data.benefits.map((benefit) => (
                <article className={styles.item} key={benefit.code}>
                  <div className={styles.itemHeader}>
                    <div>
                      <h3 className={styles.itemTitle}>{benefit.name}</h3>
                      <p className={styles.itemText}>{benefit.description || `${benefit.points_required} points required`}</p>
                    </div>
                    <span className={benefit.unlocked || benefit.can_redeem ? styles.badge : styles.badgeMuted}>
                      {benefit.mode === 'automatic'
                        ? (benefit.unlocked ? t('referralProgram.unlocked') : t('referralProgram.lifetimeThreshold', { points: benefit.points_required }))
                        : t('referralProgram.pointCost', { points: benefit.points_required })}
                    </span>
                  </div>
                  {benefit.mode === 'redeem' ? (
                    <button
                      type="button"
                      className={styles.button}
                      disabled={!benefit.can_redeem || redeemingCode === benefit.code}
                      onClick={() => redeemBenefit(benefit)}
                      style={{ marginTop: 12 }}
                    >
                      {redeemingCode === benefit.code ? t('referralProgram.requesting') : t('referralProgram.requestBenefit')}
                    </button>
                  ) : null}
                </article>
              )) : <p className={styles.empty}>{t('referralProgram.noBenefits')}</p>}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('referralProgram.referrals')}</h2>
            <div className={styles.list} style={{ marginTop: 12 }}>
              {data.referrals.length ? data.referrals.map((referral, index) => (
                <article className={styles.item} key={`${referral.registered_at}-${index}`}>
                  <div className={styles.itemHeader}>
                    <p className={styles.itemTitle}>{referral.name}</p>
                    <span className={referral.qualified ? styles.badge : styles.badgeMuted}>
                      {referral.qualified ? t('referralProgram.qualified') : t('referralProgram.awaitingPurchase')}
                    </span>
                  </div>
                </article>
              )) : <p className={styles.empty}>{t('referralProgram.noReferrals')}</p>}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('referralProgram.pointsHistory')}</h2>
            <div className={styles.list} style={{ marginTop: 12 }}>
              {data.ledger.map((entry) => (
                <article className={styles.item} key={entry._id}>
                  <div className={styles.itemHeader}>
                    <p className={styles.itemTitle}>{entry.description}</p>
                    <span className={styles.badgeMuted}>{entry.entry_type === 'redemption' ? '-' : '+'}{entry.points}</span>
                  </div>
                  <p className={styles.itemText}>{new Date(entry.createdAt).toLocaleDateString()}</p>
                </article>
              ))}
              {data.redemptions.map((redemption) => (
                <article className={styles.item} key={redemption._id}>
                  <div className={styles.itemHeader}>
                    <p className={styles.itemTitle}>{redemption.benefit_name}</p>
                    <span className={styles.badgeMuted}>{redemption.status}</span>
                  </div>
                  {redemption.review_note ? <p className={styles.itemText}>{redemption.review_note}</p> : null}
                </article>
              ))}
              {!data.ledger.length && !data.redemptions.length ? <p className={styles.empty}>{t('referralProgram.noHistory')}</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
};

export default CandidateReferralProgram;
