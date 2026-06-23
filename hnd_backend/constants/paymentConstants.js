const PAYMENT_CURRENCY = Object.freeze({
  XAF: 'XAF',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

const PAYMENT_PURPOSE_TYPES = Object.freeze({
  SUBSCRIPTION: 'subscription',
  MATERIAL_ACCESS: 'material_access',
  CENTER_ACCESS: 'center_access',
  TUTORSHIP_BOOKING: 'tutorship_booking',
});

const PAYMENT_METHODS = Object.freeze({
  MOMO: 'momo',
  MTN_MOMO: 'mtn_momo',
  ORANGE_MONEY: 'orange_money',
});

const PAYMENT_SUCCESS_PROVIDER_STATUSES = new Set([
  'successful',
  'success',
  'completed',
  'paid',
  'paid_success',
  'paid_successful',
  'settled',
]);

const PAYMENT_FAILED_PROVIDER_STATUSES = new Set([
  'failed',
  'cancelled',
  'declined',
  'expired',
]);

const MIN_PAYMENT_AMOUNT = 100;
const MAX_PAYMENT_AMOUNT = 1000000;

const isValidAmount = (amount) => Number.isFinite(Number(amount))
  && Number(amount) >= MIN_PAYMENT_AMOUNT
  && Number(amount) <= MAX_PAYMENT_AMOUNT;

const isValidCurrency = (currency) => String(currency || '').trim().toUpperCase() === PAYMENT_CURRENCY.XAF;

const isSuccessfulProviderStatus = (status) => PAYMENT_SUCCESS_PROVIDER_STATUSES.has(String(status || '').toLowerCase());

const isFailedProviderStatus = (status) => PAYMENT_FAILED_PROVIDER_STATUSES.has(String(status || '').toLowerCase());

module.exports = {
  PAYMENT_CURRENCY,
  PAYMENT_STATUS,
  PAYMENT_PURPOSE_TYPES,
  PAYMENT_METHODS,
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  isValidAmount,
  isValidCurrency,
  isSuccessfulProviderStatus,
  isFailedProviderStatus,
};
