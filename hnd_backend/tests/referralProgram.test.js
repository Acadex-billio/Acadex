const test = require('node:test');
const assert = require('node:assert/strict');
const { registerSchema } = require('../validators/auth/authSchemas');
const { isEligiblePurchase, buildAwardIdempotencyKey } = require('../services/referralService');

test('registration accepts a generated referral code and rejects malformed codes', () => {
  const candidate = {
    name: 'Referral Candidate',
    program: 'LECTURER',
    email: 'candidate@example.com',
    phone: '+237600000000',
    password: 'test-password',
    referralCode: '0123ABCDEF',
  };

  assert.equal(registerSchema.validate(candidate).error, undefined);
  assert.ok(registerSchema.validate({ ...candidate, referralCode: 'not-a-code' }).error);
});

test('only positive-amount successful transactions qualify for referral points', () => {
  assert.equal(isEligiblePurchase({ status: 'successful', amount: 2500 }), true);
  assert.equal(isEligiblePurchase({ status: 'pending', amount: 2500 }), false);
  assert.equal(isEligiblePurchase({ status: 'successful', amount: 0 }), false);
  assert.equal(isEligiblePurchase({ status: 'successful', amount: -1 }), false);
});

test('purchase reward idempotency keys do not change when an admin renames a rule', () => {
  const inputs = {
    referredUser: { _id: 'referred-id' },
    transaction: { _id: 'transaction-id', purpose_type: 'subscription' },
    rule: { trigger: 'each_purchase', code: 'old-rule-code' },
    recipient: { _id: 'recipient-id' },
  };

  const initialKey = buildAwardIdempotencyKey(inputs);
  const renamedRuleKey = buildAwardIdempotencyKey({
    ...inputs,
    rule: { ...inputs.rule, code: 'new-rule-code' },
  });
  assert.equal(initialKey, renamedRuleKey);
});
