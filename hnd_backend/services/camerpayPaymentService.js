const crypto = require('crypto');
const logger = require('../utils/logger');

const CAMERPAY_TOKEN = String(process.env.CAMERPAY_TOKEN || '').trim();
const CAMERPAY_API_BASE_URL = String(process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz').replace(/\/$/, '');
const CAMERPAY_CURRENCY = String(process.env.CAMERPAY_CURRENCY || 'XAF').trim().toUpperCase();
const CAMERPAY_FETCH_TIMEOUT_MS = Math.max(5000, Number(process.env.CAMERPAY_FETCH_TIMEOUT_MS || 15000));

function getProviderMode() {
  return 'production'; // CamerPay is always production-ready
}

function isConfigured() {
  return Boolean(CAMERPAY_TOKEN);
}

function sanitizePhoneNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  // CamerPay expects phone numbers in format like 237XXXXXXXXX or just 6XXXXXXXXX
  // Assumes numbers are already in correct format
  return digits;
}

async function fetchJson(url, options) {
  let response;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CAMERPAY_FETCH_TIMEOUT_MS);
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      break;
    } catch (error) {
      clearTimeout(timeoutId);
      const isLastAttempt = attempt === maxAttempts;
      if (!isLastAttempt) continue;

      const causeCode = String(error?.cause?.code || '').trim();
      const requestErr = new Error('Unable to reach CamerPay API. Please retry in a moment.');
      requestErr.statusCode = 502;
      requestErr.responseBody = {
        code: causeCode || 'NETWORK_ERROR',
        endpoint: url,
        detail: error?.message || 'fetch failed',
      };
      throw requestErr;
    }
  }

  if (!response) {
    const err = new Error('Unable to reach CamerPay API. No response received.');
    err.statusCode = 502;
    err.responseBody = { code: 'NO_RESPONSE', endpoint: url };
    throw err;
  }

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text || null;
  }

  if (!response.ok) {
    const err = new Error(`CamerPay request failed with status ${response.status}`);
    err.statusCode = response.status;
    err.responseBody = body;
    throw err;
  }

  return body;
}

async function initiateCollectionPayment({
  amount,
  currency,
  externalReference,
  externalId,
  phoneNumber,
  payerMessage,
  payeeNote,
  redirectUrl,
}) {
  const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
  const paymentCurrency = String(currency || CAMERPAY_CURRENCY).toUpperCase();

  if (!sanitizedPhone) {
    const err = new Error('A valid phone number is required for payment.');
    err.statusCode = 400;
    throw err;
  }

  if (!isConfigured()) {
    const err = new Error('CamerPay payment provider is not properly configured.');
    err.statusCode = 500;
    throw err;
  }

  try {
    const reference = externalReference || externalId || crypto.randomUUID();

    const payload = {
      payment_method: 'orange_money', // Default to Orange Money; can be extended for other methods
      amount: Number(amount),
      currency: paymentCurrency,
      customer_phone: sanitizedPhone,
      merchant_invoice_id: reference,
      merchant_callback_url: process.env.CAMERPAY_CALLBACK_URL || '',
      merchant_return_url: redirectUrl || process.env.CAMERPAY_RETURN_URL || '',
      source: 'api',
    };

    const response = await fetchJson(`${CAMERPAY_API_BASE_URL}/api/payment/initiate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CAMERPAY_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Acadex/1.0',
      },
      body: JSON.stringify(payload),
    });

    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference: response?.payment_id || response?.reference || reference,
      status: 'pending',
      transactionId: response?.payment_id || response?.transaction_id || null,
      providerResponse: response,
    };
  } catch (err) {
    logger.error('CamerPay payment initiation failed', { error: err.message, stack: err.stack });
    throw err;
  }
}

async function getCollectionPaymentStatus(providerReference) {
  if (!isConfigured()) {
    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference,
      status: 'unknown',
      providerResponse: { error: 'CamerPay not configured' },
    };
  }

  try {
    const response = await fetchJson(
      `${CAMERPAY_API_BASE_URL}/api/payment/status/${encodeURIComponent(providerReference)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CAMERPAY_TOKEN}`,
          'User-Agent': 'Acadex/1.0',
        },
      }
    );

    const providerStatus = String(response?.status || response?.payment_status || '').toLowerCase();
    const normalizedStatus = providerStatus === 'successful' || providerStatus === 'success' || providerStatus === 'completed'
      ? 'successful'
      : providerStatus === 'failed' || providerStatus === 'cancelled'
        ? 'failed'
        : providerStatus === 'pending' || providerStatus === 'processing'
          ? 'pending'
          : 'pending';

    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference,
      status: normalizedStatus,
      transactionId: response?.payment_id || response?.transaction_id || null,
      amount: response?.amount,
      currency: response?.currency,
      providerResponse: response,
    };
  } catch (err) {
    logger.error('CamerPay payment status check failed', { error: err.message, stack: err.stack });
    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference,
      status: 'unknown',
      providerResponse: { error: err.message },
    };
  }
}

function verifyWebhookSignature(payload, signature) {
  const webhookKey = String(process.env.CAMERPAY_WEBHOOK_KEY || '').trim();
  if (!webhookKey) {
    logger.warn('CAMERPAY_WEBHOOK_KEY not configured, webhook verification skipped');
    return true;
  }

  const payloadString = JSON.stringify(payload);
  const hash = crypto
    .createHmac('sha256', webhookKey)
    .update(payloadString)
    .digest('hex');

  return hash === signature;
}

module.exports = {
  getProviderMode,
  sanitizePhoneNumber,
  initiateCollectionPayment,
  getCollectionPaymentStatus,
  verifyWebhookSignature,
  CAMERPAY_TOKEN,
};
