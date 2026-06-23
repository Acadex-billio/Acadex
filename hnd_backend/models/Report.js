/**
 * Report Model - uses embedded departments array
 */
const mongoose = require('mongoose');

const subscriptionAccessSchema = new mongoose.Schema(
  {
    basic_preview_pages: { type: Number, default: 1, min: 1 },
    paygo_preview_pages: { type: Number, default: 3, min: 1 },
    paygo_full_preview_price: { type: Number, default: 150, min: 0 },
    paygo_download_price: { type: Number, default: 200, min: 0 },
    paygo_access_minutes: { type: Number, default: 60, min: 1 },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    writer_names: { type: String, required: true, trim: true },
    writer_email: { type: String, required: true, trim: true },
    keywords: { type: String, trim: true },
    description: { type: String, trim: true },
    location: { type: String, trim: true },
    pages: { type: String, trim: true },
    file_path: { type: String, required: true },
    program: { type: String, enum: ['HND', 'BTS'], default: 'HND', index: true },
    audience: { type: String, enum: ['GENERAL', 'SINGLE', 'MULTIPLE'], default: 'GENERAL' },
    notify_candidates: { type: Boolean, default: false },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    material_price: { type: Number, default: null, min: 0 },
    project_github_url: { type: String, trim: true, default: null },
    subscription_access: { type: subscriptionAccessSchema, default: () => ({}) },
  },
  { timestamps: true }
);

reportSchema.index({ title: 'text' });
reportSchema.index({ program: 1, createdAt: -1 });
reportSchema.index({ departments: 1 });
reportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
