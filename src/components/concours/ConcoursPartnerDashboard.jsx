import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import styles from '../../Astyles/ConcoursPartner.module.css';
import { showToast } from '../../utility/ToastNotification';
import { getErrorMessage } from '../../utility/getErrorMessage';

export default function ConcoursPartnerDashboard() {
  const [state, setState] = useState({ loading: true, partnership: null, pricing: null, concours: [], applications: [] });
  const [accepting, setAccepting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  const load = async () => {
    try {
      const [status, concours, applications] = await Promise.all([
        api.get('/concours/partner/status'),
        api.get('/concours/partner/concours'),
        api.get('/concours/partner/applications'),
      ]);
      setState({
        loading: false,
        partnership: status.data.partnership,
        pricing: status.data.pricing || null,
        concours: concours.data.concours || [],
        applications: applications.data.applications || [],
      });
    } catch (_) {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const accept = async () => {
    setAccepting(true);
    try {
      await api.post('/concours/partner/agreement/accept');
      setShowPaymentModal(false);
      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to activate your partnership. Please try again.'), 'error');
    } finally {
      setAccepting(false);
    }
  };

  const pay = async () => {
    if (Number(state.pricing?.amount || 0) <= 0) {
      await accept();
      return;
    }

    setPaying(true);
    try {
      await api.post('/concours/partner/payment/checkout', { paymentMethod: 'momo' });
      setShowPaymentModal(false);
      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to start payment. Please try again.'), 'error');
    } finally {
      setPaying(false);
    }
  };

  if (state.loading) {
    return <div className={styles.loading}>Loading partner workspace...</div>;
  }

  const status = state.partnership?.status;
  const isFreePartnership = Number(state.pricing?.amount || 0) <= 0;

  if (status !== 'active') {
    return (
      <div className={styles.partnershipCard}>
        <h1 className={styles.partnershipTitle}>ACADEX Concours Partnership</h1>
        <div className={styles.partnershipStatus}>
          <span className={styles.partnershipStatusLabel}>Status:</span>
          <span className={styles.partnershipStatusValue}>
            {String(status || 'payment_required').replace(/_/g, ' ')}
          </span>
        </div>
        <p className={styles.partnershipMessage}>
          {isFreePartnership
            ? 'Your agreement includes free ACADEX concours partner access for one year.'
            : 'Your concours partner dashboard will be unlocked after agreement acceptance and successful payment.'}
        </p>
        <div className={styles.partnershipActions}>
          {['created', 'agreement_sent'].includes(status) ? (
            <button type="button" className={styles.partnershipButton} onClick={accept} disabled={accepting}>
              {accepting ? 'Activating...' : 'I have read and agree to the ACADEX Concours Partnership Agreement'}
            </button>
          ) : ['agreement_accepted', 'payment_required'].includes(status) ? (
            <>
              <button type="button" className={styles.partnershipButton} onClick={() => setShowPaymentModal(true)} disabled={paying}>
                {isFreePartnership ? 'Activate free access' : 'Pay Partnership Fee'}
              </button>
              {showPaymentModal && (
                <div className={styles.paymentModalBackdrop} role="presentation">
                  <section className={styles.paymentModal} role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title">
                    <h2 id="payment-dialog-title">{isFreePartnership ? 'Activate your free access' : 'Confirm partnership payment'}</h2>
                    <p>{isFreePartnership
                      ? 'ACADEX has given you free 1 year access to the concours partner workspace.'
                      : 'This payment activates your ACADEX concours partner workspace.'}</p>
                    <div className={styles.paymentAmount}>
                      <span>{isFreePartnership ? 'Access fee' : 'Amount due'}</span>
                      <strong>{isFreePartnership ? 'FREE' : `${Number(state.pricing?.amount || 0).toLocaleString()} ${state.pricing?.currency || 'XAF'}`}</strong>
                    </div>
                    <div className={styles.paymentModalActions}>
                      <button type="button" className={styles.paymentCancelButton} onClick={() => setShowPaymentModal(false)} disabled={paying || accepting}>Cancel</button>
                      <button type="button" className={styles.partnershipButton} onClick={pay} disabled={paying || accepting}>
                        {isFreePartnership
                          ? (accepting ? 'Activating...' : 'Activate free access')
                          : (paying ? 'Starting payment...' : 'Confirm and pay')}
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </>
          ) : (
            <div className={styles.lockedMessage}>Partnership access is currently locked.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overview}>
      <h1 className={styles.overviewTitle}>Concours Partner Overview</h1>
      <div className={styles.metricsGrid}>
        <Metric
          label="Active Concours"
          value={state.concours.filter((item) => item.status === 'published').length}
        />
        <Metric label="Total Applications" value={state.applications.length} />
        <Metric
          label="New Applications"
          value={state.applications.filter((item) => item.status === 'submitted').length}
        />
        <Metric
          label="Shortlisted"
          value={state.applications.filter((item) => item.status === 'shortlisted').length}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <section className={styles.metricCard}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </section>
  );
}
