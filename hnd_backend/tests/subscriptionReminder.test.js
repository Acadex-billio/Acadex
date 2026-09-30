const test = require('node:test');
const assert = require('node:assert/strict');

const { getSubscriptionReminderState } = require('../utils/subscriptionUtils');

const makeDate = (baseNow, daysFromNow) => new Date(baseNow.getTime() + (daysFromNow * 24 * 60 * 60 * 1000));

test('reminder state identifies 7-day, 3-day, 1-day and expired subscriptions', () => {
  const now = new Date('2026-01-15T12:00:00Z');

  assert.equal(getSubscriptionReminderState({ expires_at: makeDate(now, 7), now }).state, '7_days');
  assert.equal(getSubscriptionReminderState({ expires_at: makeDate(now, 3), now }).state, '3_days');
  assert.equal(getSubscriptionReminderState({ expires_at: makeDate(now, 1), now }).state, '1_day');
  assert.equal(getSubscriptionReminderState({ expires_at: makeDate(now, -1), now }).state, 'expired');
});
