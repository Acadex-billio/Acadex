'use strict';

const NotificationJob = require('../models/NotificationJob');
const NotificationJobRecipient = require('../models/NotificationJobRecipient');
const JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const updateEmailJobCompletion = async (jobId) => {
  const job = await NotificationJob.findById(jobId).select('status total totalBatches batchesProcessed').lean();
  if (!job || ['completed', 'failed'].includes(job.status) || job.batchesProcessed < job.totalBatches) return;

  const outstanding = await NotificationJobRecipient.countDocuments({
    jobId,
    status: { $in: ['queued', 'accepted'] },
  });
  if (outstanding) return;

  const expiresAt = new Date(Date.now() + JOB_RETENTION_MS);
  await NotificationJobRecipient.updateMany({ jobId }, { $set: { expiresAt } });
  await NotificationJob.updateOne(
    { _id: jobId, status: { $in: ['queued', 'sending'] }, batchesProcessed: { $gte: job.totalBatches } },
    {
      $set: {
        status: 'completed',
        completedAt: new Date(),
        expiresAt,
      },
    }
  );
};

module.exports = { updateEmailJobCompletion };
