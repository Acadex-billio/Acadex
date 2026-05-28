'use strict';

const mongoose = require('mongoose');

const bookingInviteSchema = new mongoose.Schema(
  {
    invitee_cand_id: { type: String, required: true, trim: true, index: true },
    invited_by_cand_id: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
    payment_status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending', index: true },
    payment_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null },
    invited_at: { type: Date, default: Date.now },
    responded_at: { type: Date, default: null },
    joined_at: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const lecturerBookingSchema = new mongoose.Schema(
  {
    candidate_cand_id: { type: String, required: true, index: true },
    lecturer_cand_id: { type: String, required: true, index: true },
    topic: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
    booking_type: { type: String, enum: ['tutorship', 'video_conference'], default: 'tutorship' },
    session_mode: { type: String, enum: ['video', 'chat'], default: 'video' },
    scheduled_for: { type: Date, required: true, index: true },
    duration_minutes: { type: Number, default: 60, min: 15 },
    amount_total: { type: Number, required: true, min: 0 },
    platform_share: { type: Number, required: true, min: 0 },
    lecturer_share: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'XAF', trim: true },
    status: {
      type: String,
      enum: ['requested', 'accepted', 'scheduled', 'completed', 'cancelled', 'rejected'],
      default: 'requested',
      index: true,
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    contract_sealed: { type: Boolean, default: false, index: true },
    contract_sealed_at: { type: Date, default: null },
    payment_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null },
    meeting_link: { type: String, default: '', trim: true },
    conference_room_code: { type: String, default: null, trim: true, index: true },
    conference_started_at: { type: Date, default: null, index: true },
    conference_started_by: { type: String, default: null, trim: true },
    conference_ended_at: { type: Date, default: null },
    invited_candidates: { type: [bookingInviteSchema], default: [] },
    paid_out: { type: Boolean, default: false, index: true },
    paid_out_at: { type: Date, default: null },
    paid_out_by: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

lecturerBookingSchema.index({ lecturer_cand_id: 1, payment_status: 1, status: 1, createdAt: -1 });
lecturerBookingSchema.index({ candidate_cand_id: 1, createdAt: -1 });
lecturerBookingSchema.index({ 'invited_candidates.invitee_cand_id': 1, createdAt: -1 });
lecturerBookingSchema.index({ conference_room_code: 1, conference_started_at: -1 });
lecturerBookingSchema.index({ status: 1, scheduled_for: 1, lecturer_cand_id: 1 });

module.exports = mongoose.model('LecturerBooking', lecturerBookingSchema);
