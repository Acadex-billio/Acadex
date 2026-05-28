const { Coupon, COUPON_APPLIES_TO } = require('../models/Coupon');
const {
  normalizePromoCode,
  expireCouponLinkedAssets,
} = require('../services/couponService');

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => String(v || '').trim())
      .filter(Boolean);
  }
  return [];
};

const validateCouponPayload = ({ body, partial = false }) => {
  const payload = {};

  if (!partial || body.code !== undefined) {
    const code = normalizePromoCode(body.code);
    if (!code) throw Object.assign(new Error('Coupon code is required'), { statusCode: 400 });
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      throw Object.assign(new Error('Coupon code must be 3-30 chars, uppercase letters, numbers, _ or -'), { statusCode: 400 });
    }
    payload.code = code;
  }

  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw Object.assign(new Error('Coupon name is required'), { statusCode: 400 });
    payload.name = name;
  }

  if (body.description !== undefined) payload.description = String(body.description || '').trim();

  if (!partial || body.applies_to !== undefined) {
    const appliesTo = parseArray(body.applies_to).map((v) => v.toLowerCase());
    if (!appliesTo.length) throw Object.assign(new Error('applies_to must include at least one scope'), { statusCode: 400 });
    const invalid = appliesTo.find((scope) => !COUPON_APPLIES_TO.includes(scope));
    if (invalid) throw Object.assign(new Error(`Invalid applies_to scope: ${invalid}`), { statusCode: 400 });
    payload.applies_to = Array.from(new Set(appliesTo));
  }

  if (body.target_plans !== undefined) {
    const plans = parseArray(body.target_plans).map((v) => v.toLowerCase());
    const invalid = plans.find((p) => !['pro', 'paygo'].includes(p));
    if (invalid) throw Object.assign(new Error(`Invalid target plan: ${invalid}`), { statusCode: 400 });
    payload.target_plans = Array.from(new Set(plans));
  }

  if (!partial || body.outcome_type !== undefined) {
    const outcomeType = String(body.outcome_type || '').trim().toLowerCase();
    if (!['amount_off', 'percent_off', 'free'].includes(outcomeType)) {
      throw Object.assign(new Error('outcome_type must be amount_off, percent_off, or free'), { statusCode: 400 });
    }
    payload.outcome_type = outcomeType;
  }

  if (body.amount_off !== undefined) payload.amount_off = Math.max(0, Number(body.amount_off || 0));
  if (body.percent_off !== undefined) payload.percent_off = Math.max(0, Math.min(100, Number(body.percent_off || 0)));

  if (!partial || body.starts_at !== undefined) {
    const startsAt = new Date(body.starts_at);
    if (Number.isNaN(startsAt.getTime())) throw Object.assign(new Error('Invalid starts_at date'), { statusCode: 400 });
    payload.starts_at = startsAt;
  }

  if (!partial || body.expires_at !== undefined) {
    const expiresAt = new Date(body.expires_at);
    if (Number.isNaN(expiresAt.getTime())) throw Object.assign(new Error('Invalid expires_at date'), { statusCode: 400 });
    payload.expires_at = expiresAt;
  }

  if (body.is_published !== undefined) payload.is_published = Boolean(body.is_published);

  const effectiveOutcome = payload.outcome_type;
  if (effectiveOutcome === 'amount_off' && !partial && payload.amount_off === undefined) {
    throw Object.assign(new Error('amount_off is required for amount_off coupons'), { statusCode: 400 });
  }
  if (effectiveOutcome === 'percent_off' && !partial && payload.percent_off === undefined) {
    throw Object.assign(new Error('percent_off is required for percent_off coupons'), { statusCode: 400 });
  }

  if (payload.starts_at && payload.expires_at && payload.expires_at <= payload.starts_at) {
    throw Object.assign(new Error('expires_at must be after starts_at'), { statusCode: 400 });
  }

  return payload;
};

const maybeCleanupIfInactive = async (coupon) => {
  if (!coupon) return;
  const now = Date.now();
  const isExpired = coupon.expires_at ? new Date(coupon.expires_at).getTime() < now : false;
  if (coupon.is_deleted || !coupon.is_published || isExpired) {
    await expireCouponLinkedAssets(coupon);
  }
};

