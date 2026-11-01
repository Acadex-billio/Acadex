'use strict';

const mongoose = require('mongoose');

const chatVideoCallSchema = new mongoose.Schema(
  {
    room_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true, index: true },
    livekit_room_name: { type: String, required: true, unique: true, trim: true },
    started_by: { type: String, required: true, trim: true, index: true },
    started_at: { type: Date, default: Date.now, required: true },
    dismissed_by: { type: [String], default: [] },
    ended_at: { type: Date, default: null },
    ended_by: { type: String, default: null, trim: true },
    cleanup_completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

chatVideoCallSchema.index(
  { room_id: 1 },
  {
    unique: true,
    name: 'one_active_video_call_per_chat',
    partialFilterExpression: { ended_at: null },
  }
);
chatVideoCallSchema.index({ cleanup_completed_at: 1, started_at: 1 });

module.exports = mongoose.model('ChatVideoCall', chatVideoCallSchema);
