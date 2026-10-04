/**
 * Presentation Model
 */
const mongoose = require('mongoose');

const presentationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    presenter_name: { type: String, required: true, trim: true },
    presenter_email: { type: String, required: true, trim: true },
    file_path: { type: String, required: true },
    academic_session: { type: String, trim: true, default: null },
    content_hash: { type: String, trim: true, default: null, index: true },
    duplicate_key: { type: String, trim: true, default: null, index: true },
    location: { type: String, trim: true, default: null },
    pages: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    program: { type: String, enum: ['HND', 'BTS', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER'], default: 'HND', index: true },
    audience: { type: String, enum: ['GENERAL', 'SINGLE', 'MULTIPLE'], default: 'GENERAL' },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true }],
    report_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
    project_github_url: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

presentationSchema.index({ title: 'text' });
presentationSchema.index({ program: 1, createdAt: -1 });
presentationSchema.index({ report_id: 1 });
presentationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Presentation', presentationSchema);
