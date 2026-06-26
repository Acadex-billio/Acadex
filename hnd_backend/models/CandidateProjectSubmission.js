const mongoose = require('mongoose');
const { USER_PROGRAMS } = require('../constants/userConstants');

const programValues = Object.values(USER_PROGRAMS);
const targetProgramValues = ['BACHELOR', 'MASTERS', 'LICENCE', 'MASTER', 'BTS'];

const candidateProjectSubmissionSchema = new mongoose.Schema(
  {
    uploader_cand_id: { type: String, required: true, index: true, trim: true },
    uploader_name: { type: String, trim: true, default: null },
    uploader_email: { type: String, trim: true, default: null },
    uploader_program: { type: String, enum: programValues, default: USER_PROGRAMS.HND, index: true },
    target_program: { type: String, enum: targetProgramValues, default: 'BACHELOR', index: true },
    submission_type: { type: String, enum: ['report', 'presentation'], required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    file_path: { type: String, required: true, trim: true },
    file_name: { type: String, required: true, trim: true },
    file_type: { type: String, required: true, trim: true },
    upload_fee: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'published', 'rejected', 'permission_requested', 'permission_granted', 'draft'],
      default: 'pending_review',
      index: true,
    },
    visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true },
    review_note: { type: String, trim: true, default: null },
    publish_note: { type: String, trim: true, default: null },
    permission_message: { type: String, trim: true, default: null },
    permission_status: { type: String, enum: ['none', 'requested', 'approved', 'rejected'], default: 'none', index: true },
    reviewed_by: { type: String, trim: true, default: null },
    reviewed_at: { type: Date, default: null },
    published_at: { type: Date, default: null },
    published_resource_id: { type: String, default: null, trim: true },
    published_resource_type: { type: String, enum: ['report', 'presentation', null], default: null },
  },
  { timestamps: true }
);

candidateProjectSubmissionSchema.index({ uploader_cand_id: 1, submission_type: 1, status: 1 });

module.exports = mongoose.model('CandidateProjectSubmission', candidateProjectSubmissionSchema);
