/**
 * QuestionPaper Model - uses embedded departments array
 */
const mongoose = require('mongoose');

const subscriptionAccessSchema = new mongoose.Schema(
  {
    basic_preview_pages: { type: Number, default: 1, min: 1 },
    paygo_preview_pages: { type: Number, default: 3, min: 1 },
    paygo_full_preview_price: { type: Number, default: 150, min: 0 },
    paygo_download_price: { type: Number, default: 150, min: 0 },
    paygo_access_minutes: { type: Number, default: 60, min: 1 },
  },
  { _id: false }
);

const questionPaperSchema = new mongoose.Schema(
  {
    course_title: { type: String, required: true, trim: true },
    hnd_year: { type: String, required: true, trim: true },
    paper_file: { type: String, required: true },
    uploaded_by: { type: String, required: true, trim: true },
    program: { type: String, enum: ['HND', 'BTS', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER'], default: 'HND', index: true },
    audience: { type: String, enum: ['GENERAL', 'SINGLE', 'MULTIPLE'], default: 'GENERAL' },
    more_info: { type: String, default: '' },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    subscription_access: { type: subscriptionAccessSchema, default: () => ({}) },
  },
  { timestamps: true }
);

questionPaperSchema.index({ course_title: 'text' });
questionPaperSchema.index({ program: 1, createdAt: -1 });
questionPaperSchema.index({ hnd_year: 1 });
questionPaperSchema.index({ departments: 1 });
questionPaperSchema.index({ createdAt: -1 });

module.exports = mongoose.model('QuestionPaper', questionPaperSchema);
