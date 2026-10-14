const mongoose = require('mongoose');

const referralGiftCounterSchema = new mongoose.Schema(
  {
    candidate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    gift_count: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReferralGiftCounter', referralGiftCounterSchema);
