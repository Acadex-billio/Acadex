const mongoose = require('mongoose');

const referralRedemptionSchema = new mongoose.Schema(
  {
    candidate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    benefit_code: { type: String, required: true, trim: true },
    benefit_name: { type: String, required: true, trim: true },
    points_spent: { type: Number, min: 1, required: true },
    status: { type: String, enum: ['pending', 'fulfilled', 'rejected'], default: 'pending', index: true },
    reviewed_by: { type: String, default: null, trim: true },
    reviewed_at: { type: Date, default: null },
    review_note: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

referralRedemptionSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('ReferralRedemption', referralRedemptionSchema);
