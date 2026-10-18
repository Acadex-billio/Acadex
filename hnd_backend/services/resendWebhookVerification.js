'use strict';

const crypto = require('crypto');

const verifyResendWebhook = ({ payload, id, timestamp, signature, secret, now = Date.now() }) => {
  if (!payload || !id || !timestamp || !signature || !secret) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(now / 1000) - timestampSeconds) > 300) return false;

  const normalizedSecret = String(secret);
  if (!normalizedSecret.startsWith('whsec_')) return false;
  const encodedSecret = normalizedSecret.slice('whsec_'.length);
  let key;
  try {
    key = Buffer.from(encodedSecret, 'base64');
  } catch (_) {
    return false;
  }
  if (!key.length) return false;

  const signedContent = `${id}.${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest();
  return String(signature).split(' ').some((versionedSignature) => {
    const [version, encodedSignature] = versionedSignature.split(',', 2);
    if (version !== 'v1' || !encodedSignature) return false;
    let received;
    try {
      received = Buffer.from(encodedSignature, 'base64');
    } catch (_) {
      return false;
    }
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
};

module.exports = { verifyResendWebhook };
