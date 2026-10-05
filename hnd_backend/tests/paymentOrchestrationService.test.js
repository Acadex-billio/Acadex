const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCheckoutError,
  isAmbiguousInitiationError,
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