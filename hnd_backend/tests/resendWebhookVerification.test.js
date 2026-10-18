const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { verifyResendWebhook } = require('../services/resendWebhookVerification');

const secretBytes = crypto.randomBytes(32);
const secret = `whsec_${secretBytes.toString('base64')}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const id = 'msg_test_123';
const payload = JSON.stringify({ type: 'email.delivered', data: { email_id: 'email_123' } });
const digest = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${payload}`).digest('base64');
const signature = `v1,${digest}`;

test('Resend webhook signatures validate against the raw request body', () => {
  assert.equal(verifyResendWebhook({ payload, id, timestamp, signature, secret }), true);
  assert.equal(verifyResendWebhook({ payload: `${payload} `, id, timestamp, signature, secret }), false);
});

test('Resend webhook signatures reject invalid secrets and stale timestamps', () => {
  assert.equal(verifyResendWebhook({ payload, id, timestamp, signature, secret: 'invalid' }), false);
  assert.equal(verifyResendWebhook({
    payload,
    id,
    timestamp: String(Number(timestamp) - 301),
    signature,
    secret,
  }), false);
});
