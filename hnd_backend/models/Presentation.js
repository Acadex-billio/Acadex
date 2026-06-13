/**
 * Presentation Model
 */
const mongoose = require('mongoose');

const subscriptionAccessSchema = new mongoose.Schema(
  {
    basic_preview_pages: { type: Number, default: 1, min: 1 },
    paygo_preview_pages: { type: Number, default: 3, min: 1 },
    paygo_full_preview_price: { type: Number, default: 50, min: 0 },
    paygo_download_price: { type: Number, default: 150, min: 0 },
    paygo_access_minutes: { type: Number, default: 60, min: 1 },
  },
  { _id: false }
);

const presentationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    presenter_name: { type: String, required: true, trim: true },
    presenter_email: { type: String, required: true, trim: true },
    file_path: { type: String, required: true },
    program: { type: String, enum: ['HND', 'BTS'], default: 'HND', index: true },
    audience: { type: String, enum: ['GENERAL', 'SINGLE', 'MULTIPLE'], default: 'GENERAL' },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true }],
    report_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
    subscription_access: { type: subscriptionAccessSchema, default: () => ({}) },
  },
  { timestamps: true }
);

presentationSchema.index({ title: 'text' });
presentationSchema.index({ program: 1, createdAt: -1 });
presentationSchema.index({ report_id: 1 });
presentationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Presentation', presentationSchema);
