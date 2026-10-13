const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCheckoutError,
  isAmbiguousInitiationError,
  mapProviderStatusToTransactionStatus,
} = require('../services/paymentOrchestrationService');

test('provider authorization failures become gateway errors, not candidate session errors', () => {
  const unauthorized = normalizeCheckoutError({
    statusCode: 401,
    responseBody: { message: 'Unauthenticated.' },
  }, 'Checkout failed');

  assert.equal(unauthorized.statusCode, 502);
  assert.match(unauthorized.message, /provider authorization failed/i);

  const forbidden = normalizeCheckoutError({
    statusCode: 403,
    responseBody: { message: 'Forbidden.' },
  }, 'Checkout failed');

  assert.equal(forbidden.statusCode, 502);
  assert.match(forbidden.message, /provider authorization failed/i);
});

test('candidate authentication failures remain 401 responses', () => {
  const result = normalizeCheckoutError({
    statusCode: 401,
    message: 'Unauthorized',
  }, 'Checkout failed');

  assert.equal(result.statusCode, 401);
  assert.equal(result.message, 'Unauthorized');
});

test('explicit provider 503 failures are not treated as pending payment attempts', () => {
  assert.equal(isAmbiguousInitiationError({
    statusCode: 503,
    message: 'CamerPay request failed with status 503',
    responseBody: { message: 'Service Unavailable' },
  }), false);
});

test('network failures remain ambiguous because provider acceptance is unknown', () => {
  assert.equal(isAmbiguousInitiationError({
    statusCode: 502,
    message: 'Unable to reach CamerPay API. Please retry in a moment.',
  }), true);
});

test('DNS resolution failures are definitive because no provider request could be sent', () => {
  assert.equal(isAmbiguousInitiationError({
    statusCode: 502,
    message: 'Unable to reach CamerPay API. Please retry in a moment.',
    responseBody: {
      code: 'ENOTFOUND',
      endpoint: 'https://api.camerpay.biz/api/payment/initiate',
      detail: 'fetch failed',
    },
  }), false);
});

test('provider terminal states, including refunds, remain distinct', () => {
  assert.equal(mapProviderStatusToTransactionStatus('successful'), 'successful');
  assert.equal(mapProviderStatusToTransactionStatus('failed'), 'failed');
  assert.equal(mapProviderStatusToTransactionStatus('cancelled'), 'cancelled');
  assert.equal(mapProviderStatusToTransactionStatus('refunded'), 'refunded');
  assert.equal(mapProviderStatusToTransactionStatus('reversed'), 'refunded');
});