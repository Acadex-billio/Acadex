const mongoose = require('mongoose');

const candidatePurchaseSchema = new mongoose.Schema(
  {
    candidate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    candidate_name: { type: String, required: true, trim: true },
    candidate_email: { type: String, required: true, trim: true },
    plan: { type: String, default: null },
    item_type: { type: String, enum: ['paper', 'report', 'presentation', 'center', 'ai_mode', 'plan'], required: true },
    item_id: { type: String, default: null },
    item_title: { type: String, default: null },
    year: { type: String, default: null },
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'XAF' },
    paid_at: { type: Date, default: Date.now },
    expires_at: { type: Date, default: null },
    status: { type: String, enum: ['grant-success', 'grant-failed', 'grant-expired', 'pending'], default: 'pending' },
    provider_reference: { type: String, default: null, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

candidatePurchaseSchema.index({ candidate_id: 1, item_type: 1, item_id: 1 });
candidatePurchaseSchema.index({ expires_at: 1 });

module.exports = mongoose.model('CandidatePurchase', candidatePurchaseSchema);
