const crypto = require('crypto');
const PaymentTransaction = require('../models/PaymentTransaction');
const { getProviderMode, initiateCollectionPayment, getCollectionPaymentStatus, sanitizePhoneNumber } = require('./camerpayPaymentService');

const parseProviderBody = (rawBody) => {
  if (!rawBody) return null;
  if (typeof rawBody === 'object') return rawBody;
  if (typeof rawBody === 'string') {
    try { return JSON.parse(rawBody); } catch (_) { return { message: rawBody }; }
  }
  return null;
};

const normalizeCheckoutError = (err, fallbackMessage) => {
  if (Number(err?.statusCode || 0) >= 400 && !err?.responseBody) {
    return {
      statusCode: Number(err.statusCode),
      message: String(err.message || fallbackMessage || 'Checkout request failed'),
      provider_error: null,
    };
  }

  const providerBody = parseProviderBody(err?.responseBody);
  const providerMessage = String(providerBody?.message || providerBody?.error || '').trim();
  const providerCode = String(providerBody?.code || '').trim();

  const message = providerMessage
    ? `${providerMessage}${providerCode ? ` (${providerCode})` : ''}`
    : (err?.message || fallbackMessage);

  const providerStatusCode = Number(err?.statusCode || 0);
  const statusCode = providerStatusCode >= 400 ? 502 : 500;

  return { statusCode, message, provider_error: providerBody };
};

const mapProviderStatusToTransactionStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['pending', 'successful', 'failed', 'cancelled', 'expired'].includes(normalized)) return normalized;
  if (['unknown', 'processing', 'initiated'].includes(normalized)) return 'pending';
  return 'failed';
};

const startCampayPayment = async ({
  transactionPayload,
  phoneNumber,
  payerMessage,
  payeeNote,
  onSuccessfulPayment,
}) => {
  const externalReference = transactionPayload.external_reference || crypto.randomUUID();
  const transaction = await PaymentTransaction.create({
    ...transactionPayload,
    external_reference: externalReference,
    provider_mode: getProviderMode(),
    phone_number: sanitizePhoneNumber(phoneNumber),
  });

  let providerResult;
  try {
    providerResult = await initiateCollectionPayment({
      amount: transaction.amount,
      currency: transaction.currency,
      externalReference,
      externalId: transaction.external_id || `cand-${transaction.user_cand_id}`,
      phoneNumber,
      payerMessage,
      payeeNote,
    });
  } catch (err) {
    const normalized = normalizeCheckoutError(err, 'Failed to initialize payment request.');
    transaction.status = 'failed';
    transaction.completed_at = new Date();
    transaction.provider_response = normalized.provider_error || { message: normalized.message };
    await transaction.save();

    const exposedErr = new Error(normalized.message);
    exposedErr.statusCode = normalized.statusCode;
    throw exposedErr;
  }

  transaction.provider_reference = providerResult.providerReference || externalReference;
  transaction.provider_mode = providerResult.providerMode || transaction.provider_mode;
  transaction.provider_response = providerResult.providerResponse || null;
  transaction.status = mapProviderStatusToTransactionStatus(providerResult.status);
  transaction.completed_at = providerResult.status === 'successful' ? new Date() : null;

  if (providerResult.status === 'successful' && typeof onSuccessfulPayment === 'function') {
    await onSuccessfulPayment(transaction);
  }

  await transaction.save();
  return transaction;
};

const refreshCampayPaymentStatus = async (transaction, onSuccessfulPayment) => {
  if (!transaction || transaction.status !== 'pending') return transaction;

  const providerResult = await getCollectionPaymentStatus(transaction.provider_reference || transaction.external_reference);
  transaction.provider_response = providerResult.providerResponse || transaction.provider_response;

  if (providerResult.status === 'successful') {
    transaction.status = 'successful';
    transaction.completed_at = transaction.completed_at || new Date();
    if (typeof onSuccessfulPayment === 'function') {
      await onSuccessfulPayment(transaction);
    }
  } else {
    transaction.status = mapProviderStatusToTransactionStatus(providerResult.status);
    if (transaction.status !== 'pending') {
      transaction.completed_at = transaction.completed_at || new Date();
    }
  }

  await transaction.save();
  return transaction;
};

module.exports = {
  normalizeCheckoutError,
  startCampayPayment,
  refreshCampayPaymentStatus,
  mapProviderStatusToTransactionStatus,
};
