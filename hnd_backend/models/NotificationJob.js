const mongoose = require('mongoose');

const failedRecipientSchema = new mongoose.Schema(
  {
    email: { type: String, default: '' },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const notificationJobSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['email', 'push'], required: true },
    status: { type: String, enum: ['queued', 'sending', 'completed', 'failed'], default: 'queued', index: true },
    createdBy: { type: String, required: true, index: true },
    total: { type: Number, required: true, min: 0 },
    processed: { type: Number, default: 0, min: 0 },
    accepted: { type: Number, default: 0, min: 0 },
    succeeded: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    batchSize: { type: Number, default: 1, min: 1 },
    totalBatches: { type: Number, default: 0, min: 0 },
    batchesProcessed: { type: Number, default: 0, min: 0 },
    failedRecipients: { type: [failedRecipientSchema], default: [] },
    error: { type: String, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: { expires: 0 } },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NotificationJob', notificationJobSchema);
