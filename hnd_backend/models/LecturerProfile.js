'use strict';

const mongoose = require('mongoose');

const documentReviewSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    note: { type: String, default: '', trim: true },
    reviewed_by: { type: String, default: null, trim: true },
    reviewed_at: { type: Date, default: null },
  },
  { _id: false }
);

const lecturerProfileSchema = new mongoose.Schema(
  {
    lecturer_cand_id: { type: String, required: true, unique: true, index: true },
    headline: { type: String, default: '', trim: true },
    bio: { type: String, default: '', trim: true },
    qualifications: [{ type: String, trim: true }],
    years_experience: { type: Number, default: 0, min: 0 },
    specialization_tags: [{ type: String, trim: true }],
    hourly_rate: { type: Number, default: 5000, min: 0 },
    currency: { type: String, default: 'XAF', trim: true },
    availability_notes: { type: String, default: '', trim: true },
    accepts_video_sessions: { type: Boolean, default: true },
    accepts_chat_tutorship: { type: Boolean, default: true },
    evidence_links: [{ type: String, trim: true }],
    // Identity & verification fields
    full_name: { type: String, default: '', trim: true },
    id_card_number: { type: String, default: '', trim: true },
    region: { type: String, default: '', trim: true },
    highest_qualification: { type: String, default: '', trim: true },
    id_card_front_url: { type: String, default: '', trim: true },
    id_card_front_key: { type: String, default: '', trim: true },
    id_card_back_url: { type: String, default: '', trim: true },
    id_card_back_key: { type: String, default: '', trim: true },
    certificate_scan_url: { type: String, default: '', trim: true },
    certificate_scan_key: { type: String, default: '', trim: true },
    doc_review: {
      id_card_front: { type: documentReviewSchema, default: () => ({ status: 'pending', note: '' }) },
      id_card_back: { type: documentReviewSchema, default: () => ({ status: 'pending', note: '' }) },
      certificate_scan: { type: documentReviewSchema, default: () => ({ status: 'pending', note: '' }) },
    },
    approval_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    approval_note: { type: String, default: '', trim: true },
    approved_by: { type: String, default: null, trim: true },
    approved_at: { type: Date, default: null },
    profile_completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LecturerProfile', lecturerProfileSchema);
