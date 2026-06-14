const mongoose = require('mongoose');

const adEventLogSchema = new mongoose.Schema(
  {
    ad_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true, index: true },
    user_key: { type: String, required: true, index: true }, // role:uid
    event_type: {
      type: String,
      enum: ['impression', 'click', 'modal_open', 'modal_close', 'dismiss', 'link_click', 'registration'],
      required: true,
      index: true,
    },
    day_key: { type: String, required: true, index: true }, // YYYY-MM-DD
    hour_key: { type: Number, min: 0, max: 23 }, // 0-23 for peak hours analysis
    duration_seconds: { type: Number, default: 0 }, // for modal view time
    link_destination: { type: String, default: null }, // for link clicks
    source_route: { type: String, default: null }, // which route the ad was on
    user_agent: { type: String, default: null }, // for device tracking if needed
    ip_hash: { type: String, default: null }, // anonymized IP
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // flexible for future data
  },
  { timestamps: true }
);

// Indexes for efficient querying
adEventLogSchema.index({ ad_id: 1, day_key: 1, event_type: 1 });
adEventLogSchema.index({ ad_id: 1, user_key: 1 });
adEventLogSchema.index({ ad_id: 1, hour_key: 1 });
adEventLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

module.exports = mongoose.model('AdEventLog', adEventLogSchema);
