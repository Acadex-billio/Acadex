const axios = require('axios');
const webpush = require('web-push');
const logger = require('../utils/logger');
let nodemailer;
let Resend;

try {
  nodemailer = require('nodemailer');
} catch (err) {
  logger.debug('nodemailer not available', { error: err.message });
}

try {
  Resend = require('resend').Resend;
} catch (err) {
  // optional
}

const PUSH_INTERVAL_MS = parseInt(process.env.KEEPALIVE_PUSH_INTERVAL_MS || String(3 * 60 * 1000), 10); // default 3 minutes
const EMAIL_INTERVAL_MS = parseInt(process.env.KEEPALIVE_EMAIL_INTERVAL_MS || String(12 * 60 * 60 * 1000), 10); // default 12 hours

let pushTimer = null;
let emailTimer = null;
let transporter = null;
let resendClient = null;

const formatMessage = () => ({
  title: 'Backend Keepalive',
  message: 'Your Backend is alive',
  timestamp: new Date().toISOString(),
});

async function sendPushViaWebhook(url) {
  try {
    const payload = formatMessage();
    await axios.post(url, payload, { timeout: 5000 });
    logger.info('Keepalive push webhook sent', { url });
  } catch (err) {
    logger.warn('Failed to send keepalive push webhook', { error: err.message, url });
  }
}

async function sendPushViaWebPush(subscriptionJson) {
  try {
    const vapidPublic = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) {
      logger.warn('VAPID keys missing for web-push');
      return;
    }
    webpush.setVapidDetails(
      process.env.WEB_PUSH_CONTACT || 'mailto:admin@acadexe.com',
      vapidPublic,
      vapidPrivate
    );
    const payload = JSON.stringify(formatMessage());
    const subscription = JSON.parse(subscriptionJson);
    await webpush.sendNotification(subscription, payload);
    logger.info('Keepalive web-push sent');
  } catch (err) {
    logger.warn('Failed to send web-push keepalive', { error: err.message });
  }
}

async function sendEmailToDeveloper() {
  const devEmail = process.env.DEVELOPER_EMAIL;
  if (!devEmail) {
    logger.warn('DEVELOPER_EMAIL not set; skipping keepalive email');
    return;
  }

  const subject = 'Acadex Backend Keepalive';
  const text = 'Your Backend is alive';

  try {
    if (process.env.RESEND_API_KEY && Resend) {
      if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
      await resendClient.emails.send({
        from: process.env.KEEPALIVE_EMAIL_FROM || `no-reply@${process.env.EMAIL_DOMAIN || 'acadexe.com'}`,
        to: devEmail,
        subject,
        text,
      });
      logger.info('Keepalive email sent via Resend', { to: devEmail });
      return;
    }

    if (!transporter && nodemailer) {
      // Build transporter from SMTP env if provided
      const smtpHost = process.env.SMTP_HOST;
      if (!smtpHost) {
        logger.warn('SMTP_HOST not set and RESEND_API_KEY missing; cannot send keepalive email');
        return;
      }
      const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
      const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    if (!transporter) {
      logger.warn('No email transport available; skipping keepalive email');
      return;
    }

    await transporter.sendMail({
      from: process.env.KEEPALIVE_EMAIL_FROM || `no-reply@${process.env.EMAIL_DOMAIN || 'acadexe.com'}`,
      to: devEmail,
      subject,
      text,
    });

    logger.info('Keepalive email sent via SMTP', { to: devEmail });
  } catch (err) {
    logger.warn('Failed to send keepalive email', { error: err.message });
  }
}

function startKeepalive() {
  const pushWebhook = process.env.DEVELOPER_PUSH_WEBHOOK; // optional webhook URL
  const pushSubscription = process.env.DEVELOPER_PUSH_SUBSCRIPTION; // optional web push subscription JSON

  if (!pushWebhook && !pushSubscription) {
    logger.info('No push webhook or subscription configured; push notifications will be skipped');
  } else {
    // send immediately once
    if (pushWebhook) sendPushViaWebhook(pushWebhook);
    if (pushSubscription) sendPushViaWebPush(pushSubscription);

    // schedule
    pushTimer = setInterval(() => {
      if (pushWebhook) sendPushViaWebhook(pushWebhook);
      if (pushSubscription) sendPushViaWebPush(pushSubscription);
    }, PUSH_INTERVAL_MS);

    logger.info('Keepalive push notifier scheduled', { intervalMs: PUSH_INTERVAL_MS });
  }

  // Emails
  if (!process.env.DEVELOPER_EMAIL) {
    logger.info('DEVELOPER_EMAIL not set; email keepalive disabled');
  } else {
    // send once immediately, then schedule
    sendEmailToDeveloper();
    emailTimer = setInterval(() => {
      sendEmailToDeveloper();
    }, EMAIL_INTERVAL_MS);
    logger.info('Keepalive email notifier scheduled', { intervalMs: EMAIL_INTERVAL_MS });
  }
}

function stopKeepalive() {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
  if (emailTimer) {
    clearInterval(emailTimer);
    emailTimer = null;
  }
}

module.exports = { startKeepalive, stopKeepalive };
