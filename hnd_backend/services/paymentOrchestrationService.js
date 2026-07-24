const crypto = require('crypto');
const logger = require('../utils/logger');
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
  const statusCode = providerStatusCode >= 400 ? providerStatusCode : 500;

  logger.error('Checkout normalization detected payment provider failure', {
    statusCode,
    message,
    provider_error: providerBody,
    originalError: {
      message: err?.message,
      statusCode: err?.statusCode,
      responseBody: err?.responseBody,
    },
  });

  return { statusCode, message, provider_error: providerBody };
};

const mapProviderStatusToTransactionStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['successful', 'success', 'completed', 'paid', 'paid_success', 'paid_successful', 'settled'].includes(normalized)) return 'successful';
  if (['pending', 'processing', 'initiated', 'created', 'unknown', 'queued', 'started'].includes(normalized)) return 'pending';
  if (['failed', 'cancelled', 'expired'].includes(normalized)) return normalized;
  return 'failed';
};

const startCampayPayment = async ({
  transactionPayload,
  phoneNumber,
  payerMessage,
  payeeNote,
  paymentMethod,
  redirectUrl,
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
      redirectUrl,
      paymentMethod,
    });
  } catch (err) {
    const normalized = normalizeCheckoutError(err, 'Failed to initialize payment request.');
    const providerBody = parseProviderBody(err?.responseBody);
    const providerRef = String(providerBody?.transaction_uuid || providerBody?.payment_id || providerBody?.reference || providerBody?.merchant_invoice_id || providerBody?.id || providerBody?.transaction_id || externalReference).trim();

    transaction.provider_reference = providerRef || transaction.provider_reference;
    transaction.provider_response = providerBody || { message: normalized.message };

    const statusCode = Number(err?.statusCode || 0);
    const isNetworkOrProviderError = [408, 429, 502, 503, 504, 0].includes(statusCode)
      || String(err?.message || '').toLowerCase().includes('unable to reach camerpay')
      || String(err?.message || '').toLowerCase().includes('timed out')
      || String(err?.message || '').toLowerCase().includes('fetch failed');

    if (isNetworkOrProviderError) {
      transaction.status = 'pending';
      await transaction.save();

      logger.warn('Payment initialization returned a transient CamerPay error; preserving pending transaction', {
        transactionId: transaction._id,
        provider_error: normalized.provider_error,
        normalizedMessage: normalized.message,
        originalStatus: err?.statusCode,
      });

      return transaction;
    }

    transaction.status = 'failed';
    transaction.completed_at = new Date();
    await transaction.save();

    logger.error('Payment initialization failed during transaction processing', {
      transactionId: transaction._id,
      provider_error: normalized.provider_error,
      normalizedMessage: normalized.message,
      originalStatus: err?.statusCode,
    });

    const exposedErr = new Error(normalized.message);
    exposedErr.statusCode = normalized.statusCode;
    throw exposedErr;
  }

  // Prefer provider-returned transaction id (transaction_uuid/payment_id) when available,
  // fall back to providerReference or our merchant externalReference.
  const chosenProviderRef = providerResult.transactionId || providerResult.providerReference || externalReference;
  transaction.provider_reference = chosenProviderRef;
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
  if (!transaction) return transaction;
  const currentStatus = String(transaction.status || '').toLowerCase();
  if (!['pending', 'unknown'].includes(currentStatus)) return transaction;

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
