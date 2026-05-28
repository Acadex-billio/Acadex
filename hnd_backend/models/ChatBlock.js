const mongoose = require('mongoose');

const chatBlockSchema = new mongoose.Schema(
  {
    blocker_cand_id: { type: String, required: true, trim: true, index: true },
    blocked_cand_id: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true }
);

chatBlockSchema.index({ blocker_cand_id: 1, blocked_cand_id: 1 }, { unique: true });

module.exports = mongoose.model('ChatBlock', chatBlockSchema);
