const webpush = require('web-push');

const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:admin@hnd-platform.local').trim();
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();

const isConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[WebPush] VAPID keys are missing; push delivery is disabled.');
}

const sendWebPushNotification = async (subscription, payload) => {
  if (!isConfigured) return { sent: false, reason: 'not_configured' };
  if (!subscription || !subscription.endpoint) return { sent: false, reason: 'invalid_subscription' };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload || {}));
    return { sent: true };
  } catch (err) {
    console.error('[WebPush] Notification failed:', {
      statusCode: err?.statusCode,
      message: err?.message,
      endpoint: subscription?.endpoint?.substring(0, 50) // Log partial endpoint for debugging
    });
    return {
      sent: false,
      reason: err?.statusCode || 'send_failed',
      error: err?.message || 'send_failed',
    };
  }
};

/**
 * Generic function to send push notifications for different content types
 * @param {Array} users - Array of user objects with push_subscription property
 * @param {String} contentType - Type of content (report, presentation, question_paper, chat)
 * @param {String} title - Notification title
 * @param {String} body - Notification body/message
 * @param {String} url - URL to navigate to when notification is clicked
 * @param {String} contentId - ID of the content (optional)
 */
const sendBulkPushNotification = async (users, contentType, title, body, url, contentId) => {
  if (!isConfigured) return { sent: 0, failed: 0 };
  if (!Array.isArray(users) || !users.length) return { sent: 0, failed: 0 };

  let sentCount = 0;
  let failedCount = 0;

  const payload = {
    title,
    body,
    source: contentType,
    contentType,
    contentId: contentId || '',
    url,
    tag: `${contentType}-${contentId || Date.now()}`,
  };

  for (const user of users) {
    if (!user.push_subscription) continue;

    const result = await sendWebPushNotification(user.push_subscription, payload);
    if (result.sent) {
      sentCount++;
    } else {
      failedCount++;
    }
  }

  return { sent: sentCount, failed: failedCount };
};

module.exports = {
  sendWebPushNotification,
  sendBulkPushNotification,
  isWebPushConfigured: isConfigured,
  vapidPublicKey: VAPID_PUBLIC_KEY,
};
