const crypto = require('crypto');
const logger = require('../utils/logger');
const { PAYMENT_CURRENCY } = require('../constants/paymentConstants');
const { validatePaymentAmountAndCurrency, validateTransactionReference } = require('./paymentValidationService');

const CAMERPAY_TOKEN = String(process.env.CAMERPAY_TOKEN || '').trim();
let CAMERPAY_API_BASE_URL = String(process.env.CAMERPAY_API_BASE_URL || 'https://api.campay.net').replace(/\/$/, '');
// Production hosts have diverged; prefer the known live host when misconfiguration
try {
  if (String(CAMERPAY_API_BASE_URL || '').toLowerCase().includes('campay.net')) {
    logger.warn('CAMERPAY_API_BASE_URL looks like campay.net — overriding to https://camerpay.biz to avoid DNS/connectivity issues', {
      configured_value: CAMERPAY_API_BASE_URL,
    });
    CAMERPAY_API_BASE_URL = 'https://camerpay.biz';
  }
} catch (e) {
  // swallow logging errors
}
const CAMERPAY_CURRENCY = String(process.env.CAMERPAY_CURRENCY || PAYMENT_CURRENCY.XAF).trim().toUpperCase();
const CAMERPAY_FETCH_TIMEOUT_MS = Math.max(5000, Number(process.env.CAMERPAY_FETCH_TIMEOUT_MS || 15000));
const CAMERPAY_CALLBACK_URL = String(process.env.CAMERPAY_CALLBACK_URL || '').trim();
const CAMERPAY_RETURN_URL = String(process.env.CAMERPAY_RETURN_URL || '').trim();

// Log presence of critical CamerPay configuration (no secrets are logged)
try {
  logger.info('CamerPay configuration', {
    has_token: Boolean(String(process.env.CAMERPAY_TOKEN || '').trim()),
    has_callback_url: Boolean(CAMERPAY_CALLBACK_URL),
    has_return_url: Boolean(CAMERPAY_RETURN_URL),
    api_base: CAMERPAY_API_BASE_URL,
  });
} catch (_) {}
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
  return digits;
}

