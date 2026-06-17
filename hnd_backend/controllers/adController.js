const Ad = require('../models/Ad');
const AdDeliveryLog = require('../models/AdDeliveryLog');
const AdEventLog = require('../models/AdEventLog');
const User = require('../models/User');
const AdPerformance = require('../models/AdPerformance');
const { uploadFile } = require('../utils/s3Uploader');
const { getAdAnalytics, logAdEvent } = require('../services/adAnalyticsService');
const fs = require('fs');
const path = require('path');

/* ───── helpers ───── */
const safeNum = (val, fallback) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => { if (k in obj) out[k] = obj[k]; });
  return out;
};

const STYLE_FIELDS = [
  'backgroundColor', 'textColor', 'titleColor', 'subtitleColor', 'bodyColor',
  'tagBackgroundColor', 'tagTextColor', 'buttonColor', 'buttonTextColor',
  'buttonBorderColor', 'buttonBorderRadius', 'buttonBorderWidth',
  // secondary CTA styles
  'secondaryButtonColor', 'secondaryButtonTextColor', 'secondaryButtonBorderColor', 'secondaryButtonBorderRadius', 'secondaryButtonBorderWidth',
  'overlayColor', 'borderRadius', 'borderColor', 'imagePosition',
];

const getUtcDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const getUserKey = (req) => {
  // Require authenticated user for ad tracking. All ad tracking routes are behind `requireAuth`.
  const user = req.user;
  if (!user) return null;
  const role = String(user.role || 'user').toLowerCase();
  const uid = user.id || user._id || user.cand_id || user.email || null;
  if (!uid) return `${role}:unknown`;
  return `${role}:${String(uid)}`;
};

/* ───── GET /api/ads  (developer only – all ads) ───── */
exports.listAll = async (req, res) => {
  try {
    const ads = await Ad.find({}).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, ads });
  } catch (err) {
    console.error('[AdController] listAll:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───── POST /api/ads/upload-logo  (developer only) ───── */
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No logo file uploaded' });
    }

    const upload = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'ads/logo'
    );

    return res.status(201).json({
      success: true,
      logoUrl: upload.url,
      key: upload.key,
      originalname: req.file.originalname,
    });
  } catch (err) {
    console.error('[AdController] uploadLogo:', err);
    // If S3 is not configured in this environment, fall back to saving locally
    try {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('s3 configuration') || msg.includes('aws s3 configuration') || msg.includes('bucket')) {
        const uploadsDir = path.join(__dirname, '..', 'uploads', 'ads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const dest = path.join(uploadsDir, safeName);
        fs.writeFileSync(dest, req.file.buffer);
        const url = `${req.protocol}://${req.get('host')}/uploads/ads/${safeName}`;
        return res.status(201).json({ success: true, logoUrl: url, key: `uploads/ads/${safeName}`, originalname: req.file.originalname });
      }
    } catch (fallbackErr) {
      console.error('[AdController] uploadLogo fallback failed:', fallbackErr);
    }
    return res.status(500).json({ success: false, message: err?.message || 'Failed to upload logo' });
  }
};

