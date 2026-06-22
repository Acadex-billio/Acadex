const User = require('../models/User');
const { sendBulkBcc, sendEmail } = require('../services/emailService');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');
const logger = require('../utils/logger');

// Helper to build user query from filters
const buildQueryFromFilters = ({ departments, programs, inactivityMonths }) => {
  const q = { account_status: 'active' };
  if (Array.isArray(departments) && departments.length) q.dpt_id = { $in: departments };
  if (Array.isArray(programs) && programs.length) q.program = { $in: programs };

  // inactivityMonths is number or array -> select users whose last_login_at older than N months
  if (inactivityMonths) {
    const months = Array.isArray(inactivityMonths) ? inactivityMonths.map(Number) : [Number(inactivityMonths)];
    // choose max month filter (broadest)
    const maxMonths = Math.max(...months.filter(Boolean));
    if (maxMonths && !Number.isNaN(maxMonths)) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - maxMonths);
      q.last_login_at = { $lte: cutoff };
    }
  }

  return q;
};

exports.searchUsers = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Number(req.query.limit || 25));

    const filter = { account_status: 'active' };
    if (q) {
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { cand_id: new RegExp(q, 'i') },
      ];
    }

    const users = await User.find(filter).select('cand_id name email dpt_id program account_status allow_emails allow_push_notifications push_subscription last_login_at').skip((page - 1) * limit).limit(limit).lean();
    return res.json({ success: true, users });
  } catch (err) {
    logger.error('Developer searchUsers error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to search users' });
  }
};

exports.sendEmailAlert = async (req, res) => {
  try {
    const { subject, text, departments, programs, inactivityMonths, emails: explicitEmails, userIds } = req.body;
    if (!subject || !text) return res.status(400).json({ success: false, message: 'Missing subject or text' });

    let emails = [];

    // explicit emails provided
    if (Array.isArray(explicitEmails) && explicitEmails.length) {
      emails = explicitEmails.map(String).filter(Boolean);
    }

    // explicit user ids provided
    if ((!emails || emails.length === 0) && Array.isArray(userIds) && userIds.length) {
      const usersById = await User.find({ _id: { $in: userIds } }).select('email').lean();
      emails = usersById.map((u) => u.email).filter(Boolean);
    }

    // fallback to filter-based selection
    if ((!emails || emails.length === 0)) {
      const query = buildQueryFromFilters({ departments, programs, inactivityMonths });
      const users = await User.find(query).select('email name').lean();
      emails = users.map((u) => u.email).filter(Boolean);
    }

    const result = await sendBulkBcc(emails.map((e) => ({ email: e })), subject, text, 50);
    return res.json({ success: true, result, attempted: emails.length });
  } catch (err) {
    logger.error('Developer sendEmailAlert error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to send email alert' });
  }
};

exports.sendPushAlert = async (req, res) => {
  try {
    const { title, body, url, departments, programs, inactivityMonths, userIds } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    if (!isWebPushConfigured) {
      logger.warn('Developer sendPushAlert: WebPush not configured');
      return res.status(503).json({ success: false, message: 'WebPush is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env' });
    }

    let users = [];

    if (Array.isArray(userIds) && userIds.length) {
      users = await User.find({ _id: { $in: userIds } }).select('push_subscription name allow_push_notifications').lean();
    }

    if (!users || users.length === 0) {
      const query = buildQueryFromFilters({ departments, programs, inactivityMonths });
      users = await User.find(query).select('push_subscription name allow_push_notifications').lean();
    }

    logger.debug('Developer sendPushAlert: Found users', { totalUsers: users.length });

    const targets = users.filter((u) => u.allow_push_notifications && u.push_subscription);
    
    if (targets.length === 0) {
      logger.warn('Developer sendPushAlert: No users with push enabled', { totalUsers: users.length });
      return res.status(400).json({ success: false, message: 'No users found with push notifications enabled' });
    }

    logger.info('Developer sendPushAlert: Sending to targets', { targetCount: targets.length });
    const result = await sendBulkPushNotification(targets, 'custom_alert', title, body, url || '/');
    
    logger.info('Developer sendPushAlert: Send complete', { sent: result.sent, failed: result.failed });
    return res.json({ success: true, result, attempted: targets.length, sent: result.sent, failed: result.failed });
  } catch (err) {
    logger.error('Developer sendPushAlert error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: `Failed to send push alert: ${err.message}` });
  }
};
