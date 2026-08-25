/**
 * User Model
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  USER_ROLES,
  ACCOUNT_STATUSES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  COMPLAINT_STATUSES,
  USER_PROGRAMS,
} = require('../constants/userConstants');

const SUBSCRIPTION_PLAN_VALUES = Object.values(SUBSCRIPTION_PLANS);
const SUBSCRIPTION_STATUS_VALUES = Object.values(SUBSCRIPTION_STATUSES);
const USER_ROLE_VALUES = Object.values(USER_ROLES);
const ACCOUNT_STATUS_VALUES = Object.values(ACCOUNT_STATUSES);
const COMPLAINT_STATUS_VALUES = Object.values(COMPLAINT_STATUSES);
const USER_PROGRAM_VALUES = Object.values(USER_PROGRAMS);

const subscriptionSchema = new mongoose.Schema(
  {
    plan: { type: String, enum: SUBSCRIPTION_PLAN_VALUES, default: SUBSCRIPTION_PLANS.BASIC },
    status: { type: String, enum: SUBSCRIPTION_STATUS_VALUES, default: SUBSCRIPTION_STATUSES.ACTIVE },
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
    organization: {
      name: { type: String, trim: true, default: null },
      contact_person: { type: String, trim: true, default: null },
      website: { type: String, trim: true, default: null },
      description: { type: String, trim: true, default: null },
    },
    partnership: {
      status: { type: String, enum: ['created', 'agreement_sent', 'agreement_accepted', 'payment_required', 'active', 'expired', 'suspended', 'terminated'], default: null },
      start_at: { type: Date, default: null },
      expires_at: { type: Date, default: null },
      amount_paid: { type: Number, min: 0, default: 0 },
      currency: { type: String, trim: true, default: 'XAF' },
      payment_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null },
      agreement: {
        version: { type: String, default: null },
        storage_key: { type: String, default: null },
        generated_at: { type: Date, default: null },
        accepted_at: { type: Date, default: null },
        accepted_by: { type: String, default: null },
      },
    },
    dpt_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: false, default: null },
    role: { type: String, enum: USER_ROLE_VALUES, default: USER_ROLES.CANDIDATE, index: true },
    program: { type: String, enum: USER_PROGRAM_VALUES, default: USER_PROGRAMS.HND, index: true },
    preferred_language: { type: String, enum: ['en', 'fr'], default: 'en' },
    academic_year: { type: String, default: null, trim: true },
    allow_emails: { type: Boolean, default: true },
    allow_push_notifications: { type: Boolean, default: true },
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
        plan: SUBSCRIPTION_PLANS.BASIC,
        status: SUBSCRIPTION_STATUSES.ACTIVE,
        activated_at: new Date(),
        expires_at: null,
        last_payment_at: null,
        phone_number: null,
        source_transaction_id: null,
      }),
    },

    account_status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: ACCOUNT_STATUSES.ACTIVE, index: true },
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
        status: { type: String, enum: COMPLAINT_STATUS_VALUES, default: COMPLAINT_STATUSES.PENDING },
        createdAt: { type: Date, default: Date.now },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: String, default: null, trim: true },
      },
    ],
    program_update_request: {
      status: { type: String, enum: ['none', 'pending', 'accepted', 'rejected'], default: 'none', index: true },
      source_program: { type: String, enum: USER_PROGRAM_VALUES, default: null },
      target_program: { type: String, enum: USER_PROGRAM_VALUES, default: null },
      message: { type: String, default: null, trim: true },
      requested_by: { type: String, default: null, trim: true },
      requested_at: { type: Date, default: null },
      responded_at: { type: Date, default: null },
    },
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