/* ───── GET /api/ads/active  (authenticated – filtered by role/program/route) ───── */
exports.listActive = async (req, res) => {
  try {
    const user = req.user;
    const now = new Date();
    const userKey = getUserKey(req);
    const dayKey = getUtcDayKey(now);

    // Build audience tags that apply to this user
    const role = String(user?.role || '').toLowerCase();
    const program = String(user?.program || '').toUpperCase(); // HND | BTS
    const applicableTags = ['all'];

    if (role === 'candidate' || role === 'student') {
      applicableTags.push('candidate_all');
      if (program === 'HND') applicableTags.push('candidate_hnd');
      if (program === 'BTS') applicableTags.push('candidate_bts');

      const candId = String(user?.cand_id || '').trim();
      if (candId) {
        const candidate = await User.findOne({ cand_id: candId }).select('login_count').lean();
        if (Number(candidate?.login_count || 0) === 1) {
          applicableTags.push('first_time_candidate');
        }
      }
    }
    if (role === 'lecturer') applicableTags.push('lecturer');
    if (role === 'admin' || role === 'superadmin') applicableTags.push('admin');
    if (role === 'developer') applicableTags.push('developer');

    const ads = await Ad.find({
      isPublished: true,
      targetAudience: { $in: applicableTags },
      $or: [
        { startDate: null },
        { startDate: { $lte: now } },
      ],
      $and: [
        {
          $or: [
            { endDate: null },
            { endDate: { $gte: now } },
          ],
        },
      ],
    })
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    if (!ads.length) {
      return res.json({ success: true, ads: [] });
    }

    const cappedAdIds = ads
      .filter((ad) => Number(ad.dailyCapPerUser || 0) > 0)
      .map((ad) => String(ad._id));
    const firstTimeAdIds = ads
      .filter((ad) => Array.isArray(ad.targetAudience) && ad.targetAudience.includes('first_time_candidate'))
      .map((ad) => String(ad._id));

    let impressionsByAdId = new Map();
    if (cappedAdIds.length > 0) {
      const logs = await AdDeliveryLog.find({
        user_key: userKey,
        day_key: dayKey,
        ad_id: { $in: cappedAdIds },
      }).lean();

      impressionsByAdId = new Map(logs.map((log) => [String(log.ad_id), Number(log.impressions || 0)]));
    }

    let firstTimeSeenAdIds = new Set();
    if (firstTimeAdIds.length > 0) {
      const firstTimeLogs = await AdDeliveryLog.find({
        user_key: userKey,
        ad_id: { $in: firstTimeAdIds },
      })
        .select('ad_id')
        .lean();
      firstTimeSeenAdIds = new Set(firstTimeLogs.map((log) => String(log.ad_id)));
    }

    const filteredAds = ads.filter((ad) => {
      const adId = String(ad._id);
      const isFirstTimeAudienceAd = Array.isArray(ad.targetAudience) && ad.targetAudience.includes('first_time_candidate');
      if (isFirstTimeAudienceAd && firstTimeSeenAdIds.has(adId)) {
        return false;
      }

      const cap = Number(ad.dailyCapPerUser || 0);
      if (cap <= 0) return true;
      const shown = Number(impressionsByAdId.get(adId) || 0);
      return shown < cap;
    });

    return res.json({ success: true, ads: filteredAds });
  } catch (err) {
    console.error('[AdController] listActive:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───── POST /api/ads  (developer only – create) ───── */
exports.create = async (req, res) => {
  try {
    const {
      title, subtitle, body, imageUrl, logoUrl, tag,
      ctaText, ctaUrl, ctaSecondaryText, ctaSecondaryUrl,
      targetAudience, displayType, showCloseButton, closeOnTimer,
      closeTimerSeconds, intervalSeconds, dailyCapPerUser, priority,
      displayScope, specificRoutes,
      startDate, endDate, styling,
      amountPaid, advertiserName, advertiserLogoUrl, campaignType,
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'Ad title is required' });
    }

    const ad = new Ad({
      title: String(title).trim(),
      subtitle: String(subtitle || '').trim(),
      body: String(body || '').trim(),
      imageUrl: '',
      logoUrl: String(logoUrl || '').trim(),
      tag: String(tag || '').trim(),
      ctaText: String(ctaText || '').trim(),
      ctaUrl: String(ctaUrl || '').trim(),
      ctaSecondaryText: String(ctaSecondaryText || '').trim(),
      ctaSecondaryUrl: String(ctaSecondaryUrl || '').trim(),
      targetAudience: Array.isArray(targetAudience) && targetAudience.length ? targetAudience : ['all'],
      displayType: displayType || 'modal',
      showCloseButton: showCloseButton !== false,
      closeOnTimer: Boolean(closeOnTimer),
      closeTimerSeconds: safeNum(closeTimerSeconds, 8),
      intervalSeconds: safeNum(intervalSeconds, 3600),
      dailyCapPerUser: safeNum(dailyCapPerUser, 0),
      priority: safeNum(priority, 0),
      displayScope: displayScope || 'global',
      specificRoutes: Array.isArray(specificRoutes) ? specificRoutes : [],
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      styling: styling ? pick(styling, STYLE_FIELDS) : {},
      amountPaid: safeNum(amountPaid, 0),
      advertiserName: String(advertiserName || '').trim(),
      advertiserLogoUrl: String(advertiserLogoUrl || '').trim(),
      campaignType: String(campaignType || '').trim(),
      created_by: req.user?.id || req.user?.cand_id || null,
    });

    await ad.save();
    return res.status(201).json({ success: true, ad });
  } catch (err) {
    console.error('[AdController] create:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───── PUT /api/ads/:id  (developer only – update) ───── */
exports.update = async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });

    const allowed = [
      'title', 'subtitle', 'body', 'imageUrl', 'logoUrl', 'tag',
      'ctaText', 'ctaUrl', 'ctaSecondaryText', 'ctaSecondaryUrl',
      'targetAudience', 'displayType', 'showCloseButton', 'closeOnTimer',
      'closeTimerSeconds', 'intervalSeconds', 'dailyCapPerUser', 'priority',
      'displayScope', 'specificRoutes', 'startDate', 'endDate',
      'amountPaid', 'advertiserName', 'advertiserLogoUrl', 'campaignType',
    ];

    allowed.forEach((key) => {
      if (key in req.body) ad[key] = req.body[key];
    });

    // Image URL is intentionally disabled in manager; keep ads logo-only.
    ad.imageUrl = '';

    if (req.body.styling) {
      Object.assign(ad.styling, pick(req.body.styling, STYLE_FIELDS));
      ad.markModified('styling');
    }

    await ad.save();
    return res.json({ success: true, ad });
  } catch (err) {
    console.error('[AdController] update:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───── POST /api/ads/:id/publish  (developer only) ───── */
exports.publish = async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { isPublished: true },
      { returnDocument: 'after' }
    );
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    return res.json({ success: true, ad });
  } catch (err) {
    console.error('[AdController] publish:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───── POST /api/ads/:id/unpublish  (developer only) ───── */
exports.unpublish = async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { isPublished: false },
      { returnDocument: 'after' }
    );
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    return res.json({ success: true, ad });
  } catch (err) {
    console.error('[AdController] unpublish:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───── DELETE /api/ads/:id  (developer only) ───── */
exports.remove = async (req, res) => {
  try {
    const ad = await Ad.findByIdAndDelete(req.params.id);
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    return res.json({ success: true, message: 'Ad deleted' });
  } catch (err) {
    console.error('[AdController] remove:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───── POST /api/ads/:id/impression  (authenticated – track view) ───── */
exports.trackImpression = async (req, res) => {
  try {
    const userKey = getUserKey(req);
    const dayKey = getUtcDayKey();
    const userId = req.user?.id || req.user?.cand_id || req.user?._id;
    const userRole = req.user?.role || 'user';

    // Track in old AdDeliveryLog for backward compatibility
    await Promise.all([
      Ad.findByIdAndUpdate(req.params.id, { $inc: { impressions: 1 } }),
      AdDeliveryLog.findOneAndUpdate(
        { ad_id: req.params.id, user_key: userKey, day_key: dayKey },
        { $inc: { impressions: 1 } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      ),
    ]);

    // Log new event
    await logAdEvent(req.params.id, userId, 'impression', {
      role: userRole,
      uid: userId,
      source_route: req.body?.source_route,
    });

    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true }); // never fail
  }
};

/* ───── POST /api/ads/:id/click  (authenticated – track click) ───── */
exports.trackClick = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.cand_id || req.user?._id;
    const userRole = req.user?.role || 'user';
    const button = String(req.body?.button || 'primary');

    await Ad.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } });

    // Log new event with button metadata
    await logAdEvent(req.params.id, userId, 'click', {
      role: userRole,
      uid: userId,
      metadata: { button },
    });

    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true });
  }
};

