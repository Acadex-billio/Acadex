const mongoose = require('mongoose');

const referralRuleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    trigger: { type: String, enum: ['registration', 'first_purchase', 'each_purchase'], required: true },
    purchase_type: {
      type: String,
      enum: ['subscription', 'material_access', 'center_access', 'tutorship_booking', 'concours_partnership'],
      default: null,
    },
    referrer_points: { type: Number, min: 0, default: 0 },
    referred_points: { type: Number, min: 0, default: 0 },
    is_active: { type: Boolean, default: true },
  },
  { _id: false }
);

const referralBenefitSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    mode: { type: String, enum: ['automatic', 'redeem'], required: true },
    points_required: { type: Number, required: true, min: 1 },
    reward_type: { type: String, enum: ['benefit', 'material_access', 'apparel_gift'], default: 'benefit' },
    apparel_type: { type: String, enum: ['t_shirt', 'shirt'], default: null },
    image_url: { type: String, default: null, trim: true, maxlength: 2000 },
    material_type: { type: String, enum: ['question_paper', 'report', 'presentation'], default: null },
    material_id: { type: String, default: null, trim: true },
    material_title: { type: String, default: null, trim: true, maxlength: 300 },
    access_type: { type: String, enum: ['preview', 'download'], default: 'download' },
    is_active: { type: Boolean, default: true },
  },
  { _id: false }
);

const referralProgramSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    is_active: { type: Boolean, default: false },
    title: { type: String, default: 'Acadex Referral Program', trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    rules: { type: [referralRuleSchema], default: [] },
    benefits: { type: [referralBenefitSchema], default: [] },
    updated_by: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReferralProgram', referralProgramSchema);
