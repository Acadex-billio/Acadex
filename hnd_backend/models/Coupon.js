const mongoose = require('mongoose');

const COUPON_APPLIES_TO = [
  'subscription',
  'material_access',
  'center_access',
  'tutorship_booking',
  'invite_access',
];

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    applies_to: {
      type: [String],
      enum: COUPON_APPLIES_TO,
      default: ['subscription'],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'applies_to must contain at least one scope',
      },
    },
    target_plans: {
      type: [String],
      enum: ['pro', 'paygo'],
      default: [],
    },
    outcome_type: {
      type: String,
      enum: ['amount_off', 'percent_off', 'free'],
      required: true,
      default: 'amount_off',
    },
    amount_off: { type: Number, default: 0, min: 0 },
    percent_off: { type: Number, default: 0, min: 0, max: 100 },
    starts_at: { type: Date, required: true, index: true },
    expires_at: { type: Date, required: true, index: true },
    is_published: { type: Boolean, default: false, index: true },
    is_deleted: { type: Boolean, default: false, index: true },
    cleanup_processed_at: { type: Date, default: null },
    created_by: { type: String, trim: true, default: null },
    updated_by: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

couponSchema.index({ is_published: 1, is_deleted: 1, starts_at: 1, expires_at: 1 });

module.exports = {
  Coupon: mongoose.model('Coupon', couponSchema),
  COUPON_APPLIES_TO,
};
