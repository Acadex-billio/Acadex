import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/CandidateSubscriptions.module.css';
import GraduationCapLoader from './GraduationCapLoader';
import PaymentActionModal from './PaymentActionModal';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';
import { useAuth } from '../context/AuthContext';
import { startSubscriptionPayment } from '../services/paymentFlowService';

const CandidateSubscriptions = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const syncSubscriptionToAuthUser = useCallback((subscription) => {
    if (!subscription) return;
    const currentUser = userRef.current;
    if (!currentUser) return;

    const currentSerialized = JSON.stringify(currentUser.subscription || null);
    const nextSerialized = JSON.stringify(subscription);
    if (currentSerialized === nextSerialized) return;

    updateUser({ ...currentUser, subscription });
  }, [updateUser]);

  const loadData = async () => {
    const { data } = await api.get('/candidate/subscription/me');
    setSubscriptionData(data);
    syncSubscriptionToAuthUser(data?.subscription);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const { data } = await api.get('/candidate/subscription/me');
        if (cancelled) return;
        setSubscriptionData(data);
        syncSubscriptionToAuthUser(data?.subscription);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, 'Failed to load subscription details.'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [syncSubscriptionToAuthUser]);

  const currentPlanCode = String(subscriptionData?.subscription?.plan || 'basic').toLowerCase();
  const currentPlan = subscriptionData?.plans?.find((plan) => plan.code === currentPlanCode) || subscriptionData?.subscription?.plan_definition;
  const plans = useMemo(() => Array.isArray(subscriptionData?.plans) ? subscriptionData.plans : [], [subscriptionData]);

  if (loading) return <GraduationCapLoader fullscreen label="Loading subscription plans..." />;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Candidate billing</div>
          <h1 className={styles.title}>Subscription plans</h1>
          <p className={styles.subtitle}>
            Choose the access level that matches how you study. Basic is free, Pro unlocks everything,
            and PAYGO keeps upfront cost low while charging only for premium actions.
          </p>
        </div>
        <div className={styles.currentCard}>
          <div className={styles.currentLabel}>Current plan</div>
          <div className={styles.currentName}>{currentPlan?.name || 'Basic Plan'}</div>
          <div className={styles.currentMeta}>
            Status: {subscriptionData?.subscription?.status || 'active'}
          </div>
          <div className={styles.currentMeta}>
            Expires: {subscriptionData?.subscription?.expires_at ? new Date(subscriptionData.subscription.expires_at).toLocaleString() : 'Never'}
          </div>
        </div>
      </div>

      <div className={styles.planGrid}>
        {plans.map((plan) => {
          const isCurrent = currentPlanCode === plan.code;
          return (
            <section key={plan.code} className={`${styles.planCard} ${isCurrent ? styles.planCardActive : ''}`}>
              <div className={styles.planHeader}>
                <div>
                  <div className={styles.planName}>{plan.name}</div>
                  <div className={styles.planDescription}>{plan.description}</div>
                </div>
                <div className={styles.planPrice}>
                  {plan.price === 0 ? 'Free' : `${plan.price} ${plan.currency}`}
                </div>
              </div>

              <div className={styles.planDuration}>
                {plan.durationDays ? `Valid for ${Math.round(plan.durationDays / 30)} months, then falls back to Basic.` : 'No expiry.'}
              </div>

              <ul className={styles.ruleList}>
                {(plan.candidateRules || []).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>

              <div className={styles.planActions}>
                {plan.code === 'basic' ? (
                  <button type="button" className={styles.secondaryBtn} disabled>
                    Included
                  </button>
                ) : isCurrent ? (
                  <button type="button" className={styles.secondaryBtn} disabled>
                    Current plan
                  </button>
                ) : (
                  <button type="button" className={styles.primaryBtn} onClick={() => setSelectedPlan(plan)}>
                    Choose {plan.name}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className={styles.explainerCard}>
        <h2>PAYGO charging details</h2>
        <div className={styles.chargeGrid}>
          <div className={styles.chargeItem}><strong>Upfront PAYGO access:</strong> 50 XAF for 3 months.</div>
          <div className={styles.chargeItem}><strong>Presentation full preview:</strong> 50 XAF for 1 hour.</div>
          <div className={styles.chargeItem}><strong>Presentation download:</strong> 100 XAF for 1 hour.</div>
          <div className={styles.chargeItem}><strong>Question paper full preview:</strong> 50 XAF for 1 hour.</div>
          <div className={styles.chargeItem}><strong>Question paper download:</strong> 100 XAF for 1 hour.</div>
          <div className={styles.chargeItem}><strong>Report full preview:</strong> 100 XAF for 1 hour.</div>
          <div className={styles.chargeItem}><strong>Report download:</strong> 200 XAF for 1 hour.</div>
          <div className={styles.chargeItem}><strong>Create or join center:</strong> 200 XAF per center.</div>
        </div>
      </section>

      <section className={styles.historyCard}>
        <h2>Recent payment activity</h2>
        {Array.isArray(subscriptionData?.recent_transactions) && subscriptionData.recent_transactions.length > 0 ? (
          <div className={styles.transactionList}>
            {subscriptionData.recent_transactions.map((txn) => (
              <div key={txn.transaction_id} className={styles.transactionRow}>
                <div>
                  <div className={styles.transactionTitle}>{txn.description}</div>
                  <div className={styles.transactionMeta}>{new Date(txn.createdAt).toLocaleString()}</div>
                </div>
                <div className={styles.transactionMeta}>{txn.amount} {txn.currency}</div>
                <div className={`${styles.transactionStatus} ${styles[`status_${String(txn.status || '').toLowerCase()}`] || ''}`}>{txn.status}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>No payment activity yet.</p>
        )}
      </section>

      <PaymentActionModal
        isOpen={Boolean(selectedPlan)}
        title={selectedPlan ? `Pay for ${selectedPlan.name}` : ''}
        description={selectedPlan ? `Pay with CamerPay mobile money to activate ${selectedPlan.name}.` : ''}
        amount={selectedPlan?.price || 0}
        currency={selectedPlan?.currency || 'XAF'}
        confirmLabel={selectedPlan ? 'Pay now' : 'Pay now'}
        onClose={() => setSelectedPlan(null)}
        onStartPayment={async ({ phoneNumber, paymentMethod, promoCode = '' }) => {
          return startSubscriptionPayment({
            planCode: selectedPlan.code,
            phoneNumber,
            paymentMethod,
            promoCode,
            referralCode: promoCode,
          });
        }}
        onSuccess={async () => {
          await loadData();
        }}
      />
    </div>
  );
};

export default CandidateSubscriptions;