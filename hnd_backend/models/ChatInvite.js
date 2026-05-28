const mongoose = require('mongoose');

const INVITE_STATUS = ['pending', 'accepted', 'rejected'];

const chatInviteSchema = new mongoose.Schema(
  {
    room_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true, index: true },
    from_cand_id: { type: String, required: true, trim: true, index: true },
    to_cand_id: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: INVITE_STATUS, default: 'pending', index: true },
    responded_at: { type: Date, default: null },
  },
  { timestamps: true }
);

chatInviteSchema.index(
  { room_id: 1, to_cand_id: 1, status: 1 },
  {
    unique: true,
    name: 'unique_pending_invite_per_room_user',
    partialFilterExpression: { status: 'pending' },
  }
);

module.exports = mongoose.model('ChatInvite', chatInviteSchema);
