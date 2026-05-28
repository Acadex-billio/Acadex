/**
 * User Model
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SUBSCRIPTION_PLANS = ['basic', 'pro', 'paygo'];

const subscriptionSchema = new mongoose.Schema(
  {
    plan: { type: String, enum: SUBSCRIPTION_PLANS, default: 'basic' },
    status: { type: String, enum: ['active', 'expired'], default: 'active' },
    activated_at: { type: Date, default: Date.now },
    expires_at: { type: Date, default: null },
    last_payment_at: { type: Date, default: null },
    phone_number: { type: String, default: null, trim: true },
    source_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    cand_id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },
    address: { type: String, trim: true },
    profile_picture: { type: String, default: null },
    dpt_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: false, default: null },
    role: { type: String, enum: ['candidate', 'lecturer', 'admin', 'developer', 'superadmin'], default: 'candidate', index: true },
    program: { type: String, enum: ['HND', 'BTS', 'LECTURER'], default: 'HND', index: true },
    preferred_language: { type: String, enum: ['en', 'fr'], default: 'en' },
    academic_year: { type: String, default: null, trim: true },
    allow_emails: { type: Boolean, default: true },
    allow_push_notifications: { type: Boolean, default: false },
    allow_toast_sound: { type: Boolean, default: true },
    login_count: { type: Number, default: 0 },
    first_login_at: { type: Date, default: null },
    last_login_at: { type: Date, default: null },
    push_subscription: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    push_subscription_updated_at: { type: Date, default: null },
    subscription: {
      type: subscriptionSchema,
      default: () => ({
        plan: 'basic',
        status: 'active',
        activated_at: new Date(),
        expires_at: null,
        last_payment_at: null,
        phone_number: null,
        source_transaction_id: null,
      }),
    },

    account_status: { type: String, enum: ['active', 'pending_approval', 'suspended', 'blocked'], default: 'active', index: true },
    suspension: {
      start_at: { type: Date, default: null },
      end_at: { type: Date, default: null },
      reason: { type: String, default: null, trim: true },
      set_by: { type: String, default: null, trim: true },
      set_at: { type: Date, default: null },
    },
    block: {
      reason: { type: String, default: null, trim: true },
      set_by: { type: String, default: null, trim: true },
      set_at: { type: Date, default: null },
    },
    complaints: [
      {
        text: { type: String, required: true, trim: true },
        status: { type: String, enum: ['pending', 'reviewed'], default: 'pending' },
        createdAt: { type: Date, default: Date.now },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: String, default: null, trim: true },
      },
    ],
  },
  { timestamps: true }
);

userSchema.index({ dpt_id: 1 });
userSchema.index({ role: 1, account_status: 1 });
userSchema.index({ program: 1, role: 1 });
userSchema.index({ 'subscription.plan': 1, 'subscription.expires_at': 1 });
userSchema.index({ 'suspension.end_at': 1 });
userSchema.index({ createdAt: -1 });

// Compound index for admin candidate listing
userSchema.index({ role: 1, name: 1, account_status: 1 });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

module.exports = mongoose.model('User', userSchema);
