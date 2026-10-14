const mongoose = require('mongoose');

const referralLedgerSchema = new mongoose.Schema(
  {
    idempotency_key: { type: String, required: true, unique: true },
    candidate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referred_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null },
    redemption_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralRedemption', default: null },
    rule_code: { type: String, default: null, trim: true },
    entry_type: { type: String, enum: ['award', 'redemption', 'refund'], required: true },
    points: { type: Number, min: 1, required: true },
    description: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

referralLedgerSchema.index({ candidate_id: 1, createdAt: -1 });

module.exports = mongoose.model('ReferralLedger', referralLedgerSchema);
