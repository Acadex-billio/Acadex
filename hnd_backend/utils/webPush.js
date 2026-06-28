const webpush = require('web-push');
const nodemailer = require('nodemailer');

const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:admin@hnd-platform.local').trim();
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();

const isConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[WebPush] VAPID keys are missing; push delivery is disabled.');
}

const sendWebPushNotification = async (subscription, payload, userContext = {}) => {
  if (!isConfigured) return { sent: false, reason: 'not_configured' };
  if (!subscription || !subscription.endpoint) return { sent: false, reason: 'invalid_subscription' };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload || {}));
    return { sent: true };
  } catch (err) {
    const reason = err?.statusCode || 'send_failed';
    const message = err?.message || 'send_failed';
    console.error('[WebPush] Notification failed:', {
      statusCode: reason,
      message,
      endpoint: subscription?.endpoint?.substring(0, 80),
      userContext,
    });

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587', 10),
        secure: String(process.env.SMTP_SECURE || process.env.EMAIL_SECURE || 'false').toLowerCase() === 'true',
        auth: {
          user: process.env.SMTP_USER || process.env.EMAIL_USER,
          pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.EMAIL_USER || 'no-reply@acadex.local',
        to: process.env.DEVELOPER_ALERT_EMAIL || process.env.EMAIL_USER || 'developer@acadex.local',
        subject: 'Web Push Delivery Failure',
        html: `<div><h3>Web push delivery failed</h3><p><strong>User:</strong> ${userContext?.name || userContext?.email || 'unknown'}</p><p><strong>Email:</strong> ${userContext?.email || 'unknown'}</p><p><strong>Reason:</strong> ${message}</p><p><strong>Status:</strong> ${reason}</p><p><strong>Time:</strong> ${new Date().toISOString()}</p></div>`,
      });
    } catch (mailErr) {
      console.error('[WebPush] Failure email reporting failed:', mailErr?.message || mailErr);
    }

    return {
      sent: false,
      reason,
      error: message,
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

    const result = await sendWebPushNotification(user.push_subscription, payload, {
      name: user.name,
      email: user.email,
      candId: user.cand_id,
      role: user.role,
    });
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
