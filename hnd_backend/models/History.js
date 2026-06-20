/**
 * History Model - user activity logs
 */
const mongoose = require('mongoose');

const historySchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    content_ref: { type: String, default: null },
    user_name: { type: String, default: null },
    content_type: { type: String, required: true },
    content_title: { type: String, required: true },
    action: { type: String, required: true },
  },
  { timestamps: true }
);

historySchema.index({ user_id: 1 });
historySchema.index({ user_name: 1 });
historySchema.index({ action: 1 });
historySchema.index({ createdAt: -1 });
historySchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('History', historySchema);
