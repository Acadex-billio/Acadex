'use strict';

const mongoose = require('mongoose');

const lecturerBookingMessageSchema = new mongoose.Schema(
  {
    booking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'LecturerBooking', required: true, index: true },
    sender_cand_id: { type: String, required: true, index: true },
    sender_role: { type: String, enum: ['candidate', 'lecturer'], required: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

lecturerBookingMessageSchema.index({ booking_id: 1, createdAt: 1 });

module.exports = mongoose.model('LecturerBookingMessage', lecturerBookingMessageSchema);
