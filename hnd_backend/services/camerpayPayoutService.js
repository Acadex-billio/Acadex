const crypto = require('crypto');
const logger = require('../utils/logger');
const { PAYMENT_METHODS } = require('../constants/paymentConstants');
const { validateTransactionReference } = require('./paymentValidationService');
const { sanitizePhoneNumber } = require('./camerpayPaymentService');
const { sendBulkBcc } = require('./emailService');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');
const User = require('../models/User');
const PayoutBatch = require('../models/PayoutBatch');

const CAMERPAY_API_BASE_URL_DEFAULT = 'https://api.campay.net';
const CAMERPAY_API_BASE_URL = String(process.env.CAMERPAY_API_BASE_URL || CAMERPAY_API_BASE_URL_DEFAULT).replace(/\/$/, '');
const CAMERPAY_API_FALLBACK_BASE_URL = (() => {
  const base = String(process.env.CAMERPAY_API_BASE_URL || CAMERPAY_API_BASE_URL_DEFAULT).toLowerCase();
  if (base.includes('campay.net')) return 'https://camerpay.biz';
  if (base.includes('camerpay.biz')) return 'https://api.campay.net';
  return null;
})();
const CAMERPAY_TOKEN = String(process.env.CAMERPAY_TOKEN || '').trim();
const CAMERPAY_FETCH_TIMEOUT_MS = Math.max(5000, Number(process.env.CAMERPAY_FETCH_TIMEOUT_MS || 15000));
const CAMERPAY_PAYOUT_CALLBACK_URL = String(process.env.CAMERPAY_PAYOUT_CALLBACK_URL || process.env.CAMERPAY_CALLBACK_URL || '').trim();
const CAMERPAY_BALANCE_ENDPOINTS = [
  '/api/merchant/balance',
  '/api/account/balance',
  '/api/wallet',
  '/api/balance',
  '/api/v1/merchant/balance',
  '/api/v1/account/balance',
  '/api/v1/wallet',
];

function getPayoutFeeRate(method) {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === PAYMENT_METHODS.ORANGE_MONEY) return 0.02;
  if (normalized === PAYMENT_METHODS.MTN_MOMO) return 0.0375;
  return 0.0375;
}

function mapToCamerpayMethod(method) {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === PAYMENT_METHODS.ORANGE_MONEY || normalized === 'orange_money' || normalized === 'orange') return PAYMENT_METHODS.ORANGE_MONEY;
  if (normalized === PAYMENT_METHODS.MTN_MOMO || normalized === 'mtn_momo' || normalized === 'momo' || normalized === 'mtn') return PAYMENT_METHODS.MTN_MOMO;
  return PAYMENT_METHODS.MTN_MOMO;
}

