const mongoose = require('mongoose');

const paymentAccessGrantSchema = new mongoose.Schema(
  {
    user_cand_id: { type: String, required: true, trim: true, index: true },
    grant_code: { type: String, required: true, trim: true, index: true },
    resource_type: { type: String, enum: ['report', 'presentation', 'question_paper'], required: true, index: true },
    resource_id: { type: String, required: true, trim: true, index: true },
    transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'XAF', trim: true },
    status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active', index: true },
    granted_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

paymentAccessGrantSchema.index({ user_cand_id: 1, grant_code: 1, resource_id: 1, status: 1 });

module.exports = mongoose.model('PaymentAccessGrant', paymentAccessGrantSchema);