'use strict';

const CHAT_VIDEO_CALL_MAX_DURATION_MS = 12 * 60 * 60 * 1000;

function getChatVideoCallExpiry(call, now = new Date()) {
  const startedAt = new Date(call?.started_at || 0);
  const expiresAt = new Date(startedAt.getTime() + CHAT_VIDEO_CALL_MAX_DURATION_MS);
  return {
    startedAt,
    expiresAt,
    expired: now.getTime() >= expiresAt.getTime(),
  };
}

module.exports = { CHAT_VIDEO_CALL_MAX_DURATION_MS, getChatVideoCallExpiry };
