const crypto = require('crypto');

const MOMO_PROVIDER = String(process.env.MOMO_PROVIDER || 'mock').trim().toLowerCase();
const MOMO_TARGET_ENVIRONMENT = String(process.env.MOMO_TARGET_ENVIRONMENT || 'sandbox').trim().toLowerCase();
const MOMO_COLLECTION_BASE_URL = String(process.env.MOMO_COLLECTION_BASE_URL || 'https://sandbox.momodeveloper.mtn.com/collection').replace(/\/$/, '');
const MOMO_API_USER = String(process.env.MOMO_API_USER || '').trim();
const MOMO_API_KEY = String(process.env.MOMO_API_KEY || '').trim();
const MOMO_SUBSCRIPTION_KEY = String(process.env.MOMO_SUBSCRIPTION_KEY || '').trim();
const MOMO_CALLBACK_URL = String(process.env.MOMO_CALLBACK_URL || '').trim();
const MOMO_DEFAULT_COUNTRY_CODE = String(process.env.MOMO_DEFAULT_COUNTRY_CODE || '237').replace(/\D/g, '');
const MOMO_MOCK_AUTO_SUCCESS = String(process.env.MOMO_MOCK_AUTO_SUCCESS || 'true').trim().toLowerCase() !== 'false';
const MOMO_REQUEST_CURRENCY = String(process.env.MOMO_REQUEST_CURRENCY || '').trim().toUpperCase();

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function getProviderMode() {
  if (MOMO_PROVIDER === 'mock') return 'mock';
  return MOMO_TARGET_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

function isRealProviderConfigured() {
  return Boolean(MOMO_API_USER && MOMO_API_KEY && MOMO_SUBSCRIPTION_KEY);
}

function sanitizePhoneNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith(MOMO_DEFAULT_COUNTRY_CODE)) return digits;
  if (digits.length === 9) return `${MOMO_DEFAULT_COUNTRY_CODE}${digits}`;
  return digits;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text || null;
  }

  if (!response.ok) {
    const err = new Error(`MoMo request failed with status ${response.status}`);
    err.statusCode = response.status;
    err.responseBody = body;
    throw err;
  }

  return body;
}

async function getAccessToken() {
  if (Date.now() < cachedTokenExpiresAt && cachedToken) return cachedToken;

  const basic = Buffer.from(`${MOMO_API_USER}:${MOMO_API_KEY}`).toString('base64');
  const data = await fetchJson(`${MOMO_COLLECTION_BASE_URL}/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
    },
  });

  cachedToken = data?.access_token || null;
  const expiresIn = Number(data?.expires_in || 0);
  cachedTokenExpiresAt = cachedToken ? Date.now() + Math.max(30000, (expiresIn - 30) * 1000) : 0;
  return cachedToken;
}

async function initiateCollectionPayment({ amount, currency, externalReference, externalId, phoneNumber, payerMessage, payeeNote }) {
  const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
  const providerCurrency = MOMO_REQUEST_CURRENCY || String(currency || 'XAF').toUpperCase();

  if (!sanitizedPhone) {
    const err = new Error('A valid phone number is required for payment.');
    err.statusCode = 400;
    throw err;
  }

  if (MOMO_PROVIDER === 'mock' || !isRealProviderConfigured()) {
    return {
      provider: 'momo',
      providerMode: 'mock',
      providerReference: externalReference,
      status: MOMO_MOCK_AUTO_SUCCESS ? 'successful' : 'pending',
      providerResponse: {
        mocked: true,
        targetEnvironment: 'mock',
        phoneNumber: sanitizedPhone,
        amount: String(amount),
        currency: providerCurrency,
      },
    };
  }

  const token = await getAccessToken();
  await fetch(`${MOMO_COLLECTION_BASE_URL}/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': externalReference,
      'X-Target-Environment': MOMO_TARGET_ENVIRONMENT,
      'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
      ...(MOMO_CALLBACK_URL ? { 'X-Callback-Url': MOMO_CALLBACK_URL } : {}),
    },
    body: JSON.stringify({
      amount: String(amount),
      currency: providerCurrency,
      externalId: String(externalId || crypto.randomUUID()),
      payer: { partyIdType: 'MSISDN', partyId: sanitizedPhone },
      payerMessage,
      payeeNote,
    }),
  }).then(async (response) => {
    if (!response.ok && response.status !== 202) {
      const text = await response.text();
      const err = new Error(`MoMo request to pay failed with status ${response.status}`);
      err.statusCode = response.status;
      err.responseBody = text;
      throw err;
    }
  });

  return {
    provider: 'momo',
    providerMode: getProviderMode(),
    providerReference: externalReference,
    status: 'pending',
    providerResponse: {
      targetEnvironment: MOMO_TARGET_ENVIRONMENT,
      phoneNumber: sanitizedPhone,
      amount: String(amount),
      currency: providerCurrency,
    },
  };
}

async function getCollectionPaymentStatus(providerReference) {
  if (MOMO_PROVIDER === 'mock' || !isRealProviderConfigured()) {
    return {
      provider: 'momo',
      providerMode: 'mock',
      providerReference,
      status: MOMO_MOCK_AUTO_SUCCESS ? 'successful' : 'pending',
      providerResponse: { mocked: true },
    };
  }

  const token = await getAccessToken();
  const data = await fetchJson(`${MOMO_COLLECTION_BASE_URL}/v1_0/requesttopay/${encodeURIComponent(providerReference)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': MOMO_TARGET_ENVIRONMENT,
      'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
    },
  });

  const providerStatus = String(data?.status || '').toUpperCase();
  const normalizedStatus = providerStatus === 'SUCCESSFUL'
    ? 'successful'
    : providerStatus === 'FAILED'
      ? 'failed'
      : providerStatus === 'PENDING'
        ? 'pending'
        : providerStatus === 'EXPIRED'
          ? 'expired'
          : 'pending';

  return {
    provider: 'momo',
    providerMode: getProviderMode(),
    providerReference,
    status: normalizedStatus,
    providerResponse: data,
  };
}

module.exports = {
  getProviderMode,
  sanitizePhoneNumber,
  initiateCollectionPayment,
  getCollectionPaymentStatus,
};