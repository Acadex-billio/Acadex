const {
  isValidAmount,
  isValidCurrency,
  isSuccessfulProviderStatus,
  isFailedProviderStatus,
} = require('../constants/paymentConstants');

const validatePaymentAmountAndCurrency = ({ amount, currency }) => {
  if (!isValidAmount(amount)) {
    const err = new Error('Invalid payment amount.');
    err.statusCode = 400;
    throw err;
  }

  if (!isValidCurrency(currency)) {
    const err = new Error('Unsupported payment currency.');
    err.statusCode = 400;
    throw err;
  }
};

const validateTransactionReference = (reference, label = 'transaction reference') => {
  const value = String(reference || '').trim();
  if (!value || value.length < 6 || value.length > 140) {
    const err = new Error(`Invalid ${label}.`);
    err.statusCode = 400;
    throw err;
  }
  return value;
};

const normalizeWebhookPaymentStatus = (status) => {
  if (isSuccessfulProviderStatus(status)) return 'successful';
  if (isFailedProviderStatus(status)) return 'failed';
  return 'pending';
};

const validateAccessMinutes = (minutes) => {
  const parsed = Number(minutes || 0);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 24 * 60) {
    const err = new Error('Invalid access duration for payment grant.');
    err.statusCode = 400;
    throw err;
  }
  return parsed;
};

module.exports = {
  validatePaymentAmountAndCurrency,
  validateTransactionReference,
  normalizeWebhookPaymentStatus,
  validateAccessMinutes,
};
