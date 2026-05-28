const crypto = require('crypto');
const logger = require('../utils/logger');

const CAMPAY_API_ID = String(process.env.CAMPAY_API_ID || '').trim();
const CAMPAY_APP_USERNAME = String(process.env.CAMPAY_APP_USERNAME || '').trim();
const CAMPAY_APP_PASSWORD = String(process.env.CAMPAY_APP_PASSWORD || '').trim();
const CAMPAY_PERMANENT_ACCESS_TOKEN = String(process.env.CAMPAY_PERMANENT_ACCESS_TOKEN || '').trim();
const CAMPAY_WEBHOOK_KEY = String(process.env.CAMPAY_WEBHOOK_KEY || '').trim();
const CAMPAY_CURRENCY = String(process.env.CAMPAY_CURRENCY || 'XAF').trim().toUpperCase();
const CAMPAY_API_BASE_URL = String(process.env.CAMPAY_API_BASE_URL || 'https://demo.campay.net').replace(/\/$/, '');
const CAMPAY_DEMO_BASE_URL = 'https://demo.campay.net';
const CAMPAY_FETCH_TIMEOUT_MS = Math.max(5000, Number(process.env.CAMPAY_FETCH_TIMEOUT_MS || 15000));

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function getProviderMode() {
  return 'production'; // CampAy is always production-ready
}

function isConfigured() {
  return Boolean(CAMPAY_API_ID && CAMPAY_APP_USERNAME && CAMPAY_APP_PASSWORD);
}

function isDemoStyleBaseUrl() {
  return /(^|\.)demo\.campay\.net$/i.test(new URL(CAMPAY_API_BASE_URL).hostname);
}

function buildCampayEndpoints() {
  if (isDemoStyleBaseUrl()) {
    return {
      auth: '/api/token/',
      collect: '/api/collect/',
      status: (reference) => `/api/transaction/${encodeURIComponent(reference)}/`,
    };
  }

  return {
    auth: '/auth/login',
    collect: '/payment/collect',
    status: (reference) => `/payment/collect/${encodeURIComponent(reference)}`,
  };
}

function sanitizePhoneNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  // CampAy expects phone numbers without country code or with proper formatting
  // Assumes numbers are already in correct format (e.g., 237xxx... for Cameroon)
  return digits;
}

async function fetchJson(url, options) {
  let response;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CAMPAY_FETCH_TIMEOUT_MS);
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      break;
    } catch (error) {
      clearTimeout(timeoutId);
      const isLastAttempt = attempt === maxAttempts;
      if (!isLastAttempt) continue;

      const causeCode = String(error?.cause?.code || '').trim();
      const requestErr = new Error('Unable to reach CampAy API. Please retry in a moment.');
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
    const err = new Error('Unable to reach CampAy API. No response received.');
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
    const err = new Error(`CampAy request failed with status ${response.status}`);
    err.statusCode = response.status;
    err.responseBody = body;
    throw err;
  }

  return body;
}

