const mongoose = require('mongoose');

const adDeliveryLogSchema = new mongoose.Schema(
  {
    ad_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true, index: true },
    user_key: { type: String, required: true, index: true },
    day_key: { type: String, required: true, index: true }, // UTC day: YYYY-MM-DD
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: true }
);

adDeliveryLogSchema.index({ ad_id: 1, user_key: 1, day_key: 1 }, { unique: true });

module.exports = mongoose.model('AdDeliveryLog', adDeliveryLogSchema);
