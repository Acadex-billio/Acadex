import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';

const PaymentConfirmation = () => {
  const navigate = useNavigate();
  const [payment, setPayment] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchByTransaction = useCallback(async (txId) => {
    try {
      const { data } = await api.get(`/candidate/payments/${encodeURIComponent(txId)}/status`);
      if (data?.success) {
        setPayment(data.payment || null);
        setSubscription(data.subscription || null);
        setError(null);
      } else {
        setError(data?.message || 'Failed to fetch payment status');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to fetch payment status');
    }
  }, []);

  const fetchLatest = useCallback(async () => {
    try {
      const { data } = await api.get('/candidate/subscription/me');
      if (data?.recent_transactions && data.recent_transactions.length > 0) {
        const latest = data.recent_transactions[0];
        await fetchByTransaction(latest.transaction_id);
      } else {
        setError('No recent transactions found for this account.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load recent transactions');
    }
  }, [fetchByTransaction]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const tx = params.get('transaction_id') || params.get('transactionId') || params.get('tx') || params.get('payment_id') || params.get('external_reference');
        if (tx) {
          await fetchByTransaction(tx);
        } else {
          await fetchLatest();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchByTransaction, fetchLatest]);

  const statusLabel = useMemo(() => {
    const normalized = String(payment?.status || '').toLowerCase();
    if (normalized === 'successful') return 'Successful';
    if (normalized === 'pending') return 'Pending';
    if (['failed', 'cancelled', 'expired'].includes(normalized)) return 'Failed';
    return 'Unknown';
  }, [payment]);

  const isSuccess = statusLabel === 'Successful';
  const isPending = statusLabel === 'Pending';

  const renderStatusPanel = () => {
    if (error) {
      return (
        <div style={{ padding: 24, background: '#fff3f3', borderRadius: 20, border: '1px solid #f1c2c2' }}>
          <h1 style={{ margin: 0, color: '#b72b2b' }}>Payment status unavailable</h1>
          <p style={{ marginTop: 12, color: '#603030' }}>{error}</p>
        </div>
      );
    }

    if (!payment) {
      return (
        <div style={{ padding: 24, background: '#f3f7ff', borderRadius: 20, border: '1px solid #d8e2fb' }}>
          <h1 style={{ margin: 0, color: '#1f476e' }}>No payment details found</h1>
          <p style={{ marginTop: 12, color: '#405d7e' }}>Try again later or contact support if you believe you were charged.</p>
        </div>
      );
    }

    const title = isSuccess ? 'Payment completed' : isPending ? 'Payment is pending' : 'Payment could not be confirmed';
    const description = isSuccess
      ? 'Your CamerPay transaction was successful. Your Acadex access has been updated.'
      : isPending
        ? 'We are still confirming the payment. Please refresh this page in a few moments.'
        : 'The payment did not complete. If you believe this is an error, contact Acadex support.';

    return (
      <div
        style={{
          padding: 28,
          borderRadius: 24,
          background: isSuccess ? '#e6f5ec' : isPending ? '#f3f7ff' : '#fff2f2',
          border: `1px solid ${isSuccess ? '#8dc69a' : isPending ? '#b7cffb' : '#f1c2c2'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              display: 'grid',
              placeItems: 'center',
              background: isSuccess ? '#2f7d4b' : isPending ? '#2f69b4' : '#b73b3b',
              color: '#fff',
              fontSize: 30,
            }}
          >
            {isSuccess ? '✓' : isPending ? '…' : '✕'}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, color: isSuccess ? '#1f4d31' : isPending ? '#1c3e70' : '#70252a' }}>{title}</h1>
            <p style={{ margin: '8px 0 0', color: '#3b4b5f', maxWidth: 680 }}>{description}</p>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: '#5a6480', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Transaction</div>
              <div style={{ fontWeight: 700, color: '#10243f' }}>{payment.transaction_id || 'N/A'}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#5a6480', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Amount</div>
              <div style={{ fontWeight: 700, color: '#10243f' }}>{payment.amount} {payment.currency}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#5a6480', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Status</div>
              <div style={{ fontWeight: 700, color: '#10243f' }}>{payment.status || 'Unknown'}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 16, padding: 18, borderRadius: 18, background: '#ffffff' }}>
            <div style={{ color: '#394b6f' }}><strong>Description</strong></div>
            <div style={{ color: '#34405a' }}>{payment.description || 'Subscription payment'}</div>
            <div style={{ color: '#394b6f' }}><strong>Created</strong></div>
            <div style={{ color: '#34405a' }}>{payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'N/A'}</div>
            {payment.completed_at && (
              <>
                <div style={{ color: '#394b6f' }}><strong>Completed</strong></div>
                <div style={{ color: '#34405a' }}>{new Date(payment.completed_at).toLocaleString()}</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
        <div style={{ padding: 28, borderRadius: 24, background: '#f3f7ff', border: '1px solid #d8e2fb', textAlign: 'center' }}>
          <h2 style={{ margin: 0, color: '#1c3e70' }}>Checking payment status...</h2>
          <p style={{ marginTop: 12, color: '#405d7e' }}>Please wait while we confirm your transaction.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, color: '#0f3a5f', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Acadex payment result</div>
          <h2 style={{ margin: '10px 0 0', fontSize: 34, color: '#0c253c' }}>Your payment confirmation</h2>
          <p style={{ marginTop: 12, color: '#4b5d7b', maxWidth: 680 }}>This page shows the final CamerPay transaction status and your Acadex access state.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/candidate/subscription')}
            style={{
              border: '1px solid #d2dce8',
              borderRadius: 999,
              padding: '12px 18px',
              background: '#fff',
              color: '#15345f',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Back to subscription
          </button>
          <a
            href="/candidate/feedback"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              padding: '12px 18px',
              background: '#0e5f84',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Contact support
          </a>
        </div>
      </div>

      {renderStatusPanel()}

      {subscription && (
        <div style={{ marginTop: 24, padding: 24, borderRadius: 20, background: '#f8fbff', border: '1px solid #d7e2ef' }}>
          <h3 style={{ margin: 0, color: '#0f3a5f' }}>Current Acadex subscription</h3>
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <div style={{ color: '#2d4266' }}><strong>Plan</strong>: {subscription.plan || 'Basic'}</div>
            <div style={{ color: '#2d4266' }}><strong>Status</strong>: {subscription.status || 'Active'}</div>
            <div style={{ color: '#2d4266' }}><strong>Expires</strong>: {subscription.expires_at ? new Date(subscription.expires_at).toLocaleString() : 'Never'}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={async () => {
            showToast('Refreshing payment status...', 'info');
            setLoading(true);
            try {
              const params = new URLSearchParams(window.location.search);
              const tx = params.get('transaction_id') || params.get('transactionId') || params.get('tx') || params.get('payment_id') || params.get('external_reference');
              if (tx) {
                await fetchByTransaction(tx);
              } else {
                await fetchLatest();
              }
            } catch (err) {
              /* ignore */
            } finally {
              setLoading(false);
            }
          }}
          style={{
            border: 'none',
            borderRadius: 999,
            padding: '14px 22px',
            background: '#0e5f84',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Refresh status
        </button>
        {isPending && (
          <span style={{ color: '#3c5581', lineHeight: 1.5 }}>Pending payments can take a few seconds to update. Refresh if the page stays pending.</span>
        )}
      </div>
    </div>
  );
};

export default PaymentConfirmation;
