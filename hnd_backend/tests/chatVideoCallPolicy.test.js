'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CHAT_VIDEO_CALL_MAX_DURATION_MS,
  getChatVideoCallExpiry,
} = require('../services/chatVideoCallPolicy');

test('chat calls remain active before the twelve-hour maximum', () => {
  const startedAt = new Date('2026-11-01T10:00:00.000Z');
  const expiry = getChatVideoCallExpiry(
    { started_at: startedAt },
    new Date(startedAt.getTime() + CHAT_VIDEO_CALL_MAX_DURATION_MS - 1)
  );

  assert.equal(expiry.expired, false);
  assert.equal(expiry.expiresAt.getTime(), startedAt.getTime() + 12 * 60 * 60 * 1000);
});

test('chat calls expire at the twelve-hour boundary', () => {
  const startedAt = new Date('2026-11-01T10:00:00.000Z');
  const expiry = getChatVideoCallExpiry(
    { started_at: startedAt },
    new Date(startedAt.getTime() + CHAT_VIDEO_CALL_MAX_DURATION_MS)
  );

  assert.equal(expiry.expired, true);
});