async function getCamerpayBalance() {
  if (!CAMERPAY_TOKEN) {
    const err = new Error('CamerPay token is not configured. Cannot fetch balance.');
    err.statusCode = 500;
    throw err;
  }

  let balanceResponse = null;
  let lastError = null;

  for (const endpoint of CAMERPAY_BALANCE_ENDPOINTS) {
    const url = `${CAMERPAY_API_BASE_URL.replace(/\/$/, '')}${endpoint}`;
    const fallbackUrl = CAMERPAY_API_FALLBACK_BASE_URL ? `${CAMERPAY_API_FALLBACK_BASE_URL}${endpoint}` : null;
    const urls = [url];
    if (fallbackUrl) urls.push(fallbackUrl);

    for (const requestUrl of urls) {
      try {
        const response = await fetchJson(requestUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${CAMERPAY_TOKEN}`,
            'User-Agent': 'Acadex/1.0',
          },
        });

        balanceResponse = response;
        break;
      } catch (err) {
        lastError = err;
        logger.warn('CamerPay balance check failed for endpoint', {
          endpoint: requestUrl,
          error: err.message,
        });
      }
    }

    if (balanceResponse) break;
  }

  if (!balanceResponse) {
    const err = new Error('Unable to fetch CamerPay balance.');
    err.statusCode = 502;
    err.responseBody = lastError?.responseBody || null;
    throw err;
  }

  const rawBalance =
    Number(balanceResponse?.balance)
    || Number(balanceResponse?.available_balance)
    || Number(balanceResponse?.data?.balance)
    || Number(balanceResponse?.data?.available_balance)
    || Number(balanceResponse?.amount)
    || 0;
  return {
    raw: balanceResponse,
    balance: Number(isFinite(rawBalance) ? rawBalance : 0),
    currency: String(balanceResponse?.currency || balanceResponse?.currency_code || 'XAF').toUpperCase(),
  };
}

async function notifyDeveloperPayoutStatus({ subject, message, payoutSummary, developerEmails }) {
  const emails = Array.isArray(developerEmails) && developerEmails.length
    ? developerEmails.filter(Boolean)
    : [process.env.DEVELOPER_ALERT_EMAIL || process.env.EMAIL_USER || 'developer@acadex.local'];

  const text = [
    message,
    '',
    'Payout summary:',
    ...payoutSummary.map((line) => `- ${line}`),
    '',
    `Timestamp: ${new Date().toISOString()}`,
  ].join('\n');

  try {
    await sendBulkBcc(emails.map((email) => ({ email })), subject, text, 20);
  } catch (err) {
    logger.warn('Developer payout email alert failed', { error: err.message || err, subject, emails });
  }
}

async function notifyDeveloperPush({ title, body, url }) {
  if (!isWebPushConfigured) return { sent: 0, failed: 0 };
  const developers = await User.find({ role: 'developer', account_status: 'active' }).select('push_subscription name allow_push_notifications').lean();
  const targets = developers.filter((dev) => dev.allow_push_notifications && dev.push_subscription);
  if (!targets.length) return { sent: 0, failed: 0 };

  try {
    return await sendBulkPushNotification(targets, 'payout_status', title, body, url || '/');
  } catch (err) {
    logger.warn('Developer payout push notification failed', { error: err.message || err, title, body });
    return { sent: 0, failed: targets.length };
  }
}

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CAMERPAY_FETCH_TIMEOUT_MS);

  try {
    logger.info('CamerPay payout request starting', { url, method: options.method, body_length: options.body ? String(options.body).length : 0 });
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    const text = await response.text();
    let body = null;

    if (text) {
      try {
        body = JSON.parse(text);
      } catch (parseError) {
        body = text;
        logger.warn('CamerPay response was not JSON', {
          url,
          status: response.status,
          contentType: response.headers.get('content-type'),
          snippet: String(text).slice(0, 512),
        });
      }
    }

    if (!response.ok) {
      const err = new Error(`CamerPay payout request failed with status ${response.status}`);
      err.statusCode = response.status;
      err.responseBody = body;
      logger.error('CamerPay payout request failed', { error: err.message, url, status: response.status, responseBody: body });
      throw err;
    }
    return body;
  } catch (error) {
    clearTimeout(timeoutId);
    logger.error('CamerPay payout request failed', { error: error?.message || error, url });
    throw error;
  }
}

function isConfigured() {
  return Boolean(CAMERPAY_TOKEN);
}

async function createPayoutBatch({
  reference,
  description,
  callbackUrl,
  beneficiaries,
  type,
  createdBy,
}) {
  validateTransactionReference(reference, 'payout batch reference');

  if (!Array.isArray(beneficiaries) || !beneficiaries.length) {
    throw new Error('At least one beneficiary is required.');
  }

  const normalizedBeneficiaries = beneficiaries.map((beneficiary, index) => {
    const phone = sanitizePhoneNumber(beneficiary.phone);
    if (!phone) {
      const err = new Error(`Invalid phone number for beneficiary at index ${index}`);
      err.statusCode = 400;
      throw err;
    }
    const amount = Number(beneficiary.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      const err = new Error(`Invalid amount for beneficiary at index ${index}`);
      err.statusCode = 400;
      throw err;
    }
    const method = mapToCamerpayMethod(beneficiary.method || 'mtn_momo');
    return {
      ...beneficiary,
      name: String(beneficiary.name || '').trim() || null,
      phone,
      amount,
      method,
      external_id: String(beneficiary.external_id || beneficiary.user_cand_id || `${type}-${Date.now()}-${index}`),
      status: 'pending',
    };
  });

  const totalAmount = normalizedBeneficiaries.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  if (normalizedBeneficiaries.length > 100 || totalAmount > 2000000) {
    const err = new Error('Batch exceeds CamerPay limits: max 100 beneficiaries and max 2,000,000 XAF total per batch.');
    err.statusCode = 400;
    throw err;
  }

  const estimatedFees = normalizedBeneficiaries.reduce((acc, item) => acc + Number(item.amount || 0) * getPayoutFeeRate(item.method), 0);

  const payoutBatch = await PayoutBatch.create({
    batch_uuid: crypto.randomUUID(),
    reference,
    description: String(description || '').trim() || null,
    callback_url: String(callbackUrl || CAMERPAY_PAYOUT_CALLBACK_URL || '').trim() || null,
    type,
    status: 'pending_approval',
    total_amount: totalAmount,
    beneficiary_count: normalizedBeneficiaries.length,
    estimated_fees: Number(estimatedFees.toFixed(2)),
    beneficiaries: normalizedBeneficiaries,
    created_by: String(createdBy || 'system').trim() || 'system',
  });

  return payoutBatch;
}

async function submitPayoutBatchToCamerpay(payoutBatch) {
  if (!isConfigured()) {
    const err = new Error('CamerPay batch payout is not configured. Set CAMERPAY_TOKEN.');
    err.statusCode = 500;
    throw err;
  }

  const payload = {
    reference: payoutBatch.reference,
    description: payoutBatch.description || `Payout batch ${payoutBatch.reference}`,
    callback_url: payoutBatch.callback_url || '',
    beneficiaries: payoutBatch.beneficiaries.map((beneficiary) => ({
      phone: beneficiary.phone,
      amount: beneficiary.amount,
      name: beneficiary.name || `Beneficiary ${beneficiary.external_id}`,
      method: beneficiary.method,
      external_id: beneficiary.external_id,
    })),
  };

  const urls = [`${CAMERPAY_API_BASE_URL}/api/payouts/batch`];
  if (CAMERPAY_API_FALLBACK_BASE_URL) {
    urls.push(`${CAMERPAY_API_FALLBACK_BASE_URL}/api/payouts/batch`);
  }

  let response = null;
  let lastError = null;
  for (const url of urls) {
    try {
      response = await fetchJson(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CAMERPAY_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });
      break;
    } catch (err) {
      lastError = err;
      logger.warn('CamerPay batch payout attempt failed', { url, error: err.message });
    }
  }

  if (!response) {
    throw lastError || new Error('Failed to submit CamerPay payout batch.');
  }

  payoutBatch.status = 'processing';
  payoutBatch.provider_response = response;
  if (Array.isArray(response?.beneficiaries)) {
    payoutBatch.beneficiaries = payoutBatch.beneficiaries.map((beneficiary) => {
      const providerRow = response.beneficiaries.find((item) => String(item.external_id || item.reference || item.external_reference) === String(beneficiary.external_id));
      return {
        ...beneficiary,
        status: providerRow?.status ? String(providerRow.status).toLowerCase() : beneficiary.status,
        message: providerRow?.message || providerRow?.detail || beneficiary.message,
      };
    });
  }

  await payoutBatch.save();

  return response;
}

async function fetchPayoutBatchStatus(batchUuid) {
  if (!isConfigured()) {
    const err = new Error('CamerPay batch payout is not configured. Set CAMERPAY_TOKEN.');
    err.statusCode = 500;
    throw err;
  }

  validateTransactionReference(batchUuid, 'batch UUID');

  const urls = [`${CAMERPAY_API_BASE_URL}/api/payouts/batch/${encodeURIComponent(batchUuid)}`];
  if (CAMERPAY_API_FALLBACK_BASE_URL) {
    urls.push(`${CAMERPAY_API_FALLBACK_BASE_URL}/api/payouts/batch/${encodeURIComponent(batchUuid)}`);
  }

  let response = null;
  let lastError = null;
  for (const url of urls) {
    try {
      response = await fetchJson(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CAMERPAY_TOKEN}`,
        },
      });
      break;
    } catch (err) {
      lastError = err;
      logger.warn('CamerPay batch status check failed', { url, error: err.message });
    }
  }

  if (!response) {
    throw lastError || new Error('Failed to fetch CamerPay batch status.');
  }

  return response;
}

module.exports = {
  createPayoutBatch,
  submitPayoutBatchToCamerpay,
  fetchPayoutBatchStatus,
  getCamerpayBalance,
  notifyDeveloperPayoutStatus,
  notifyDeveloperPush,
};
