import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const PaymentActionModal = ({
  isOpen,
  title,
  description,
  amount,
  currency = 'XAF',
  defaultPhoneNumber = '',
  confirmLabel = 'Pay now',
  manualMode = false,
  manualRecipientNumber = '678507737',
  manualRecipientName = 'TEBEI NOEL FORKANG',
  manualWaitMinutes = 10,
  manualProofLabel = 'Transaction ID or MoMo confirmation message',
  manualProofPlaceholder = 'Paste transaction ID or the payment SMS confirmation text',
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
  const [manualProof, setManualProof] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPhoneNumber(toLocalDigits(defaultPhoneNumber));
      setPaymentMethod('momo');
      setPromoCode('');
      setManualProof('');
      setSubmitting(false);
      setStatusText('');
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
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { data } = await api.get(`/candidate/payments/${encodeURIComponent(transactionId)}/status`);
      const status = String(data?.payment?.status || '').toLowerCase();
      if (status === 'successful') return data;
      if (['failed', 'cancelled', 'expired'].includes(status)) {
        const err = new Error(`Payment ${status}.`);
        err.paymentData = data;
        throw err;
      }
      setStatusText(`Waiting for payment confirmation${attempt < 9 ? '...' : '.'}`);
      await wait(3000);
    }

    const err = new Error('Payment confirmation timed out.');
    err.statusCode = 408;
    throw err;
  };

  const pollManualVerification = async (transactionId) => {
    const intervalMs = 15000;
    const timeoutMs = Math.max(1, Number(manualWaitMinutes || 10)) * 60 * 1000;
    const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
    let lastData = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const { data } = await api.get(`/candidate/payments/${encodeURIComponent(transactionId)}/status`);
      lastData = data;
      const status = String(data?.payment?.status || '').toLowerCase();
      if (status === 'successful') return data;
      if (['failed', 'cancelled', 'expired'].includes(status)) {
        const err = new Error(`Payment ${status}.`);
        err.paymentData = data;
        throw err;
      }

      const elapsedMinutes = Math.min(timeoutMs, (attempt + 1) * intervalMs) / 60000;
      setStatusText(`Waiting for developer verification... (${elapsedMinutes.toFixed(1)} / ${manualWaitMinutes} min)`);
      await wait(intervalMs);
    }

    const err = new Error('Verification is still pending. Please check back shortly.');
    err.statusCode = 408;
    err.paymentData = lastData;
    throw err;
  };

  const handleSubmit = async () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '').slice(0, 9);
    if (!manualMode && cleanPhone.length !== 9) {
      showToast('Enter a valid 9-digit Cameroon mobile number.', 'warning');
      return;
    }

    const normalizedPromoCode = String(promoCode || '').trim().toUpperCase();
    const normalizedProof = String(manualProof || '').trim();
    if (manualMode && normalizedProof.length < 6) {
      showToast('Enter your transaction ID or payment confirmation message.', 'warning');
      return;
    }

    setSubmitting(true);
    setStatusText(manualMode ? 'Submitting payment proof...' : 'Starting payment...');
    try {
      const startResult = manualMode
        ? await onStartPayment({
            manualProof: normalizedProof,
            promoCode: normalizedPromoCode,
            manualRecipientNumber,
          })
        : await onStartPayment(`+237${cleanPhone}`, paymentMethod, normalizedPromoCode);

      const payment = startResult?.payment;
      if (!payment?.transaction_id) {
        throw new Error('Payment could not be initialized.');
      }

      let finalResult = startResult;
      const normalizedStatus = String(payment.status || '').toLowerCase();
      if (normalizedStatus !== 'successful') {
        if (manualMode) {
          setStatusText(`Proof submitted. Waiting for verification (up to ${manualWaitMinutes} minutes)...`);
          finalResult = await pollManualVerification(payment.transaction_id);
        } else {
          finalResult = await pollStatus(payment.transaction_id);
        }
      }

      showToast(manualMode ? 'Payment verified successfully. Your plan is now active.' : 'Payment confirmed successfully.', 'success');
      await onSuccess?.(finalResult);
      onClose?.();
    } catch (err) {
      if (manualMode && err?.statusCode === 408) {
        showToast('Proof submitted. Verification is still pending. Please check your payment history shortly.', 'warning');
        await onSuccess?.(err?.paymentData || null);
        onClose?.();
        return;
      }
      showToast(getErrorMessage(err, 'Payment failed.'), 'error');
    } finally {
      setSubmitting(false);
      setStatusText('');
    }
  };

  return (
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
          background: '#fff',
          borderRadius: 22,
          padding: 24,
          boxShadow: '0 28px 80px rgba(5, 33, 61, 0.24)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 28, color: '#0b3d5c' }}>{title}</h3>
            <p style={{ margin: '8px 0 0', color: '#51606f', lineHeight: 1.5 }}>{description}</p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            style={{ border: 'none', background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#6c7b88' }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: '#f4f8fb' }}>
          <div style={{ color: '#6c7b88', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Amount</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#0e5f84', marginTop: 4 }}>{amount} {currency}</div>
        </div>

        {manualMode ? (
          <>
            <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: '#f8fcff', border: '1px solid #d7e8f4' }}>
              <div style={{ color: '#0b3d5c', fontWeight: 700, marginBottom: 8 }}>Manual payment instructions</div>
              <div style={{ color: '#21465f', lineHeight: 1.6 }}>
                1. Send <strong>{amount} {currency}</strong> to MTN MoMo number <strong>{manualRecipientNumber}</strong> (Account name: <strong>{manualRecipientName}</strong>).<br />
                2. After payment succeeds, copy the transaction ID or the success SMS text.<br />
                3. Paste it below and click <strong>{confirmLabel}</strong>.<br />
                4. Wait while we verify your payment (up to {manualWaitMinutes} minutes).
              </div>
            </div>

            <label style={{ display: 'block', marginTop: 18, color: '#16364f', fontWeight: 600 }}>{manualProofLabel}</label>
            <textarea
              value={manualProof}
              onChange={(e) => setManualProof(e.target.value.slice(0, 500))}
              placeholder={manualProofPlaceholder}
              disabled={submitting}
              rows={4}
              style={{
                width: '100%',
                marginTop: 8,
                border: '1px solid #d4dde5',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: 15,
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </>
        ) : (
          <>
            <div
              style={{
                marginTop: 14,
                border: '1px solid #dce6ee',
                borderRadius: 14,
                padding: '10px 12px',
                background: '#f9fcff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#143c56', fontWeight: 600 }}>Payment method</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#1a2f3f',
                    background: '#ffd100',
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
                    border: '1px solid #cdd8e2',
                    borderRadius: 10,
                    padding: '8px 10px',
                    fontSize: 14,
                    color: '#17354b',
                    background: '#fff',
                  }}
                >
                  <option value="momo">MTN Mobile Money (default)</option>
                  <option value="orange_money">Orange Money</option>
                </select>
              </div>
            </div>

            <label style={{ display: 'block', marginTop: 18, color: '#16364f', fontWeight: 600 }}>Phone number for payment</label>
            <div
              style={{
                marginTop: 8,
                border: '1px solid #d4dde5',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 12px',
                  height: 50,
                  borderRight: '1px solid #e2e8ef',
                  color: '#16364f',
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
            <div style={{ marginTop: 6, color: '#6b7a88', fontSize: 12 }}>
              Enter only the 9-digit number after +237.
            </div>
          </>
        )}

        <label style={{ display: 'block', marginTop: 16, color: '#16364f', fontWeight: 600 }}>Promo/Referral code (optional)</label>
        <input
          type="text"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 30))}
          placeholder="ENTER CODE"
          disabled={submitting}
          style={{
            width: '100%',
            marginTop: 8,
            border: '1px solid #d4dde5',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 15,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {statusText ? <div style={{ marginTop: 12, color: '#0e5f84', fontSize: 14 }}>{statusText}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            style={{
              border: '1px solid #d4dde5',
              background: '#fff',
              color: '#29475d',
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
              background: '#0e5f84',
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
  );
};

export default PaymentActionModal;