async function getAccessToken() {
  if (Date.now() < cachedTokenExpiresAt && cachedToken) return cachedToken;

  // Use permanent access token directly when available.
  if (CAMPAY_PERMANENT_ACCESS_TOKEN) {
    cachedToken = CAMPAY_PERMANENT_ACCESS_TOKEN;
    cachedTokenExpiresAt = Date.now() + (24 * 60 * 60 * 1000);
    return cachedToken;
  }

  const endpoints = buildCampayEndpoints();
  const isDemo = isDemoStyleBaseUrl();
  const basic = Buffer.from(`${CAMPAY_APP_USERNAME}:${CAMPAY_APP_PASSWORD}`).toString('base64');

  try {
    const data = await fetchJson(`${CAMPAY_API_BASE_URL}${endpoints.auth}`, {
      method: 'POST',
      headers: {
        ...(isDemo ? {} : { Authorization: `Basic ${basic}` }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        isDemo
          ? { username: CAMPAY_APP_USERNAME, password: CAMPAY_APP_PASSWORD }
          : {}
      ),
    });

    cachedToken = data?.token || data?.access_token || null;
    const expiresIn = Number(data?.expires_in || 0);
    cachedTokenExpiresAt = cachedToken ? Date.now() + Math.max(30000, (expiresIn - 30) * 1000) : 0;
    return cachedToken;
  } catch (err) {
    logger.error('CampAy authentication failed', { error: err.message, stack: err.stack });
    throw new Error('Unable to authenticate with CampAy payment provider');
  }
}

async function fetchJsonWithAuthFallback(url, token, options) {
  try {
    return await fetchJson(url, {
      ...options,
      headers: {
        ...(options?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    if (Number(err?.statusCode || 0) !== 401) throw err;

    return fetchJson(url, {
      ...options,
      headers: {
        ...(options?.headers || {}),
        Authorization: `Token ${token}`,
      },
    });
  }
}

async function initiateCollectionPayment({
  amount,
  currency,
  externalReference,
  externalId,
  phoneNumber,
  payerMessage,
  payeeNote,
  redirectUrl
}) {
  const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
  const paymentCurrency = String(currency || CAMPAY_CURRENCY).toUpperCase();

  if (!sanitizedPhone) {
    const err = new Error('A valid phone number is required for payment.');
    err.statusCode = 400;
    throw err;
  }

  if (!isConfigured()) {
    const err = new Error('CampAy payment provider is not properly configured.');
    err.statusCode = 500;
    throw err;
  }

  try {
    const token = await getAccessToken();
    const endpoints = buildCampayEndpoints();
    const isDemo = isDemoStyleBaseUrl();
    const reference = externalReference || externalId || crypto.randomUUID();

    const payload = isDemo
      ? {
          amount: Number(amount),
          from: sanitizedPhone,
          description: payeeNote || payerMessage || 'Payment',
          external_reference: reference,
        }
      : {
          amount: Number(amount),
          currency: paymentCurrency,
          phone: sanitizedPhone,
          description: payeeNote || 'Payment',
          externalReference: reference,
          ...(redirectUrl ? { redirectUrl } : {}),
        };

    const response = await fetchJsonWithAuthFallback(`${CAMPAY_API_BASE_URL}${endpoints.collect}`, token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Acadex/1.0',
      },
      body: JSON.stringify(payload),
    });

    return {
      provider: 'campay',
      providerMode: getProviderMode(),
      providerReference: response?.reference || response?.external_reference || reference,
      status: 'pending',
      transactionId: response?.transactionId || response?.id || null,
      providerResponse: response,
    };
  } catch (err) {
    if (Number(err?.statusCode || 0) === 404) {
      err.message = 'CampAy collect endpoint not found for current CAMPAY_API_BASE_URL. Verify provider host and API version.';
    }
    logger.error('CampAy payment initiation failed', { error: err.message, stack: err.stack });
    throw err;
  }
}

async function getCollectionPaymentStatus(providerReference) {
  if (!isConfigured()) {
    return {
      provider: 'campay',
      providerMode: getProviderMode(),
      providerReference,
      status: 'unknown',
      providerResponse: { error: 'CampAy not configured' },
    };
  }

  try {
    const token = await getAccessToken();
    const endpoints = buildCampayEndpoints();

    const data = await fetchJsonWithAuthFallback(
      `${CAMPAY_API_BASE_URL}${endpoints.status(providerReference)}`,
      token,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Acadex/1.0',
        },
      }
    );

    const providerStatus = String(data?.status || '').toLowerCase();
    const normalizedStatus = providerStatus === 'successful' || providerStatus === 'success'
      ? 'successful'
      : providerStatus === 'failed'
        ? 'failed'
        : providerStatus === 'pending'
          ? 'pending'
          : providerStatus === 'expired'
            ? 'expired'
            : 'pending';

    return {
      provider: 'campay',
      providerMode: getProviderMode(),
      providerReference,
      status: normalizedStatus,
      transactionId: data?.transactionId || data?.id || null,
      amount: data?.amount,
      currency: data?.currency,
      providerResponse: data,
    };
  } catch (err) {
    logger.error('CampAy payment status check failed', { error: err.message, stack: err.stack });
    return {
      provider: 'campay',
      providerMode: getProviderMode(),
      providerReference,
      status: 'unknown',
      providerResponse: { error: err.message },
    };
  }
}

function verifyWebhookSignature(payload, signature) {
  if (!CAMPAY_WEBHOOK_KEY) {
    logger.warn('CAMPAY_WEBHOOK_KEY not configured, webhook verification skipped');
    return true;
  }

  const payloadString = JSON.stringify(payload);
  const hash = crypto
    .createHmac('sha256', CAMPAY_WEBHOOK_KEY)
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
  CAMPAY_API_ID,
  CAMPAY_DEMO_BASE_URL,
};