/* ───── POST /api/ads/:id/modal-open  (authenticated – track modal open) ───── */
exports.trackModalOpen = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.cand_id || req.user?._id;
    const userRole = req.user?.role || 'user';

    await logAdEvent(req.params.id, userId, 'modal_open', {
      role: userRole,
      uid: userId,
      source_route: req.body?.source_route,
    });

    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true });
  }
};

/* ───── POST /api/ads/:id/modal-close  (authenticated – track modal close + view time) ───── */
exports.trackModalClose = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.cand_id || req.user?._id;
    const userRole = req.user?.role || 'user';
    const durationSeconds = Number(req.body?.duration_seconds || 0);
    const actionTaken = Boolean(req.body?.action_taken || false);

    await logAdEvent(req.params.id, userId, 'modal_close', {
      role: userRole,
      uid: userId,
      duration_seconds: durationSeconds,
      metadata: { actionTaken },
    });

    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true });
  }
};

/* ───── POST /api/ads/:id/dismiss  (authenticated – track modal dismiss) ───── */
exports.trackDismiss = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.cand_id || req.user?._id;
    const userRole = req.user?.role || 'user';

    await logAdEvent(req.params.id, userId, 'dismiss', {
      role: userRole,
      uid: userId,
    });

    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true });
  }
};

