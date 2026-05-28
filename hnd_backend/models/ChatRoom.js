const mongoose = require('mongoose');

const CHAT_ROOM_TYPES = ['general', 'department', 'center', 'dm', 'admin'];

const chatRoomSchema = new mongoose.Schema(
  {
    type: { type: String, enum: CHAT_ROOM_TYPES, required: true, index: true },
    program: { type: String, enum: ['HND', 'BTS'], default: 'HND', index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    dpt_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    created_by: { type: String, default: null, index: true },
    invite_code: { type: String },
    dm_key: { type: String },
  },
  { timestamps: true }
);

chatRoomSchema.index(
  { invite_code: 1 },
  {
    unique: true,
    name: 'invite_code_unique_partial',
    partialFilterExpression: { invite_code: { $type: 'string' } },
  }
);

chatRoomSchema.index(
  { dm_key: 1 },
  {
    unique: true,
    name: 'dm_key_unique_partial',
    partialFilterExpression: { dm_key: { $type: 'string' } },
  }
);

chatRoomSchema.index({ type: 1, program: 1, dpt_id: 1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema);
