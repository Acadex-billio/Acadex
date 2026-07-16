const mongoose = require('mongoose');

const moneyValueSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'XAF', trim: true },
  },
  { _id: false }
);

const planSchema = new mongoose.Schema(
  {
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'XAF', trim: true },
    duration_days: { type: Number, default: 90, min: 1 },
  },
  { _id: false }
);

const paygoMaterialSchema = new mongoose.Schema(
  {
    basic_preview_pages: { type: Number, default: 1, min: 1 },
    paygo_preview_pages: { type: Number, default: 3, min: 1 },
    full_package_preview_limit: { type: Number, default: 10, min: 0 },
    full_package_download_limit: { type: Number, default: 5, min: 0 },
    basic_full_preview_price: { type: Number, default: 0, min: 0 },
    basic_download_price: { type: Number, default: 0, min: 0 },
    paygo_full_preview_price: { type: Number, default: 0, min: 0 },
    paygo_download_price: { type: Number, default: 0, min: 0 },
    paygo_access_minutes: { type: Number, default: 60, min: 1 },
  },
  { _id: false }
);

const centerByPlanSchema = new mongoose.Schema(
  {
    basic: { type: moneyValueSchema, default: () => ({}) },
    pro: { type: moneyValueSchema, default: () => ({}) },
    paygo: { type: moneyValueSchema, default: () => ({}) },
  },
  { _id: false }
);

const platformPricingSchema = new mongoose.Schema(
  {
    singleton_key: { type: String, required: true, unique: true, default: 'global' },
    plans: {
      basic: { type: planSchema, default: () => ({ price: 0, currency: 'XAF', duration_days: 3650 }) },
      pro: { type: planSchema, default: () => ({ price: 0, currency: 'XAF', duration_days: 90 }) },
      paygo: { type: planSchema, default: () => ({ price: 0, currency: 'XAF', duration_days: 90 }) },
      'full-package': { type: planSchema, default: () => ({ price: 0, currency: 'XAF', duration_days: 90 }) },
    },
    materials: {
      report: { type: paygoMaterialSchema, default: () => ({}) },
      presentation: { type: paygoMaterialSchema, default: () => ({}) },
      question_paper: { type: paygoMaterialSchema, default: () => ({}) },
    },
    center: {
      create: { type: centerByPlanSchema, default: () => ({}) },
      join: { type: centerByPlanSchema, default: () => ({}) },
    },
    ai_study_mode: {
      session_price: { type: Number, default: 0, min: 0 },
      currency: { type: String, default: 'XAF', trim: true },
    },
    candidate_project_upload: {
      HND: { type: Number, default: 0, min: 0 },
      BACHELOR: { type: Number, default: 0, min: 0 },
      MASTERS: { type: Number, default: 0, min: 0 },
      LICENCE: { type: Number, default: 0, min: 0 },
      MASTER: { type: Number, default: 0, min: 0 },
      BTS: { type: Number, default: 0, min: 0 },
    },
    published_at: { type: Date, default: null },
    updated_by: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformPricing', platformPricingSchema);