exports.listCoupons = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || 'all').trim().toLowerCase();

    const filter = { is_deleted: false };
    if (q) {
      filter.$or = [
        { code: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ];
    }

    const now = new Date();
    if (status === 'active') {
      filter.is_published = true;
      filter.starts_at = { $lte: now };
      filter.expires_at = { $gte: now };
    } else if (status === 'draft') {
      filter.is_published = false;
    } else if (status === 'expired') {
      filter.expires_at = { $lt: now };
    }

    const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, coupons });
  } catch (err) {
    console.error('[Coupon] list error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load coupons' });
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const payload = validateCouponPayload({ body: req.body, partial: false });
    payload.created_by = String(req.user?.id || req.user?.cand_id || '').trim() || null;
    payload.updated_by = payload.created_by;

    if (payload.outcome_type !== 'amount_off') payload.amount_off = 0;
    if (payload.outcome_type !== 'percent_off') payload.percent_off = 0;

    const exists = await Coupon.findOne({ code: payload.code, is_deleted: false }).lean();
    if (exists) return res.status(409).json({ success: false, message: 'Coupon code already exists' });

    const coupon = await Coupon.create(payload);
    return res.status(201).json({ success: true, coupon });
  } catch (err) {
    console.error('[Coupon] create error:', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to create coupon' });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const code = normalizePromoCode(req.params.code);
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code is required' });

    const existing = await Coupon.findOne({ code, is_deleted: false });
    if (!existing) return res.status(404).json({ success: false, message: 'Coupon not found' });

    const payload = validateCouponPayload({ body: req.body, partial: true });

    const effectiveOutcome = payload.outcome_type || existing.outcome_type;
    if (effectiveOutcome === 'amount_off' && payload.amount_off === undefined && existing.amount_off <= 0) {
      return res.status(400).json({ success: false, message: 'amount_off is required for amount_off coupons' });
    }
    if (effectiveOutcome === 'percent_off' && payload.percent_off === undefined && existing.percent_off <= 0) {
      return res.status(400).json({ success: false, message: 'percent_off is required for percent_off coupons' });
    }

    if (payload.starts_at || payload.expires_at) {
      const startsAt = payload.starts_at || existing.starts_at;
      const expiresAt = payload.expires_at || existing.expires_at;
      if (expiresAt <= startsAt) {
        return res.status(400).json({ success: false, message: 'expires_at must be after starts_at' });
      }
    }

    Object.assign(existing, payload, {
      updated_by: String(req.user?.id || req.user?.cand_id || '').trim() || existing.updated_by,
    });

    if (effectiveOutcome !== 'amount_off') existing.amount_off = 0;
    if (effectiveOutcome !== 'percent_off') existing.percent_off = 0;

    await existing.save();
    await maybeCleanupIfInactive(existing.toObject());

    return res.json({ success: true, coupon: existing });
  } catch (err) {
    console.error('[Coupon] update error:', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to update coupon' });
  }
};

exports.publishCoupon = async (req, res) => {
  try {
    const code = normalizePromoCode(req.params.code);
    const coupon = await Coupon.findOne({ code, is_deleted: false });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    coupon.is_published = true;
    coupon.updated_by = String(req.user?.id || req.user?.cand_id || '').trim() || coupon.updated_by;
    await coupon.save();

    return res.json({ success: true, coupon });
  } catch (err) {
    console.error('[Coupon] publish error:', err);
    return res.status(500).json({ success: false, message: 'Failed to publish coupon' });
  }
};

exports.unpublishCoupon = async (req, res) => {
  try {
    const code = normalizePromoCode(req.params.code);
    const coupon = await Coupon.findOne({ code, is_deleted: false });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    coupon.is_published = false;
    coupon.updated_by = String(req.user?.id || req.user?.cand_id || '').trim() || coupon.updated_by;
    await coupon.save();

    await expireCouponLinkedAssets(coupon.toObject());

    return res.json({ success: true, coupon });
  } catch (err) {
    console.error('[Coupon] unpublish error:', err);
    return res.status(500).json({ success: false, message: 'Failed to unpublish coupon' });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const code = normalizePromoCode(req.params.code);
    const coupon = await Coupon.findOne({ code, is_deleted: false });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    coupon.is_deleted = true;
    coupon.is_published = false;
    coupon.updated_by = String(req.user?.id || req.user?.cand_id || '').trim() || coupon.updated_by;
    await coupon.save();

    await expireCouponLinkedAssets(coupon.toObject());

    return res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) {
    console.error('[Coupon] delete error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete coupon' });
  }
};
