/**
 * Email Service using Resend
 * Requires: RESEND_API_KEY in .env
 * Domain: houseofgraceweb.com
 * From email: hndplatform@houseofgraceweb.com
 */
let Resend;
let resend = null;
try {
  Resend = require('resend').Resend;
} catch (_) {
  Resend = null;
}

const hasEmailConfig = () => {
  const apiKey = process.env.RESEND_API_KEY;
  return Boolean(apiKey && apiKey.trim() && Resend);
};

/**
 * Send email using Resend
 * @param {object} options - mail options (to, subject, text/html)
 * @returns {Promise<object>} - send result
 */
const sendEmail = async (options) => {
  if (!hasEmailConfig()) {
    const err = new Error('Email not configured. Set RESEND_API_KEY in .env');
    console.error('[Email]', err.message);
    throw err;
  }

  try {
    if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: 'Acadex <hndplatform@houseofgraceweb.com>',
      ...options,
    });

    const providerError = result?.error || (!result?.data?.id && !result?.id ? result : null);
    if (providerError) {
      const message = providerError.message || 'Email provider rejected the request';
      const err = new Error(message);
      err.providerError = providerError;
      throw err;
    }
    if (!result?.data?.id && !result?.id) {
      throw new Error('Email provider did not confirm acceptance of the request');
    }

    console.log('[Email] Accepted by provider:', result?.data?.id || result.id);
    return result;
  } catch (err) {
    console.error('[Email] Failed to send:', err?.message || err);
    throw err;
  }
};

/**
 * Send batch emails (BCC) using Resend
 * Note: Resend has limits on BCC recipients, so we send in smaller batches
 * @param {Array<{email: string, name?: string}>} recipients
 * @param {string} subject
 * @param {string} text
 * @param {number} chunkSize - default 10 (Resend BCC limit)
 */
const sendBulkBcc = async (recipients, subject, text, chunkSize = 10, onBatchResult = null, extraOptions = {}) => {
  const results = { attempted: 0, sent: 0, failed: 0, batchesAttempted: 0, batchesSent: 0, failedRecipients: [] };
  const seen = new Set();
  const emails = recipients
    .map((recipient) => String(recipient && typeof recipient === 'object' ? recipient.email || '' : recipient || '').trim())
    .filter((email) => {
      const normalized = email.toLowerCase();
      if (!email || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  results.attempted = emails.length;
  const safeChunkSize = Math.max(1, Math.floor(Number(chunkSize) || 10));

  for (let i = 0; i < emails.length; i += safeChunkSize) {
    const chunk = emails.slice(i, i + safeChunkSize);
    let batchResult;
    results.batchesAttempted += 1;

    try {
      const response = await sendEmail({
        to: 'hndplatform@houseofgraceweb.com', // Send to self with BCC
        bcc: chunk,
        subject,
        text,
        ...extraOptions,
      });
      batchResult = { emails: chunk, accepted: true, emailId: response?.data?.id || response?.id };
      results.sent += chunk.length;
      results.batchesSent += 1;
      console.log(`[Email] Batch accepted by provider: ${chunk.length} recipients`);
    } catch (err) {
      results.failed += chunk.length;
      const reason = err?.message || 'Email provider rejected this batch';
      results.failedRecipients.push(...chunk.map((email) => ({ email, reason })));
      batchResult = { emails: chunk, accepted: false, reason };
      console.error('[Email] Batch rejected:', reason);
    }

    if (typeof onBatchResult === 'function') {
      await onBatchResult(batchResult);
    }
  }
  return results;
};

module.exports = { sendEmail, sendBulkBcc, hasEmailConfig };