/* ───── POST /api/ads/:id/link-click  (authenticated – track link click with destination) ───── */
exports.trackLinkClick = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.cand_id || req.user?._id;
    const userRole = req.user?.role || 'user';
    const { link_destination } = req.body || {};
    const button = String(req.body?.button || 'primary');

    await logAdEvent(req.params.id, userId, 'link_click', {
      role: userRole,
      uid: userId,
      link_destination,
      metadata: { button },
    });

    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true });
  }
};

/* ───── POST /api/ads/:id/registration  (authenticated – track registration conversion) ───── */
exports.trackRegistration = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.cand_id || req.user?._id;
    const userRole = req.user?.role || 'user';

    await logAdEvent(req.params.id, userId, 'registration', {
      role: userRole,
      uid: userId,
    });

    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true });
  }
};

/* ───── GET /api/ads/:id/performance  (developer only) ───── */
exports.getPerformance = async (req, res) => {
  try {
    const adId = req.params.id;
    const ad = await Ad.findById(adId).lean();
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });

    // Get comprehensive analytics from new event logs
    const analytics = await getAdAnalytics(adId);

    // Load any manual overrides from AdPerformance
    const overrides = await AdPerformance.findOne({ ad_id: ad._id }).lean();

    // Use overrides if present, otherwise use analytics
    const impressions = overrides?.impressions ?? Math.max(analytics.impressions, Number(ad.impressions || 0));
    const uniqueViewers = overrides?.uniqueViewers ?? analytics.uniqueViewers;
    const clicks = overrides?.clicks ?? Math.max(analytics.clicks, Number(ad.clicks || 0));
    const registrations = overrides?.registrations ?? analytics.registrations;
    const modalOpens = overrides?.modalOpens ?? analytics.modalOpens;
    const modalCloses = overrides?.modalCloses ?? analytics.modalCloses;
    const dismissCount = overrides?.dismissCount ?? analytics.dismissCount;
    const averageViewTimeSeconds = overrides?.averageViewTimeSeconds ?? analytics.averageViewTimeSeconds;

    // Calculate derived metrics
    const ctr = impressions > 0 ? ((clicks / impressions) * 100) : 0;
    const conversionRate = clicks > 0 ? ((registrations / clicks) * 100) : 0;

    // Derive status
    let status = 'ACTIVE';
    if (!ad.isPublished) status = 'DRAFT';
    else if (ad.startDate && new Date() < new Date(ad.startDate)) status = 'SCHEDULED';
    else if (ad.endDate && new Date() > new Date(ad.endDate)) status = 'ENDED';

    // Derive recommendation if not manually overridden
    let derivedRecommendation = '';
    if (!overrides?.recommendation && clicks > 0) {
      const hasCtaPrimary = String(ad.ctaText || '').trim().length > 0;
      const hasCtaSecondary = String(ad.ctaSecondaryText || '').trim().length > 0;
      const recs = [];
      if (!hasCtaPrimary && !hasCtaSecondary) {
        recs.push('No CTA defined. Add clear call-to-action buttons to boost engagement.');
      }
      if (ctr < 1 && clicks > 50) {
        recs.push(`CTR is ${ctr.toFixed(2)}% despite high volume. Refresh ad copy or test different CTA wording.`);
      } else if (ctr > 5 && clicks > 20) {
        recs.push(`Strong CTR at ${ctr.toFixed(2)}%. Consider increasing budget or expanding audience.`);
      }
      if (conversionRate < 5 && clicks > 10) {
        recs.push(`Low conversion rate at ${conversionRate.toFixed(2)}%. Optimize landing page or refine audience targeting.`);
      } else if (conversionRate > 20 && clicks > 10) {
        recs.push(`Excellent conversion rate at ${conversionRate.toFixed(2)}%. This is a high-performing campaign.`);
      }
      if (analytics.dismissRate > 50) {
        recs.push(`High dismiss rate (${analytics.dismissRate.toFixed(1)}%). Ad may not resonate with audience. Adjust targeting or messaging.`);
      }
      if (analytics.averageViewTimeSeconds > 0 && analytics.averageViewTimeSeconds < 2) {
        recs.push(`Very short view time (${analytics.averageViewTimeSeconds.toFixed(1)}s). Simplify copy or strengthen opening hook.`);
      }
      derivedRecommendation = recs.length > 0 ? recs.join(' ') : 'Campaign is performing. Monitor ongoing metrics for optimization opportunities.';
    }

    const performance = {
      status,
      impressions,
      uniqueViewers,
      clicks,
      ctr: parseFloat(ctr.toFixed(2)),
      amountPaid: overrides?.amountPaid ?? ad.amountPaid ?? 0,
      registrations,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      modalOpens,
      modalCloses,
      dismissCount,
      dismissRate: analytics.dismissRate,
      averageViewTimeSeconds,
      daily: analytics.daily,
      peakImpression: analytics.peakImpression,
      linkAnalytics: analytics.linkAnalytics,
      audienceByDept: analytics.audienceByDept,
      audienceByProgram: analytics.audienceByProgram,
      peakHoursText: overrides?.peakHours ?? '',
      linkAnalyticsNotes: overrides?.linkAnalyticsNotes ?? '',
      destinationTrackingNotes: overrides?.destinationTrackingNotes ?? '',
      weeklyReport: overrides?.weeklyReport ?? '',
      monthlyReport: overrides?.monthlyReport ?? '',
      durationReport: overrides?.durationReport ?? '',
      recommendation: overrides?.recommendation ?? derivedRecommendation,
      notes: overrides?.notes ?? '',
    };

    return res.json({
      success: true,
      performance,
      ad: {
        _id: ad._id,
        title: ad.title,
        subtitle: ad.subtitle,
        logoUrl: ad.logoUrl,
        tag: ad.tag,
        targetAudience: ad.targetAudience,
        createdAt: ad.createdAt,
        startDate: ad.startDate,
        endDate: ad.endDate,
        amountPaid: ad.amountPaid,
        advertiserName: ad.advertiserName,
        advertiserLogoUrl: ad.advertiserLogoUrl,
        campaignType: ad.campaignType,
      },
    });
  } catch (err) {
    console.error('[AdController] getPerformance:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ───── PUT /api/ads/:id/performance  (developer only) ───── */
exports.updatePerformance = async (req, res) => {
  try {
    const adId = req.params.id;
    const ad = await Ad.findById(adId).lean();
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });

    const {
      impressions, uniqueViewers, clicks, registrations, amountPaid, notes,
      modalOpens, modalCloses, dismissCount, averageViewTimeSeconds,
      peakHours, linkAnalyticsNotes, destinationTrackingNotes,
      weeklyReport, monthlyReport, durationReport, recommendation,
    } = req.body;
    const doc = await AdPerformance.findOneAndUpdate(
      { ad_id: ad._id },
      {
        $set: {
          impressions,
          uniqueViewers,
          clicks,
          registrations,
          amountPaid,
          notes,
          modalOpens,
          modalCloses,
          dismissCount,
          averageViewTimeSeconds,
          peakHours,
          linkAnalyticsNotes,
          destinationTrackingNotes,
          weeklyReport,
          monthlyReport,
          durationReport,
          recommendation,
          updated_by: req.user?.id || null,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    return res.json({ success: true, performance: doc });
  } catch (err) {
    console.error('[AdController] updatePerformance:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
