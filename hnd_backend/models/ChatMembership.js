const mongoose = require('mongoose');

const chatMembershipSchema = new mongoose.Schema(
  {
    room_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true, index: true },
    user_cand_id: { type: String, required: true, index: true },
    muted: { type: Boolean, default: false },
    left_at: { type: Date, default: null },
    last_read_at: { type: Date, default: null },
    last_active_at: { type: Date, default: null },
    role: { type: String, enum: ['member', 'owner'], default: 'member' },
  },
  { timestamps: true }
);

chatMembershipSchema.index({ room_id: 1, user_cand_id: 1 }, { unique: true });
chatMembershipSchema.index({ user_cand_id: 1, left_at: 1, room_id: 1 });
chatMembershipSchema.index({ room_id: 1, left_at: 1, last_active_at: -1 });

module.exports = mongoose.model('ChatMembership', chatMembershipSchema);
