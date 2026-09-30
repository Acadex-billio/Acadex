const nodemailer = require('nodemailer');
const User = require('../models/User');
const { resolveSubscription, getSubscriptionReminderState } = require('../utils/subscriptionUtils');

const getSmtpTransporter = () => {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || process.env.EMAIL_SECURE || 'false').toLowerCase() === 'true',
    auth: { user, pass },
  });
};

async function sendSubscriptionReminderEmail({ email, name, plan, reminderState, daysRemaining, expiresAt }) {
  if (!email || !String(email).includes('@')) return { sent: false, reason: 'invalid_email' };

  const transporter = getSmtpTransporter();
  if (!transporter) {
    return { sent: false, reason: 'not_configured' };
  }

  const titleMap = {
    '7_days': 'Your plan expires in 7 days',
    '3_days': 'Your plan expires in 3 days',
    '1_day': 'Your plan expires in 1 day',
    expired: 'Your plan has expired and was reset to Basic',
  };

  const bodyMap = {
    '7_days': 'Your %PLAN% subscription will expire in 7 days. Renew early to keep uninterrupted access.',
    '3_days': 'Your %PLAN% subscription will expire in 3 days. Please renew before it ends.',
    '1_day': 'Your %PLAN% subscription will expire tomorrow. Renew today to keep your current access level.',
    expired: 'Your %PLAN% subscription has expired. Your account has been returned to the Basic plan automatically.',
  };

  const subject = titleMap[reminderState] || 'Subscription update';
  const body = String(bodyMap[reminderState] || 'Your subscription status has changed.').replace('%PLAN%', plan || 'current');

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.EMAIL_FROM || 'no-reply@acadex.local',
    to: email,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
        <h3>${subject}</h3>
        <p>Hello ${name || 'Candidate'},</p>
        <p>${body}</p>
        <p><strong>Plan:</strong> ${plan || 'Basic'}</p>
        <p><strong>Expiry date:</strong> ${expiresAt ? new Date(expiresAt).toLocaleString() : 'Not set'}</p>
        <p><strong>Days remaining:</strong> ${daysRemaining ?? 0}</p>
        <p>Regards,<br />Acadex Team</p>
      </div>
    `,
  });

  return { sent: true };
}

async function processSubscriptionExpiryReminders(now = new Date()) {
  const users = await User.find({
    'subscription.expires_at': { $ne: null },
    email: { $exists: true, $ne: '' },
    allow_emails: { $ne: false },
  }).select('cand_id name email subscription allow_emails').lean();

  let processed = 0;
  let updated = 0;
  let sent = 0;

  for (const user of users) {
    if (!user?.subscription) continue;

    processed += 1;
    const normalized = resolveSubscription(user.subscription);
    const expiresAt = normalized?.expires_at || user.subscription?.expires_at;
    if (!expiresAt) continue;

    const reminder = getSubscriptionReminderState({ expires_at: expiresAt, now });
    const currentState = String(user.subscription?.last_reminder_state || 'none');
    const shouldNotify = ['7_days', '3_days', '1_day', 'expired'].includes(reminder.state) && currentState !== reminder.state;

    if (reminder.state === 'expired') {
      const fallbackSubscription = {
        ...user.subscription,
        plan: 'basic',
        status: 'active',
        expires_at: null,
        last_reminder_state: 'expired',
        last_reminder_sent_at: new Date(now),
      };

      await User.updateOne(
        { cand_id: user.cand_id },
        { $set: { subscription: fallbackSubscription } }
      );
      updated += 1;

      if (shouldNotify) {
        const result = await sendSubscriptionReminderEmail({
          email: user.email,
          name: user.name,
          plan: 'Basic',
          reminderState: 'expired',
          daysRemaining: 0,
          expiresAt: expiresAt,
        });
        if (result.sent) sent += 1;
      }
      continue;
    }

    if (shouldNotify) {
      const result = await sendSubscriptionReminderEmail({
        email: user.email,
        name: user.name,
        plan: user.subscription?.plan || 'Basic',
        reminderState: reminder.state,
        daysRemaining: reminder.days_remaining,
        expiresAt: expiresAt,
      });

      if (result.sent) sent += 1;

      await User.updateOne(
        { cand_id: user.cand_id },
        { $set: { 'subscription.last_reminder_state': reminder.state, 'subscription.last_reminder_sent_at': now } }
      );
      updated += 1;
    }
  }

  return { processed, updated, sent };
}

let reminderTimer = null;

const startSubscriptionReminderScheduler = () => {
  if (reminderTimer) return;

  const intervalMs = Number(process.env.SUBSCRIPTION_REMINDER_INTERVAL_MS || 60 * 60 * 1000);
  reminderTimer = setInterval(() => {
    processSubscriptionExpiryReminders().catch((err) => {
      console.error('[SubscriptionReminder] scheduler failed:', err?.message || err);
    });
  }, intervalMs);

  processSubscriptionExpiryReminders().catch((err) => {
    console.error('[SubscriptionReminder] initial scan failed:', err?.message || err);
  });
};

module.exports = {
  startSubscriptionReminderScheduler,
  processSubscriptionExpiryReminders,
  sendSubscriptionReminderEmail,
};
