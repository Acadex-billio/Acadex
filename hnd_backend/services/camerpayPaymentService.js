const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('../utils/logger');
const { PAYMENT_CURRENCY } = require('../constants/paymentConstants');
const { validatePaymentAmountAndCurrency, validateTransactionReference } = require('./paymentValidationService');
const { buildCamerpayInvoiceReference } = require('./camerpayReferenceBuilder');

const rootEnvPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: rootEnvPath, quiet: true });
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true, override: true });

const CAMERPAY_TOKEN = String(process.env.CAMERPAY_TOKEN || '').trim();
const CAMERPAY_API_BASE_URL_DEFAULT = 'https://api.camerpay.biz';
const configuredApiBaseUrl = String(process.env.CAMERPAY_API_BASE_URL || CAMERPAY_API_BASE_URL_DEFAULT).replace(/\/$/, '').trim();
const CAMERPAY_API_BASE_URL = configuredApiBaseUrl || CAMERPAY_API_BASE_URL_DEFAULT;
const CAMERPAY_API_FALLBACK_BASE_URL = null;
const CAMERPAY_SIMULATION_MODE = String(process.env.CAMERPAY_ALLOW_SIMULATION || '').trim().toLowerCase() === 'true';
const CAMERPAY_SIMULATION_SUCCESS_AFTER_MS = Math.max(3000, Number(process.env.CAMERPAY_SIMULATION_SUCCESS_AFTER_MS || 8000));
const CAMERPAY_SIMULATION_STATE_TTL_MS = Math.max(60000, Number(process.env.CAMERPAY_SIMULATION_STATE_TTL_MS || 30 * 60 * 1000));
const CAMERPAY_SIMULATION_STATE_MAX_ENTRIES = 5000;
const CAMERPAY_SIMULATION_STATE = new Map();

if (CAMERPAY_SIMULATION_MODE && String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  throw new Error('CAMERPAY_ALLOW_SIMULATION must not be enabled in production.');
}

