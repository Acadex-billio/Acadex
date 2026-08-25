const mongoose = require('mongoose');

const adPerformanceSchema = new mongoose.Schema(
  {
    ad_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true },
    // Manual overrides (optional) - these override the calculated analytics
    impressions: { type: Number, default: 0 },
    uniqueViewers: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    registrations: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    modalOpens: { type: Number, default: 0 },
    modalCloses: { type: Number, default: 0 },
    dismissCount: { type: Number, default: 0 },
    averageViewTimeSeconds: { type: Number, default: 0 },
    // Note: ctr and conversionRate are calculated, not stored
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
