const Ad = require('../models/Ad');
const AdDeliveryLog = require('../models/AdDeliveryLog');
const User = require('../models/User');
const { uploadFile } = require('../utils/s3Uploader');

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
  'backgroundColor', 'textColor', 'buttonColor', 'buttonTextColor',
  'overlayColor', 'borderRadius', 'borderColor', 'imagePosition',
];

const getUtcDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const getUserKey = (req) => {
  const role = String(req.user?.role || 'user').toLowerCase();
  const uid = req.user?.id || req.user?.cand_id || req.user?._id || req.user?.email || 'anonymous';
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
    return res.status(500).json({ success: false, message: 'Failed to upload logo' });
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
      { new: true }
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
      { new: true }
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
    await Promise.all([
      Ad.findByIdAndUpdate(req.params.id, { $inc: { impressions: 1 } }),
      AdDeliveryLog.findOneAndUpdate(
        { ad_id: req.params.id, user_key: userKey, day_key: dayKey },
        { $inc: { impressions: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
    ]);
    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true }); // never fail
  }
};

/* ───── POST /api/ads/:id/click  (authenticated – track click) ───── */
exports.trackClick = async (req, res) => {
  try {
    await Ad.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } });
    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true });
  }
};
