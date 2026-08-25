const mongoose = require('mongoose');

const concoursAuditLogSchema = new mongoose.Schema({
  event: { type: String, required: true, trim: true, index: true },
  actorId: { type: String, required: true, trim: true, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConcoursApplication', default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

concoursAuditLogSchema.index({ partnerId: 1, createdAt: -1 });
module.exports = mongoose.model('ConcoursAuditLog', concoursAuditLogSchema);
