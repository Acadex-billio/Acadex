const User = require('../models/User');
const { sendBulkBcc } = require('../services/emailService');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');
const NotificationJob = require('../models/NotificationJob');
const NotificationJobRecipient = require('../models/NotificationJobRecipient');
const { updateEmailJobCompletion } = require('../services/notificationJobService');
const logger = require('../utils/logger');

const EMAIL_BATCH_SIZE = 49; // Leave one of Resend's 50 recipient slots for the internal To address.
const PUSH_BATCH_SIZE = 10;
const JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Helper to build user query from filters
const buildQueryFromFilters = ({ departments, programs, inactivityMonths }) => {
  const q = { account_status: 'active' };
  if (Array.isArray(departments) && departments.length) q.dpt_id = { $in: departments };
  const selectedPrograms = Array.isArray(programs) ? programs : [];
  const programFilters = selectedPrograms.filter((program) => !['LECTURER', 'ADMINS'].includes(program));
  const recipientFilters = [];
  if (!selectedPrograms.length || programFilters.length) {
    recipientFilters.push({
      role: 'candidate',
      ...(programFilters.length ? { program: { $in: programFilters } } : {}),
    });
  }
  if (selectedPrograms.includes('LECTURER')) recipientFilters.push({ role: 'lecturer' });
  if (selectedPrograms.includes('ADMINS')) recipientFilters.push({ role: { $in: ['admin', 'developer'] } });
  if (recipientFilters.length === 1) Object.assign(q, recipientFilters[0]);
  else if (recipientFilters.length > 1) q.$or = recipientFilters;

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
    if (!String(process.env.RESEND_WEBHOOK_SECRET || '').trim()) {
      return res.status(503).json({
        success: false,
        message: 'Email delivery tracking is not configured. Set RESEND_WEBHOOK_SECRET and configure the Resend webhook before broadcasting.',
      });
    }

    let emails = [];

    if (Array.isArray(explicitEmails)) {
      emails = explicitEmails.map(String).filter(Boolean);
    } else if (Array.isArray(userIds) && userIds.length) {
      const usersById = await User.find({
        _id: { $in: userIds },
        account_status: 'active',
        allow_emails: true,
        email: { $exists: true, $ne: '' },
      }).select('email').lean();
      emails = usersById.map((u) => u.email).filter(Boolean);
    } else {
      const query = buildQueryFromFilters({ departments, programs, inactivityMonths });
      const users = await User.find({
        ...query,
        allow_emails: true,
        email: { $exists: true, $ne: '' },
      }).select('email').lean();
      emails = users.map((u) => u.email).filter(Boolean);
    }

    emails = [...new Map(emails.map((email) => [String(email).trim().toLowerCase(), String(email).trim()])).values()]
      .filter(Boolean);
    if (!emails.length) {
      return res.status(400).json({
        success: false,
        message: Array.isArray(userIds) && userIds.length
          ? 'No selected users are eligible to receive email'
          : 'No eligible email recipients were found',
      });
    }

    const job = await NotificationJob.create({
      kind: 'email',
      status: 'queued',
      createdBy: String(req.user?.cand_id || req.user?.email || ''),
      total: emails.length,
      batchSize: EMAIL_BATCH_SIZE,
      totalBatches: Math.ceil(emails.length / EMAIL_BATCH_SIZE),
    });
    try {
      await NotificationJobRecipient.insertMany(emails.map((email) => ({
        jobId: job._id,
        email,
        emailNormalized: email.toLowerCase(),
      })));
    } catch (error) {
      await NotificationJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'failed',
            error: 'Could not prepare email delivery tracking.',
            completedAt: new Date(),
            expiresAt: new Date(Date.now() + JOB_RETENTION_MS),
          },
        }
      );
      await NotificationJobRecipient.updateMany(
        { jobId: job._id },
        { $set: { expiresAt: new Date(Date.now() + JOB_RETENTION_MS) } }
      );
      throw error;
    }

    setImmediate(() => {
      sendBulkBcc(
        emails.map((email) => ({ email })),
        subject,
        text,
        EMAIL_BATCH_SIZE,
        async (batch) => {
          if (batch.accepted && !batch.emailId) {
            throw new Error('Email provider accepted a batch without returning a delivery tracking ID');
          }
          const batchEmails = batch.emails.map((email) => email.toLowerCase());
          const reason = batch.reason || 'Email provider rejected this batch';
          const recipientUpdate = await NotificationJobRecipient.updateMany(
            { jobId: job._id, emailNormalized: { $in: batchEmails }, status: 'queued' },
            {
              $set: batch.accepted
                ? { status: 'accepted', emailId: batch.emailId }
                : { status: 'failed', reason },
            }
          );
          const processedCount = recipientUpdate.modifiedCount ?? recipientUpdate.nModified ?? 0;
          const failedRecipients = batch.accepted ? [] : batch.emails.map((email) => ({ email, reason }));
          if (processedCount !== batch.emails.length) {
            throw new Error('Email batch recipients could not be matched to the broadcast job');
          }
          await NotificationJob.updateOne(
            { _id: job._id },
            {
              $set: { status: 'sending' },
              $inc: {
                accepted: batch.accepted ? batch.emails.length : 0,
                processed: batch.accepted ? 0 : processedCount,
                failed: batch.accepted ? 0 : processedCount,
                batchesProcessed: 1,
              },
              ...(failedRecipients.length ? { $push: { failedRecipients: { $each: failedRecipients } } } : {}),
            }
          );
        },
        {
          tags: [
            { name: 'category', value: 'acadex-broadcast' },
            { name: 'job_id', value: String(job._id) },
          ],
        }
      ).then(() => updateEmailJobCompletion(job._id)).catch(async (err) => {
        logger.error('Developer email broadcast job failed', { jobId: String(job._id), error: err.message });
        await NotificationJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'failed',
              error: 'The email broadcast could not be completed.',
              completedAt: new Date(),
              expiresAt: new Date(Date.now() + JOB_RETENTION_MS),
            },
          }
        );
        await NotificationJobRecipient.updateMany(
          { jobId: job._id },
          { $set: { expiresAt: new Date(Date.now() + JOB_RETENTION_MS) } }
        );
      });
    });

    return res.status(202).json({
      success: true,
      jobId: String(job._id),
      total: emails.length,
      totalBatches: job.totalBatches,
      message: 'Email broadcast queued',
    });
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

    let users;
    if (Array.isArray(userIds) && userIds.length) {
      users = await User.find({
        _id: { $in: userIds },
        account_status: 'active',
        allow_push_notifications: true,
        push_subscription: { $ne: null },
      }).select('cand_id email push_subscription name allow_push_notifications').lean();
    } else {
      const query = buildQueryFromFilters({ departments, programs, inactivityMonths });
      users = await User.find({
        ...query,
        allow_push_notifications: true,
        push_subscription: { $ne: null },
      }).select('cand_id email push_subscription name allow_push_notifications').lean();
    }

    logger.debug('Developer sendPushAlert: Found users', { totalUsers: users.length });

    const targets = users.filter((user) => user.allow_push_notifications && user.push_subscription?.endpoint);
    
    if (targets.length === 0) {
      logger.warn('Developer sendPushAlert: No users with push enabled', { totalUsers: users.length });
      return res.status(400).json({ success: false, message: 'No users found with push notifications enabled' });
    }

    const job = await NotificationJob.create({
      kind: 'push',
      status: 'queued',
      createdBy: String(req.user?.cand_id || req.user?.email || ''),
      total: targets.length,
      batchSize: PUSH_BATCH_SIZE,
      totalBatches: Math.ceil(targets.length / PUSH_BATCH_SIZE),
    });

    logger.info('Developer sendPushAlert: Queued broadcast', { jobId: String(job._id), targetCount: targets.length });
    setImmediate(() => {
      let processed = 0;
      sendBulkPushNotification(
        targets,
        'custom_alert',
        title,
        body,
        url || '/',
        undefined,
        async ({ user, result }) => {
          processed += 1;
          const failedRecipients = result.sent
            ? []
            : [{
                email: user.email || user.cand_id || 'Unknown recipient',
                reason: `Push service rejected the subscription (${result.reason || 'send_failed'})`,
              }];
          await NotificationJob.updateOne(
            { _id: job._id },
            {
              $set: { status: 'sending' },
              $inc: {
                processed: 1,
                accepted: result.sent ? 1 : 0,
                succeeded: result.sent ? 1 : 0,
                failed: result.sent ? 0 : 1,
                ...(processed % PUSH_BATCH_SIZE === 0 || processed === targets.length ? { batchesProcessed: 1 } : {}),
              },
              ...(failedRecipients.length ? { $push: { failedRecipients: { $each: failedRecipients } } } : {}),
            }
          );

          if (!result.sent && [404, 410].includes(Number(result.reason))) {
            await User.updateOne(
              { _id: user._id, 'push_subscription.endpoint': user.push_subscription.endpoint },
              {
                $set: {
                  allow_push_notifications: false,
                  push_subscription: null,
                  push_subscription_updated_at: new Date(),
                },
              }
            );
          }
        }
      ).then(() => {
        logger.info('Developer sendPushAlert: Send complete', { jobId: String(job._id) });
        return NotificationJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'completed',
              completedAt: new Date(),
              expiresAt: new Date(Date.now() + JOB_RETENTION_MS),
            },
          }
        );
      }).catch(async (err) => {
        logger.error('Developer push broadcast job failed', { jobId: String(job._id), error: err.message });
        await NotificationJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'failed',
              error: 'The push broadcast could not be completed.',
              completedAt: new Date(),
              expiresAt: new Date(Date.now() + JOB_RETENTION_MS),
            },
          }
        );
      });
    });

    return res.status(202).json({
      success: true,
      jobId: String(job._id),
      total: targets.length,
      totalBatches: job.totalBatches,
      message: 'Push broadcast queued',
    });
  } catch (err) {
    logger.error('Developer sendPushAlert error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: `Failed to send push alert: ${err.message}` });
  }
};

exports.getNotificationJob = async (req, res) => {
  try {
    const owner = String(req.user?.cand_id || req.user?.email || '');
    const job = await NotificationJob.findOne({ _id: req.params.jobId, createdBy: owner }).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Broadcast job not found' });

    return res.json({
      success: true,
      job: {
        id: String(job._id),
        kind: job.kind,
        status: job.status,
        total: job.total,
        processed: job.processed,
        accepted: job.accepted || 0,
        succeeded: job.succeeded,
        failed: job.failed,
        pending: Math.max(0, job.total - job.processed),
        batchSize: job.batchSize,
        totalBatches: job.totalBatches,
        batchesProcessed: job.batchesProcessed,
        failedRecipients: job.failedRecipients,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      },
    });
  } catch (err) {
    logger.error('Developer getNotificationJob error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to retrieve broadcast status' });
  }
};
