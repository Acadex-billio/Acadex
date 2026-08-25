const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema(
  {
    user_cand_id: { type: String, required: true, trim: true, index: true },
    provider: { type: String, default: 'momo', trim: true },
    provider_mode: { type: String, enum: ['mock', 'sandbox', 'production'], default: 'mock', index: true },
    purpose_type: { type: String, enum: ['subscription', 'material_access', 'center_access', 'tutorship_booking', 'concours_partnership'], required: true, index: true },
    purpose_code: { type: String, required: true, trim: true, index: true },
    resource_type: { type: String, enum: ['subscription', 'report', 'presentation', 'question_paper', 'chat_room', 'chat_invite', 'lecturer_booking', 'concours_partnership'], default: 'subscription', index: true },
    resource_id: { type: String, default: null, trim: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'XAF', trim: true },
    phone_number: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    idempotency_key: { type: String, default: null, trim: true, index: true },
    external_reference: { type: String, required: true, unique: true, trim: true },
    provider_reference: { type: String, default: null, trim: true, index: true },
    external_id: { type: String, default: null, trim: true },
    status: { type: String, enum: ['pending', 'successful', 'failed', 'cancelled', 'expired'], default: 'pending', index: true },
    provider_response: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    initiated_at: { type: Date, default: Date.now },
    completed_at: { type: Date, default: null },
    expires_at: { type: Date, default: null, index: true },
    authorization_consumed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ user_cand_id: 1, status: 1, createdAt: -1 });
paymentTransactionSchema.index({ purpose_code: 1, resource_id: 1, status: 1 });
paymentTransactionSchema.index({ provider_reference: 1, status: 1 });
paymentTransactionSchema.index({ resource_type: 1, resource_id: 1, createdAt: -1 });
paymentTransactionSchema.index({ user_cand_id: 1, idempotency_key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);