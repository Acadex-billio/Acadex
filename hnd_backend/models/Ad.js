const mongoose = require('mongoose');

const adStylingSchema = new mongoose.Schema(
  {
    backgroundColor: { type: String, default: '#ffffff' },
    textColor: { type: String, default: '#1a1a1a' },
    titleColor: { type: String, default: '#1a1a1a' },
    subtitleColor: { type: String, default: '#575757' },
    bodyColor: { type: String, default: '#333333' },
    tagBackgroundColor: { type: String, default: 'rgba(0,0,0,0.08)' },
    tagTextColor: { type: String, default: '#111111' },
    buttonColor: { type: String, default: '#4caf50' },
    buttonTextColor: { type: String, default: '#ffffff' },
    buttonBorderColor: { type: String, default: 'transparent' },
    buttonBorderRadius: { type: String, default: '999px' },
    buttonBorderWidth: { type: String, default: '0px' },
    // Secondary CTA styles
    secondaryButtonColor: { type: String, default: 'transparent' },
    secondaryButtonTextColor: { type: String, default: '#4caf50' },
    secondaryButtonBorderColor: { type: String, default: '#4caf50' },
    secondaryButtonBorderRadius: { type: String, default: '999px' },
    secondaryButtonBorderWidth: { type: String, default: '0px' },
    overlayColor: { type: String, default: 'rgba(0,0,0,0.55)' },
    borderRadius: { type: String, default: '16px' },
    borderColor: { type: String, default: 'transparent' },
    imagePosition: { type: String, enum: ['top', 'left', 'right', 'background', 'none'], default: 'top' },
  },
  { _id: false }
);

const adSchema = new mongoose.Schema(
  {
    // Identity
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subtitle: { type: String, trim: true, maxlength: 200, default: '' },
    body: { type: String, trim: true, maxlength: 1000, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
    logoUrl: { type: String, trim: true, default: '' },
    tag: { type: String, trim: true, maxlength: 40, default: '' }, // e.g. "NEW", "PROMO"

    // CTA
    ctaText: { type: String, trim: true, maxlength: 60, default: '' },
    ctaUrl: { type: String, trim: true, default: '' },
    ctaSecondaryText: { type: String, trim: true, maxlength: 60, default: '' },
    ctaSecondaryUrl: { type: String, trim: true, default: '' },

    // Audience targeting
    targetAudience: {
      type: [String],
      enum: ['candidate_hnd', 'candidate_bts', 'candidate_all', 'first_time_candidate', 'lecturer', 'admin', 'developer', 'all'],
      default: ['all'],
    },

    // Display behavior
    displayType: { type: String, enum: ['modal', 'banner_top', 'banner_bottom'], default: 'modal' },
    showCloseButton: { type: Boolean, default: true },
    closeOnTimer: { type: Boolean, default: false },
    closeTimerSeconds: { type: Number, default: 8, min: 1, max: 120 },
    intervalSeconds: { type: Number, default: 3600, min: 0 },
    dailyCapPerUser: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    priority: { type: Number, default: 0 },

    // Route targeting
    displayScope: { type: String, enum: ['global', 'specific_routes'], default: 'global' },
    specificRoutes: { type: [String], default: [] },

    // Scheduling
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    // Styling
    styling: { type: adStylingSchema, default: () => ({}) },

    // Status
    isPublished: { type: Boolean, default: false, index: true },
    created_by: { type: String, trim: true, default: null },

    // Advertiser & Campaign Info
    advertiserName: { type: String, trim: true, default: '' },
    advertiserLogoUrl: { type: String, trim: true, default: '' },
    campaignType: { type: String, trim: true, default: '' },

    // Analytics
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
  },
  { timestamps: true }
);

adSchema.index({ isPublished: 1, targetAudience: 1 });
adSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Ad', adSchema);
