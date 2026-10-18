'use strict';

const NotificationJob = require('../models/NotificationJob');
const NotificationJobRecipient = require('../models/NotificationJobRecipient');
const { updateEmailJobCompletion } = require('../services/notificationJobService');
const { verifyResendWebhook } = require('../services/resendWebhookVerification');
const logger = require('../utils/logger');

const TERMINAL_EMAIL_EVENTS = new Map([
  ['email.delivered', 'delivered'],
  ['email.complained', 'delivered'],
  ['email.bounced', 'failed'],
  ['email.failed', 'failed'],
  ['email.suppressed', 'failed'],
]);

const getBroadcastJobId = (tags) => {
  if (Array.isArray(tags)) {
    return tags.find((tag) => tag?.name === 'job_id')?.value || null;
  }
  return tags?.job_id || null;
};

exports.handleEvent = async (req, res) => {
  const verified = verifyResendWebhook({
    payload: req.rawBody,
    id: req.get('svix-id'),
    timestamp: req.get('svix-timestamp'),
    signature: req.get('svix-signature'),
    secret: process.env.RESEND_WEBHOOK_SECRET,
  });
  if (!verified) {
    return res.status(400).json({ success: false, message: 'Invalid Resend webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(req.rawBody);
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Invalid Resend webhook payload' });
  }

  const nextStatus = TERMINAL_EMAIL_EVENTS.get(event?.type);
  if (!nextStatus) return res.status(200).json({ success: true, message: 'Event acknowledged' });

  const emailId = String(event?.data?.email_id || '').trim();
  const impactedEmails = Array.isArray(event?.data?.to)
    ? event.data.to.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!emailId || !impactedEmails.length) {
    return res.status(400).json({ success: false, message: 'Email event is missing its message ID or recipients' });
  }

  try {
    const jobId = getBroadcastJobId(event.data.tags);
    const recipients = await NotificationJobRecipient.find({
      ...(jobId ? { jobId } : {}),
      emailId,
      emailNormalized: { $in: impactedEmails },
      status: 'accepted',
    }).select('_id jobId email').lean();

    if (!recipients.length) {
      const hasTrackedBatch = await NotificationJobRecipient.exists({ emailId });
      if (!hasTrackedBatch && jobId) {
        const jobExists = await NotificationJob.exists({ _id: jobId, kind: 'email' });
        if (jobExists) {
          logger.warn('Resend webhook arrived before its broadcast batch was recorded', { jobId, emailId });
          return res.status(503).json({ success: false, message: 'Broadcast batch tracking is not ready; retry the webhook' });
        }
      }
      return res.status(200).json({ success: true, message: 'Event acknowledged' });
    }

    const reason = nextStatus === 'failed'
      ? String(event.data?.bounce?.message || event.data?.error?.message || `Resend reported ${event.type}`)
      : null;
    const updates = await Promise.all(recipients.map((recipient) =>
      NotificationJobRecipient.findOneAndUpdate(
        { _id: recipient._id, status: 'accepted' },
        { $set: { status: nextStatus, reason } },
        { new: false }
      ).select('_id jobId email').lean()
    ));
    const updated = updates.filter(Boolean);
    if (updated.length) {
      const updatedJobId = updated[0].jobId;
      await NotificationJob.updateOne(
        { _id: updatedJobId },
        {
          $inc: {
            processed: updated.length,
            succeeded: nextStatus === 'delivered' ? updated.length : 0,
            failed: nextStatus === 'failed' ? updated.length : 0,
          },
          ...(nextStatus === 'failed'
            ? { $push: { failedRecipients: { $each: updated.map((recipient) => ({ email: recipient.email, reason })) } } }
            : {}),
        }
      );
      await updateEmailJobCompletion(updatedJobId);
    }

    return res.status(200).json({ success: true, message: 'Event processed' });
  } catch (error) {
    logger.error('Resend webhook processing failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to process Resend webhook' });
  }
};
