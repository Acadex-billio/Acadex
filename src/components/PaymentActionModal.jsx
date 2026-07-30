import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const PAYMENT_PROGRESS_SEQUENCE = [
  'Starting payment...',
  'Simulating confirmation...',
  'Processing payment...',
  'Waiting for approval...',
  'Still waiting for approval...',
  'Approval received. Thank you!',
];

const PaymentActionModal = ({
  isOpen,
  title,
  description,
  amount,
  currency = 'XAF',
  defaultPhoneNumber = '',
  confirmLabel = 'Pay now',
  onClose,
  onStartPayment,
  onSuccess,
}) => {
  const toLocalDigits = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('237')) return digits.slice(3, 12);
    if (digits.length > 9) return digits.slice(-9);
    return digits;
  };

  const [phoneNumber, setPhoneNumber] = useState(toLocalDigits(defaultPhoneNumber));
  const [paymentMethod, setPaymentMethod] = useState('momo');
  const [promoCode, setPromoCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [pendingPaymentReference, setPendingPaymentReference] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPhoneNumber(toLocalDigits(defaultPhoneNumber));
      setPaymentMethod('momo');
      setPromoCode('');
      setSubmitting(false);
      setStatusText('');
      setRetryAvailable(false);
      setPendingPaymentReference('');
    }
  }, [defaultPhoneNumber, isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const pollStatus = async (transactionId) => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      try {
        const { data } = await api.get(`/candidate/payments/${encodeURIComponent(transactionId)}/status`);
        const status = String(data?.payment?.status || '').toLowerCase();
        const providerStatus = String(data?.payment?.provider_status || '').toLowerCase();
        const combinedStatus = status || providerStatus || '';

        if (combinedStatus === 'successful' || combinedStatus === 'paid' || combinedStatus === 'approved') {
          return data;
        }

        if (['failed', 'cancelled', 'expired', 'rejected', 'declined'].includes(combinedStatus)) {
          const err = new Error(`Payment ${combinedStatus}.`);
          err.paymentData = data;
          throw err;
        }

        const nextStatus = PAYMENT_PROGRESS_SEQUENCE[Math.min(attempt + 3, PAYMENT_PROGRESS_SEQUENCE.length - 1)];
        setStatusText(nextStatus);
      } catch (err) {
        if (attempt < 14) {
          const currentAttempt = attempt + 1;
          if (currentAttempt >= 3) {
            setStatusText(PAYMENT_PROGRESS_SEQUENCE[4]);
          } else {
            setStatusText(PAYMENT_PROGRESS_SEQUENCE[3]);
          }
          await wait(3000);
          continue;
        }
        throw err;
      }
      await wait(3000);
    }

    const err = new Error('Payment confirmation timed out.');
    err.statusCode = 408;
    throw err;
  };

  const isRetryableError = (err) => {
    const status = Number(err?.statusCode || err?.response?.status || 0);
    const code = String(err?.code || '').toUpperCase();
    const message = String(err?.message || '').toLowerCase();
    return status === 408 || status === 504 || code === 'ECONNABORTED' || code === 'ERR_NETWORK' || message.includes('timed out') || message.includes('network');
  };

  const resumePaymentCheck = async (transactionId) => {
    if (!transactionId) return;

    setRetryAvailable(false);
    setSubmitting(true);
    setStatusText('Retrying payment check...');

    try {
      const finalResult = await pollStatus(transactionId);
      const finalPayment = (finalResult?.payment || {}) || {};
      const finalPaymentStatus = String(finalPayment.status || finalPayment.provider_status || '').toLowerCase();
      if (!['successful', 'paid', 'approved'].includes(finalPaymentStatus)) {
        throw new Error(`Payment ${finalPaymentStatus || 'failed'}.`);
      }

      setStatusText(PAYMENT_PROGRESS_SEQUENCE[PAYMENT_PROGRESS_SEQUENCE.length - 1]);
      const materialNotice = finalPayment?.purpose_type === 'material_access'
        ? ` Material access unlocked for ${finalPayment.material_name || 'material'} (Duration: ${finalPayment.access_minutes || 60} minutes).`
        : '';
      showToast(`Payment confirmed successfully.${materialNotice}`, 'success');
      await onSuccess?.(finalResult);
      onClose?.();
    } catch (err) {
      if (isRetryableError(err)) {
        setRetryAvailable(true);
        setStatusText('Connection Timed out. Please check Your internet connection and try again');
        showToast('Connection Timed out. Please check Your internet connection and try again', 'warning');
        return;
      }
      showToast(getErrorMessage(err, 'Payment failed.'), 'error');
    } finally {
      if (!retryAvailable) {
        setSubmitting(false);
        setStatusText('');
      }
    }
  };

  const handleSubmit = async () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '').slice(0, 9);
    if (cleanPhone.length !== 9) {
      showToast('Enter a valid 9-digit Cameroon mobile number.', 'warning');
      return;
    }

    const normalizedPromoCode = String(promoCode || '').trim().toUpperCase();
    setSubmitting(true);
    setRetryAvailable(false);
    setPendingPaymentReference('');
    setStatusText(PAYMENT_PROGRESS_SEQUENCE[0]);

    try {
      if (typeof onStartPayment !== 'function') {
        throw new Error('Payment handler is not available.');
      }

      const startResult = await onStartPayment({
        phoneNumber: `+237${cleanPhone}`,
        paymentMethod,
        promoCode: normalizedPromoCode,
      });

      const payment = startResult?.payment || startResult;
      const paymentRef = payment?.provider_reference || payment?.transaction_id;
      if (!paymentRef) {
        throw new Error('Payment could not be initialized.');
      }
      setPendingPaymentReference(paymentRef);

      let finalResult = startResult;
      const normalizedStatus = String(payment.status || '').toLowerCase();
      const providerStatus = String(payment.provider_status || '').toLowerCase();
      const combinedStatus = normalizedStatus || providerStatus || '';
      const isAlreadySuccessful = ['successful', 'paid', 'approved'].includes(combinedStatus);

      if (!isAlreadySuccessful) {
        setStatusText(PAYMENT_PROGRESS_SEQUENCE[3]);
        finalResult = await pollStatus(paymentRef);
      }

      const finalPayment = (finalResult?.payment || payment) || {};
      const finalPaymentStatus = String(finalPayment.status || finalPayment.provider_status || '').toLowerCase();
      if (!['successful', 'paid', 'approved'].includes(finalPaymentStatus)) {
        throw new Error(`Payment ${finalPaymentStatus || 'failed'}.`);
      }

      setStatusText(PAYMENT_PROGRESS_SEQUENCE[PAYMENT_PROGRESS_SEQUENCE.length - 1]);
      const materialNotice = finalPayment?.purpose_type === 'material_access'
        ? ` Material access unlocked for ${finalPayment.material_name || 'material'} (Duration: ${finalPayment.access_minutes || 60} minutes).`
        : '';
      showToast(`Payment confirmed successfully.${materialNotice}`, 'success');
      await onSuccess?.(finalResult);
      onClose?.();
    } catch (err) {
      if (isRetryableError(err)) {
        setRetryAvailable(true);
        setStatusText('Connection Timed out. Please check Your internet connection and try again');
        showToast('Connection Timed out. Please check Your internet connection and try again', 'warning');
        return;
      }
      showToast(getErrorMessage(err, 'Payment failed.'), 'error');
    } finally {
      if (!retryAvailable) {
        setSubmitting(false);
        setStatusText('');
      }
    }
  };

  return (
    <>
      <style>{`
        @keyframes tradeLineMove {
          0% { transform: translateX(-140%); }
          100% { transform: translateX(140%); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          overflowY: 'auto',
          padding: '24px 12px',
          boxSizing: 'border-box',
        }}
      >
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(4, 22, 40, 0.58)' }}
        onClick={() => !submitting && onClose?.()}
      />
      <div
        style={{
          position: 'relative',
          width: 'min(520px, 100%)',
          margin: 'max(2vh, 12px) auto',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          background: '#ffffff',
          border: '1px solid #dce5ec',
          borderRadius: 22,
          padding: 24,
          boxShadow: '0 28px 80px rgba(16, 39, 59, 0.18)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 28, color: '#10273b' }}>{title}</h3>
            <p style={{ margin: '8px 0 0', color: '#587084', lineHeight: 1.5 }}>{description}</p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            style={{ border: 'none', background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#587084' }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: '#f7fbfe', border: '1px solid #e3ebf1' }}>
          <div style={{ color: '#587084', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Amount</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#0e5f84', marginTop: 4 }}>{amount} {currency}</div>
        </div>

        {submitting && (
          <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            <div style={{ position: 'relative', height: 8, borderRadius: 999, overflow: 'hidden', background: '#def7e6' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '-140%',
                  width: '260%',
                  height: '100%',
                  background: 'linear-gradient(135deg, transparent 20%, #22a74a 28%, #76d59f 35%, #22a74a 45%, transparent 55%, transparent 65%, #22a74a 72%, #76d59f 78%, #22a74a 86%, transparent 94%)',
                  animation: 'tradeLineMove 1.2s linear infinite',
                }}
              />
            </div>
            <div style={{ color: '#166534', fontWeight: 600 }}>{statusText || 'Processing payment...'}</div>
          </div>
        )}

            <div
              style={{
                marginTop: 14,
                border: '1px solid #dce5ec',
                borderRadius: 14,
                padding: '10px 12px',
                background: '#f7fbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#35536a', fontWeight: 600 }}>Payment method</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#10273b',
                    background: '#f7c948',
                    borderRadius: 999,
                    padding: '5px 10px',
                  }}
                >
                  MoMo
                </span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={submitting}
                  style={{
                    border: '1px solid #cddbe5',
                    borderRadius: 10,
                    padding: '8px 10px',
                    fontSize: 14,
                    color: '#10273b',
                    background: '#ffffff',
                  }}
                >
                  <option value="momo">MTN Mobile Money (default)</option>
                  <option value="orange_money">Orange Money</option>
                </select>
              </div>
            </div>

            <label style={{ display: 'block', marginTop: 18, color: '#35536a', fontWeight: 600 }}>Phone number for payment</label>
            <div
              style={{
                marginTop: 8,
                border: '1px solid #dce5ec',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                background: '#ffffff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 12px',
                  height: 50,
                  borderRight: '1px solid #e3ebf1',
                  color: '#35536a',
                  fontWeight: 700,
                  minWidth: 80,
                }}
              >
                <span>+237</span>
              </div>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="6XXXXXXXX"
                disabled={submitting}
                inputMode="numeric"
                pattern="[0-9]{9}"
                maxLength={9}
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '14px 16px',
                  fontSize: 16,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ marginTop: 6, color: '#587084', fontSize: 12 }}>
              Enter only the 9-digit number after +237.
            </div>
            <div style={{ marginTop: 10, color: '#0e5f84', fontSize: 13, lineHeight: 1.5 }}>
              For MTN Mobile Money, wait a little for the confirmer to trigger. If it delays, dial <strong>*126*</strong> OM, <strong>*150*</strong>.
            </div>

        <label style={{ display: 'block', marginTop: 16, color: '#35536a', fontWeight: 600 }}>Promo/Referral code (optional)</label>
        <input
          type="text"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 30))}
          placeholder="ENTER CODE"
          disabled={submitting}
          style={{
            width: '100%',
            marginTop: 8,
            border: '1px solid #dce5ec',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 15,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {!submitting && statusText ? <div style={{ marginTop: 12, color: '#0e5f84', fontSize: 14 }}>{statusText}</div> : null}

        {retryAvailable && pendingPaymentReference ? (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => resumePaymentCheck(pendingPaymentReference)}
              style={{
                border: '1px solid #0e5f84',
                background: '#ffffff',
                color: '#0e5f84',
                borderRadius: 999,
                padding: '10px 16px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Retry payment check
            </button>
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            style={{
              border: '1px solid #dce5ec',
              background: '#ffffff',
              color: '#35536a',
              borderRadius: 999,
              padding: '12px 18px',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              border: 'none',
              background: 'linear-gradient(135deg, #0e5f84 0%, #0b4561 100%)',
              color: '#fff',
              borderRadius: 999,
              padding: '12px 18px',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default PaymentActionModal;