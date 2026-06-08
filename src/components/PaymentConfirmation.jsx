import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import { showToast } from '../utility/ToastNotification';

const PaymentConfirmation = () => {
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState(null);

  const fetchByTransaction = useCallback(async (txId) => {
    try {
      const { data } = await api.get(`/candidate/payments/${encodeURIComponent(txId)}/status`);
      if (data?.success) {
        setPayment(data.payment || null);
        setSubscription(data.subscription || null);
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

  if (loading) return <GraduationCapLoader fullscreen label="Checking payment status..." />;

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Payment status</h2>
        <p style={{ color: 'crimson' }}>{error}</p>
        <p>If you are not signed in, please sign in to view your payment status.</p>
      </div>
    );
  }

  if (!payment) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Payment status</h2>
        <p>No payment information is available.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Payment status</h2>
      <div style={{ marginBottom: 12 }}>
        <strong>Status:</strong> {payment.status}
      </div>
      <div style={{ marginBottom: 12 }}>
        <strong>Description:</strong> {payment.description}
      </div>
      <div style={{ marginBottom: 12 }}>
        <strong>Amount:</strong> {payment.amount} {payment.currency}
      </div>
      <div style={{ marginBottom: 12 }}>
        <strong>Created:</strong> {payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'N/A'}
      </div>
      {payment.completed_at && (
        <div style={{ marginBottom: 12 }}>
          <strong>Completed:</strong> {new Date(payment.completed_at).toLocaleString()}
        </div>
      )}
      {subscription && (
        <div style={{ marginTop: 16 }}>
          <h3>Subscription</h3>
          <div>Status: {subscription.status}</div>
          <div>Plan: {subscription.plan}</div>
          <div>Expires: {subscription.expires_at ? new Date(subscription.expires_at).toLocaleString() : 'Never'}</div>
        </div>
      )}
      <div style={{ marginTop: 18 }}>
        <button onClick={async () => {
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
        }}>Refresh</button>
      </div>
    </div>
  );
};

export default PaymentConfirmation;
