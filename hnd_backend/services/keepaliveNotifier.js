const axios = require('axios');
const webpush = require('web-push');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const User = require('../models/User');
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
    return true;
  } catch (err) {
    logger.warn('Failed to send keepalive push webhook', { error: err.message, url });
    return false;
  }
}

async function sendPushViaWebPush(subscriptionObj) {
  try {
    const vapidPublic = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) {
      logger.warn('VAPID keys missing for web-push');
      return false;
    }
    webpush.setVapidDetails(
      process.env.WEB_PUSH_CONTACT || 'mailto:admin@acadexe.com',
      vapidPublic,
      vapidPrivate
    );
    const payload = JSON.stringify(formatMessage());
    const subscription = typeof subscriptionObj === 'string' ? JSON.parse(subscriptionObj) : subscriptionObj;
    await webpush.sendNotification(subscription, payload);
    logger.info('Keepalive web-push sent');
    return true;
  } catch (err) {
    logger.warn('Failed to send web-push keepalive', { error: err.message });
    return false;
  }
}

async function sendEmailToAddress(toEmail) {
  if (!toEmail) {
    logger.warn('No recipient email provided for keepalive');
    return false;
  }

  const subject = 'Acadex Backend Keepalive';
  const text = 'Your Backend is alive';

  try {
    if (process.env.RESEND_API_KEY && Resend) {
      if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
      await resendClient.emails.send({
        from: process.env.KEEPALIVE_EMAIL_FROM || `no-reply@${process.env.EMAIL_DOMAIN || 'acadexe.com'}`,
        to: toEmail,
        subject,
        text,
      });
      logger.info('Keepalive email sent via Resend', { to: toEmail });
      return true;
    }

    if (!transporter && nodemailer) {
      // Build transporter from SMTP env if provided
      const smtpHost = process.env.SMTP_HOST;
      if (!smtpHost) {
        logger.warn('SMTP_HOST not set and RESEND_API_KEY missing; cannot send keepalive email');
        return false;
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
      return false;
    }

    await transporter.sendMail({
      from: process.env.KEEPALIVE_EMAIL_FROM || `no-reply@${process.env.EMAIL_DOMAIN || 'acadexe.com'}`,
      to: toEmail,
      subject,
      text,
    });

    logger.info('Keepalive email sent via SMTP', { to: toEmail });
    return true;
  } catch (err) {
    logger.warn('Failed to send keepalive email', { error: err.message, to: toEmail });
    return false;
  }
}

async function notifyDevelopersOnce() {
  try {
    const developers = await User.find({ role: 'developer', account_status: 'active' }).lean().exec();
    if (!Array.isArray(developers) || developers.length === 0) {
      logger.info('No developer users found for keepalive notifications');
      return;
    }

    for (const dev of developers) {
      let pushSent = false;

      // Try web-push using stored subscription
      if (dev.allow_push_notifications && dev.push_subscription) {
        try {
          pushSent = await sendPushViaWebPush(dev.push_subscription);
        } catch (err) {
          logger.warn('Error sending web-push to developer', { id: dev._id, error: err.message });
        }
      }

      // As a fallback, try a global webhook env
      if (!pushSent && process.env.DEVELOPER_PUSH_WEBHOOK) {
        pushSent = await sendPushViaWebhook(process.env.DEVELOPER_PUSH_WEBHOOK);
      }

      // If push succeeded, send immediate email to this developer
      if (pushSent && dev.email && dev.allow_emails) {
        await sendEmailToAddress(dev.email);
      }
    }
  } catch (err) {
    logger.error('notifyDevelopersOnce failed', { error: err.message });
  }
}

async function sendPeriodicEmailsToDevelopers() {
  try {
    const developers = await User.find({ role: 'developer', account_status: 'active' }).lean().exec();
    if (!Array.isArray(developers) || developers.length === 0) return;

    for (const dev of developers) {
      if (dev.email && dev.allow_emails) {
        await sendEmailToAddress(dev.email);
      }
    }
  } catch (err) {
    logger.error('sendPeriodicEmailsToDevelopers failed', { error: err.message });
  }
}

function startKeepalive() {
  // Immediately run once
  notifyDevelopersOnce();

  // Schedule push every interval
  pushTimer = setInterval(() => {
    notifyDevelopersOnce();
  }, PUSH_INTERVAL_MS);
  logger.info('Keepalive push notifier scheduled', { intervalMs: PUSH_INTERVAL_MS });

  // Send periodic emails to developers every EMAIL_INTERVAL_MS
  // Also send one immediately to ensure developer gets the first periodic email
  sendPeriodicEmailsToDevelopers();
  emailTimer = setInterval(() => {
    sendPeriodicEmailsToDevelopers();
  }, EMAIL_INTERVAL_MS);
  logger.info('Keepalive email notifier scheduled', { intervalMs: EMAIL_INTERVAL_MS });
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
