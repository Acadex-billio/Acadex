const mongoose = require('mongoose');

const notificationJobRecipientSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationJob', required: true, index: true },
    email: { type: String, required: true },
    emailNormalized: { type: String, required: true },
    emailId: { type: String, default: null, index: true },
    status: { type: String, enum: ['queued', 'accepted', 'delivered', 'failed'], default: 'queued', index: true },
    reason: { type: String, default: null },
    expiresAt: { type: Date, default: null, index: { expires: 0 } },
  },
  { timestamps: true }
);

notificationJobRecipientSchema.index({ jobId: 1, emailNormalized: 1 }, { unique: true });
notificationJobRecipientSchema.index({ emailId: 1, emailNormalized: 1, status: 1 });

module.exports = mongoose.model('NotificationJobRecipient', notificationJobRecipientSchema);