try {
  if (String(CAMERPAY_API_BASE_URL || '').toLowerCase().includes('camerpay.biz')) {
    logger.warn('CAMERPAY_API_BASE_URL is configured to the primary CamerPay host.', {
      configured_value: CAMERPAY_API_BASE_URL,
    });
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
  return CAMERPAY_SIMULATION_MODE ? 'sandbox' : 'production';
}

function isConfigured() {
  const configured = Boolean(CAMERPAY_TOKEN) || CAMERPAY_SIMULATION_MODE;
  if (!CAMERPAY_TOKEN && CAMERPAY_SIMULATION_MODE) {
    try {
      logger.info('CamerPay running in simulation mode (no CAMERPAY_TOKEN) — provider calls will be simulated locally', {
        api_base: CAMERPAY_API_BASE_URL,
        callback_url: CAMERPAY_CALLBACK_URL,
        return_url: CAMERPAY_RETURN_URL,
      });
    } catch (_) {}
  }
  return configured;
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

const pruneSimulationState = (now = Date.now()) => {
  for (const [reference, state] of CAMERPAY_SIMULATION_STATE) {
    if (now - state.createdAt >= CAMERPAY_SIMULATION_STATE_TTL_MS) {
      CAMERPAY_SIMULATION_STATE.delete(reference);
    }
  }

  while (CAMERPAY_SIMULATION_STATE.size >= CAMERPAY_SIMULATION_STATE_MAX_ENTRIES) {
    const oldestReference = CAMERPAY_SIMULATION_STATE.keys().next().value;
    if (!oldestReference) break;
    CAMERPAY_SIMULATION_STATE.delete(oldestReference);
  }
};

async function fetchJson(url, options, { maxAttempts = String(options?.method || 'GET').toUpperCase() === 'GET' ? 2 : 1 } = {}) {
  let response;
  let body;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CAMERPAY_FETCH_TIMEOUT_MS);
    const attemptStart = Date.now();
    try {
      logger.info('CamerPay request starting', {
        url,
        method: String((options && options.method) || 'GET').toUpperCase(),
        attempt,
        body_length: options && options.body ? String(options.body).length : 0,
      });

      response = await fetch(url, { ...options, signal: controller.signal });
      const text = await response.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch (_) {
        body = text || null;
      }
      const durationMs = Date.now() - attemptStart;

      logger.info('CamerPay request completed', {
        url,
        method: String((options && options.method) || 'GET').toUpperCase(),
        attempt,
        status: response.status,
        duration_ms: durationMs,
      });
      break;
    } catch (error) {
      const durationMs = Date.now() - attemptStart;
      const isLastAttempt = attempt === maxAttempts;

      logger.warn('CamerPay request error', {
        url,
        attempt,
        duration_ms: durationMs,
        error: String(error?.message || error),
      });

      if (!isLastAttempt) {
        logger.warn('CamerPay request failed; retrying once', {
          url,
          attempt,
          error: error.message,
        });
        continue;
      }

      const causeCode = String(error?.cause?.code || '').trim();
      const requestErr = new Error('Unable to reach CamerPay API. Please retry in a moment.');
      requestErr.statusCode = 502;
      requestErr.responseBody = {
        code: causeCode || 'NETWORK_ERROR',
        endpoint: url,
        detail: error?.message || 'fetch failed',
      };
      throw requestErr;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!response) {
    const err = new Error('Unable to reach CamerPay API. No response received.');
    err.statusCode = 502;
    err.responseBody = { code: 'NO_RESPONSE', endpoint: url };
    throw err;
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
  purposeType,
  purposeCode,
  resourceType,
  action,
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
  let lastTriedUrl = null;
  try {
    const reference = validateTransactionReference(externalReference || externalId || crypto.randomUUID());
    const invoiceReference = buildCamerpayInvoiceReference({
      purposeType,
      purposeCode,
      resourceType,
      action,
      fallbackReference: reference,
    });
    payload = {
      payment_method: providerMethod,
      amount: Number(amount),
      currency: paymentCurrency,
      customer_phone: sanitizedPhone,
      merchant_invoice_id: invoiceReference,
      source: 'api',
    };

    const returnUrl = String(redirectUrl || CAMERPAY_RETURN_URL || '').trim();

    if (!CAMERPAY_TOKEN && CAMERPAY_SIMULATION_MODE) {
      logger.warn('CamerPay token is missing; using simulation mode for payment initiation', {
        callbackUrl: CAMERPAY_CALLBACK_URL,
        returnUrl,
      });
    } else {
      if (!CAMERPAY_CALLBACK_URL) {
        const missingCallbackUrlError = new Error('CamerPay requires CAMERPAY_CALLBACK_URL to be configured. merchant_callback_url is mandatory.');
        missingCallbackUrlError.statusCode = 500;
        throw missingCallbackUrlError;
      }

      if (!returnUrl) {
        const missingReturnUrlError = new Error('CamerPay requires a return URL. Set CAMERPAY_RETURN_URL or provide a redirectUrl.');
        missingReturnUrlError.statusCode = 500;
        throw missingReturnUrlError;
      }

      payload.merchant_callback_url = CAMERPAY_CALLBACK_URL;
      payload.merchant_return_url = returnUrl;
    }

    if (payerMessage) payload.payer_message = String(payerMessage).slice(0, 120);
    if (payeeNote) payload.payee_note = String(payeeNote).slice(0, 240);

    const requestUrls = [`${CAMERPAY_API_BASE_URL}/api/payment/initiate`];
    if (CAMERPAY_API_FALLBACK_BASE_URL) {
      requestUrls.push(`${CAMERPAY_API_FALLBACK_BASE_URL}/api/payment/initiate`);
    }

    if (!CAMERPAY_TOKEN && CAMERPAY_SIMULATION_MODE) {
      const providerReference = reference;
      pruneSimulationState();
      CAMERPAY_SIMULATION_STATE.set(providerReference, {
        createdAt: Date.now(),
        amount: Number(amount),
        currency: paymentCurrency,
        customer_phone: sanitizedPhone,
        providerMethod,
      });

      logger.info('CamerPay payment initiation simulated locally', {
        providerReference,
        amount: Number(amount),
        currency: paymentCurrency,
        customer_phone: sanitizedPhone,
        providerMethod,
        merchant_invoice_id: invoiceReference,
      });

      return {
        provider: 'camerpay',
        providerMode: getProviderMode(),
        providerReference,
        status: 'pending',
        transactionId: providerReference,
        providerResponse: {
          simulated: true,
          merchant_invoice_id: invoiceReference,
          payment_method: providerMethod,
          amount: Number(amount),
          currency: paymentCurrency,
          customer_phone: sanitizedPhone,
          source: 'api',
          status: 'pending',
        },
      };
    }

    let response = null;
    let lastError = null;
    for (const requestUrl of requestUrls) {
      lastTriedUrl = requestUrl;
      try {
        response = await fetchJson(requestUrl, {
          method: 'POST',
          headers: Object.assign({
            'Content-Type': 'application/json',
            'User-Agent': 'Acadex/1.0',
          }, CAMERPAY_TOKEN ? { Authorization: `Bearer ${CAMERPAY_TOKEN}` } : {}),
          body: JSON.stringify(payload),
        });
        break;
      } catch (err) {
        lastError = err;
        logger.warn('CamerPay payment initiation failed for endpoint; trying next if available', {
          endpoint: requestUrl,
          error: err.message,
          statusCode: err.statusCode,
          attemptUrls: requestUrls,
        });
        if (String(err?.responseBody?.code || '').toUpperCase() === 'NETWORK_ERROR'
          || String(err?.responseBody?.code || '').toUpperCase() === 'NO_RESPONSE') {
          break;
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Unable to initiate CamerPay payment.');
    }

      const providerReference = response?.transaction_uuid
      || response?.payment_id
      || response?.transaction_id
      || response?.reference
      || response?.data?.transaction_uuid
      || response?.data?.payment_id
      || response?.data?.transaction_id
      || response?.data?.reference
      || reference;
    logger.info('CamerPay payment initiated successfully', {
      payment_id: response?.payment_id,
      transaction_uuid: response?.transaction_uuid,
      transaction_id: response?.transaction_id,
      reference: reference,
      providerReference,
      merchant_invoice_id: payload.merchant_invoice_id,
      response_keys: Object.keys(response || {}),
    });

    const normalizedProviderResponse = response && typeof response === 'object'
      ? {
          ...response,
          merchant_invoice_id: response?.merchant_invoice_id || invoiceReference,
          reference: response?.reference || invoiceReference,
        }
      : response;

    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference,
      status: 'pending',
      transactionId: providerReference || null,
      providerResponse: normalizedProviderResponse,
    };
  } catch (err) {
    logger.error('CamerPay payment initiation failed', {
      error: err.message,
      stack: err.stack,
      request: {
        url: lastTriedUrl || `${CAMERPAY_API_BASE_URL}/api/payment/initiate`,
        payment_method: payload?.payment_method,
        amount: payload?.amount,
        currency: payload?.currency,
        merchant_invoice_id: payload?.merchant_invoice_id,
      },
      response: {
        statusCode: err.statusCode || null,
        providerCode: err.responseBody?.code || null,
        message: err.responseBody?.message || null,
      },
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

  if (!CAMERPAY_TOKEN && CAMERPAY_SIMULATION_MODE) {
    pruneSimulationState();
    const simulationState = CAMERPAY_SIMULATION_STATE.get(providerReference);
    if (!simulationState) {
      return {
        provider: 'camerpay',
        providerMode: getProviderMode(),
        providerReference,
        status: 'unknown',
        providerResponse: { simulated: true, error: 'Unknown or expired simulation reference' },
      };
    }
    const ageMs = Date.now() - simulationState.createdAt;
    const simulatedSuccess = ageMs >= CAMERPAY_SIMULATION_SUCCESS_AFTER_MS;
    const simulatedStatus = simulatedSuccess ? 'successful' : 'pending';

    logger.info('CamerPay payment status read simulated locally', {
      providerReference,
      status: simulatedStatus,
      age_ms: ageMs,
    });

    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference,
      status: simulatedStatus,
      transactionId: providerReference,
      amount: simulationState.amount,
      currency: simulationState.currency,
      providerResponse: {
        simulated: true,
        provider_reference: providerReference,
        status: simulatedStatus,
        age_ms: ageMs,
      },
    };
  }

  const statusUrl = `${CAMERPAY_API_BASE_URL}/api/payment/${encodeURIComponent(providerReference)}/status`;

  try {
    logger.debug('Checking CamerPay payment status', {
      url: statusUrl,
      providerReference,
    });

    const statusUrls = [`${CAMERPAY_API_BASE_URL}/api/payment/${encodeURIComponent(providerReference)}/status`];
    if (CAMERPAY_API_FALLBACK_BASE_URL) {
      statusUrls.push(`${CAMERPAY_API_FALLBACK_BASE_URL}/api/payment/${encodeURIComponent(providerReference)}/status`);
    }

    let response = null;
    let lastError = null;
    for (const tryUrl of statusUrls) {
      try {
        response = await fetchJson(tryUrl, {
          method: 'GET',
          headers: Object.assign({
            'User-Agent': 'Acadex/1.0',
          }, CAMERPAY_TOKEN ? { Authorization: `Bearer ${CAMERPAY_TOKEN}` } : {}),
        });
        break;
      } catch (err) {
        lastError = err;
        logger.warn('CamerPay status check failed for endpoint; trying next if available', {
          endpoint: tryUrl,
          providerReference,
          error: err.message,
        });
      }
    }
    if (!response) {
      throw lastError || new Error('Unable to get CamerPay payment status.');
    }

    const payUrl = response?.pay_url || '';
    logger.info('CamerPay payment status response', {
      providerReference,
      status_url: statusUrl,
      provider_status: response?.status,
      pay_url: payUrl ? '[present]' : '[missing]',
      response_keys: Object.keys(response || {}),
    });

    const providerStatus = String(
      response?.status
      || response?.payment_status
      || response?.status_code
      || response?.payment?.status
      || response?.data?.status
      || response?.data?.payment_status
      || response?.data?.status_code
      || response?.data?.payment?.status
      || response?.data?.payment?.transaction_status
      || ''
    ).toLowerCase();
    const normalizedStatus = ['successful', 'success', 'completed', 'paid', 'paid_success', 'paid_successful', 'settled', 'approved'].includes(providerStatus)
      ? 'successful'
      : ['failed', 'cancelled', 'declined', 'expired', 'rejected'].includes(providerStatus)
        ? 'failed'
        : ['refunded', 'reversed'].includes(providerStatus)
          ? 'refunded'
        : ['pending', 'processing', 'initiated', 'created', 'queued', 'started', 'unknown', 'awaiting_payment', 'awaiting_approval', 'waiting_for_approval', 'waiting_approval', 'pending_approval', 'awaiting_confirmation'].includes(providerStatus)
          ? 'pending'
          : 'pending';

    const normalizedProviderReference = response?.transaction_uuid
      || response?.payment_id
      || response?.transaction_id
      || response?.reference
      || response?.data?.transaction_uuid
      || response?.data?.payment_id
      || response?.data?.transaction_id
      || response?.data?.reference
      || providerReference;

    return {
      provider: 'camerpay',
      providerMode: getProviderMode(),
      providerReference: normalizedProviderReference,
      status: normalizedStatus,
      transactionId: normalizedProviderReference || null,
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
