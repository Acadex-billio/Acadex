const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    room_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true, index: true },
    sender_cand_id: { type: String, required: true, index: true },
    text: { type: String, default: '', trim: true, maxlength: 3000 },
    mentions: [{ type: String, trim: true }],
    attachment_url: { type: String, default: null, trim: true },
    attachment_name: { type: String, default: null, trim: true },
    attachment_mime: { type: String, default: null, trim: true },
    attachment_size: { type: Number, default: null },
    reply_to_message_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null, index: true },
    reactions: [
      {
        emoji: { type: String, required: true },
        users: [{ type: String, required: true }],
      },
    ],
    deleted_at: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

chatMessageSchema.index({ room_id: 1, createdAt: -1 });
chatMessageSchema.index({ room_id: 1, deleted_at: 1, createdAt: -1 });
chatMessageSchema.index({ room_id: 1, _id: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
