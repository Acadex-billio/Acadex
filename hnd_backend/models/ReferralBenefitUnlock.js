const mongoose = require('mongoose');

const referralBenefitUnlockSchema = new mongoose.Schema(
  {
    candidate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    benefit_code: { type: String, required: true, trim: true },
    benefit_name: { type: String, required: true, trim: true },
    reward_type: { type: String, enum: ['benefit', 'material_access', 'apparel_gift'], default: 'benefit' },
    apparel_type: { type: String, enum: ['t_shirt', 'shirt'], default: null },
    gift_number: { type: Number, min: 1, default: null },
    points_required: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['unlocked', 'grant_pending', 'granted', 'grant_failed'], default: 'unlocked' },
    granted_at: { type: Date, default: null },
    grant_error: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true }
);

referralBenefitUnlockSchema.index({ candidate_id: 1, benefit_code: 1 }, { unique: true });

module.exports = mongoose.model('ReferralBenefitUnlock', referralBenefitUnlockSchema);