function mapPaymentMethodToProviderMethod(method, amount) {
  const normalized = String(method || '').trim().toLowerCase();
  const rawAmount = Number(amount);
  const shouldUseOrangeForLowAmount = Number.isFinite(rawAmount) && rawAmount > 0 && rawAmount < 100;

  if (normalized === 'momo' || normalized === 'mobile_money' || normalized === 'mtn' || normalized === 'mtn_momo') {
    return shouldUseOrangeForLowAmount ? 'orange_money' : 'mtn_momo';
  }

  if (normalized === 'orange_money' || normalized === 'orange') return 'orange_money';
  return shouldUseOrangeForLowAmount ? 'orange_money' : 'mtn_momo';
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
  paymentMethod,
}) {
  const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
  const paymentCurrency = String(currency || CAMERPAY_CURRENCY).toUpperCase();
  const providerMethod = mapPaymentMethodToProviderMethod(paymentMethod, amount);

  if (!sanitizedPhone) {
    const err = new Error('A valid phone number is required for payment.');
    err.statusCode = 400;
    throw err;
  }

  validatePaymentAmountAndCurrency({ amount, currency: paymentCurrency });

  if (!isConfigured()) {
    const err = new Error('CamerPay payment provider is not properly configured.');
    err.statusCode = 500;
    throw err;
  }

  let payload = null;
  try {
    const reference = validateTransactionReference(externalReference || externalId || crypto.randomUUID());
    payload = {
      payment_method: providerMethod,
      amount: String(amount),
      currency: paymentCurrency,
      customer_phone: sanitizedPhone,
      merchant_invoice_id: reference,
      source: 'api',
    };

    if (!CAMERPAY_CALLBACK_URL) {
      const missingCallbackUrlError = new Error('CamerPay requires CAMERPAY_CALLBACK_URL to be configured. merchant_callback_url is mandatory.');
      missingCallbackUrlError.statusCode = 500;
      throw missingCallbackUrlError;
    }

    const returnUrl = String(redirectUrl || CAMERPAY_RETURN_URL || '').trim();
    if (!returnUrl) {
      const missingReturnUrlError = new Error('CamerPay requires a return URL. Set CAMERPAY_RETURN_URL or provide a redirectUrl.');
      missingReturnUrlError.statusCode = 500;
      throw missingReturnUrlError;
    }

    payload.merchant_callback_url = CAMERPAY_CALLBACK_URL;
    payload.merchant_return_url = returnUrl;

    if (payerMessage) payload.payer_message = String(payerMessage).slice(0, 120);
    if (payeeNote) payload.payee_note = String(payeeNote).slice(0, 240);

    let requestUrl = `${CAMERPAY_API_BASE_URL}/api/payment/initiate`;
    const response = await fetchJson(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CAMERPAY_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Acadex/1.0',
      },
      body: JSON.stringify(payload),
    });

    const providerReference = response?.transaction_uuid || response?.payment_id || response?.reference || reference;
    logger.info('CamerPay payment initiated successfully', {
      payment_id: response?.payment_id,
      transaction_uuid: response?.transaction_uuid,
      reference: reference,
      providerReference,
      merchant_invoice_id: payload.merchant_invoice_id,
      response_keys: Object.keys(response || {}),
      full_response: response,
    });

    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference,
      status: 'pending',
      transactionId: response?.transaction_uuid || response?.payment_id || response?.transaction_id || null,
      providerResponse: response,
    };
  } catch (err) {
    logger.error('CamerPay payment initiation failed', {
      error: err.message,
      stack: err.stack,
      request: {
        url: requestUrl || `${CAMERPAY_API_BASE_URL}/api/payment/initiate`,
        payload,
      },
      responseBody: err.responseBody,
    });
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

  const statusUrl = `${CAMERPAY_API_BASE_URL}/api/payment/${encodeURIComponent(providerReference)}/status`;

  try {
    logger.debug('Checking CamerPay payment status', {
      url: statusUrl,
      providerReference,
    });

    const response = await fetchJson(statusUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${CAMERPAY_TOKEN}`,
        'User-Agent': 'Acadex/1.0',
      },
    });

    const payUrl = response?.pay_url || '';
    logger.info('CamerPay payment status response', {
      providerReference,
      status_url: statusUrl,
      provider_status: response?.status,
      pay_url: payUrl ? '[present]' : '[missing]',
      response_keys: Object.keys(response || {}),
    });

    const providerStatus = String(response?.status || response?.payment_status || '').toLowerCase();
    const normalizedStatus = ['successful', 'success', 'completed', 'paid', 'paid_success', 'paid_successful', 'settled'].includes(providerStatus)
      ? 'successful'
      : ['failed', 'cancelled', 'declined', 'expired'].includes(providerStatus)
        ? 'failed'
        : ['pending', 'processing', 'initiated', 'created', 'queued', 'started', 'unknown'].includes(providerStatus)
          ? 'pending'
          : 'pending';

    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference,
      status: normalizedStatus,
      transactionId: response?.transaction_uuid || response?.payment_id || response?.transaction_id || null,
      amount: response?.amount,
      currency: response?.currency,
      providerResponse: response,
    };
  } catch (err) {
    logger.error('CamerPay payment status check failed', {
      providerReference,
      status_url: statusUrl,
      error: err.message,
      statusCode: err.statusCode,
      responseBody: err.responseBody,
    });

    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference,
      status: 'unknown',
      providerResponse: {
        error: err.message || 'Unable to determine payment status',
        statusCode: err.statusCode,
        responseBody: err.responseBody,
      },
    };
  }
}

function verifyWebhookSignature(payload, signature, rawBody) {
  const webhookKey = String(process.env.CAMERPAY_WEBHOOK_KEY || '').trim();
  if (!webhookKey) {
    logger.warn('CAMERPAY_WEBHOOK_KEY not configured, webhook verification skipped');
    return true;
  }

  const payloadString = typeof rawBody === 'string' && rawBody.length
    ? rawBody
    : JSON.stringify(payload);
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
