const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCheckoutError } = require('../services/paymentOrchestrationService');

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