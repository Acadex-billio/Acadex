const mongoose = require('mongoose');

const adPerformanceSchema = new mongoose.Schema(
  {
    ad_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true, index: true },
    // Manual overrides (optional)
    impressions: { type: Number, default: null },
    uniqueViewers: { type: Number, default: null },
    clicks: { type: Number, default: null },
    registrations: { type: Number, default: null },
    amountPaid: { type: Number, default: null },
    modalOpens: { type: Number, default: null },
    modalCloses: { type: Number, default: null },
    dismissCount: { type: Number, default: null },
    averageViewTimeSeconds: { type: Number, default: null },
    peakHours: { type: String, default: '' },
    linkAnalyticsNotes: { type: String, default: '' },
    destinationTrackingNotes: { type: String, default: '' },
    weeklyReport: { type: String, default: '' },
    monthlyReport: { type: String, default: '' },
    durationReport: { type: String, default: '' },
    recommendation: { type: String, default: '' },
    notes: { type: String, default: '' },
    updated_by: { type: String, default: null },
  },
  { timestamps: true }
);

adPerformanceSchema.index({ ad_id: 1 }, { unique: true });

module.exports = mongoose.model('AdPerformance', adPerformanceSchema);
