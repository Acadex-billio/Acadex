/**
 * Email Service using Resend
 * Requires: RESEND_API_KEY in .env
 * Domain: houseofgraceweb.com
 * From email: hndplatform@houseofgraceweb.com
 */
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const hasEmailConfig = () => {
  const apiKey = process.env.RESEND_API_KEY;
  return Boolean(apiKey && apiKey.trim());
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
    const result = await resend.emails.send({
      from: 'Acadex <hndplatform@houseofgraceweb.com>',
      ...options,
    });
    console.log('[Email] Sent successfully:', result.id);
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
const sendBulkBcc = async (recipients, subject, text, chunkSize = 10) => {
  const results = { attempted: 0, sent: 0, failed: 0 };
  const emails = [...new Set(recipients.map((r) => (typeof r === 'object' ? r.email : r)).filter(Boolean))];
  results.attempted = emails.length;

  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const bcc = chunk.join(', ');
    
    try {
      await sendEmail({
        to: 'hndplatform@houseofgraceweb.com', // Send to self with BCC
        bcc,
        subject,
        text,
      });
      results.sent += chunk.length;
      console.log(`[Email] Batch sent: ${chunk.length} recipients`);
    } catch (err) {
      results.failed += chunk.length;
      console.error('[Email] Batch error:', err?.message || err);
    }
  }
  return results;
};

module.exports = { sendEmail, sendBulkBcc, hasEmailConfig };
