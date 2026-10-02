const User = require('../models/User');
const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const CandidatePurchase = require('../models/CandidatePurchase');
const { getPlanDefinition, getMaterialDefaults } = require('./subscriptionCatalog');
const { Coupon } = require('../models/Coupon');
const { isCouponActiveNow, ensureCouponBackedSubscriptionStillActive } = require('../services/couponService');

function normalizeSubscription(raw) {
  const plan = String(raw?.plan || 'basic').toLowerCase();
  return {
    plan: ['basic', 'pro', 'paygo', 'full-package'].includes(plan) ? plan : 'basic',
    status: String(raw?.status || 'active').toLowerCase() === 'expired' ? 'expired' : 'active',
    activated_at: raw?.activated_at ? new Date(raw.activated_at) : null,
    expires_at: raw?.expires_at ? new Date(raw.expires_at) : null,
    last_payment_at: raw?.last_payment_at ? new Date(raw.last_payment_at) : null,
    last_reminder_state: String(raw?.last_reminder_state || 'none').trim(),
    last_reminder_sent_at: raw?.last_reminder_sent_at ? new Date(raw.last_reminder_sent_at) : null,
    phone_number: raw?.phone_number ? String(raw.phone_number) : null,
    source_transaction_id: raw?.source_transaction_id || null,
  };
}

function getSubscriptionReminderState({ expires_at, now = new Date() }) {
  const expiryDate = expires_at ? new Date(expires_at) : null;
  if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
    return { state: 'none', days_remaining: null, expired: false };
  }

  const diffMs = expiryDate.getTime() - now.getTime();
  const daysRemaining = diffMs / (1000 * 60 * 60 * 24);

  if (daysRemaining <= 0) {
    return { state: 'expired', days_remaining: 0, expired: true };
  }
  if (daysRemaining <= 1) {
    return { state: '1_day', days_remaining: 1, expired: false };
  }
  if (daysRemaining <= 3) {
    return { state: '3_days', days_remaining: 3, expired: false };
  }
  if (daysRemaining <= 7) {
    return { state: '7_days', days_remaining: 7, expired: false };
  }

  return { state: 'none', days_remaining: Math.ceil(daysRemaining), expired: false };
}

function resolveSubscription(raw) {
  const normalized = normalizeSubscription(raw);
  if ((normalized.plan === 'pro' || normalized.plan === 'paygo') && normalized.expires_at && normalized.expires_at.getTime() <= Date.now()) {
    return {
      ...normalizeSubscription(null),
      previous_plan: normalized.plan,
      previous_expires_at: normalized.expires_at,
      fallback_applied: true,
    };
  }
  return {
    ...normalized,
    fallback_applied: false,
  };
}

async function syncUserSubscriptionIfExpired(candId, subscription) {
  if (!candId || !subscription?.fallback_applied) return;
  await User.updateOne(
    { cand_id: String(candId).trim() },
    {
      $set: {
        subscription: {
          plan: 'basic',
          status: 'active',
          activated_at: new Date(),
          expires_at: null,
          last_payment_at: subscription.last_payment_at || null,
          phone_number: subscription.phone_number || null,
          source_transaction_id: subscription.source_transaction_id || null,
        },
      },
    }
  );
}

async function buildSubscriptionResponse(raw) {
  const resolved = resolveSubscription(raw);
  const definition = await getPlanDefinition(resolved.plan);
  return {
    ...resolved,
    plan_definition: definition,
  };
}

async function getMaterialAccessConfig(materialType, doc) {
  return getMaterialDefaults(materialType);
}

async function isFreeMaterialAccess(materialType, doc) {
  const normalizedType = String(materialType || '').trim().toLowerCase();
  if (normalizedType === 'report') {
    return Boolean(doc?.is_guide);
  }

  if (normalizedType === 'question_paper' || normalizedType === 'questionpaper') {
    const paperType = String(doc?.paper_type || '').trim().toLowerCase();
    return ['ca', 'exam', 'mock'].includes(paperType);
  }

  return false;
}

async function findActiveGrant({ candId, grantCode, resourceId }) {
  const now = new Date();
  const grant = await PaymentAccessGrant.findOne({
    user_cand_id: String(candId).trim(),
    grant_code: grantCode,
    resource_id: String(resourceId).trim(),
    status: 'active',
    expires_at: { $gt: now },
  })
    .sort({ expires_at: -1 })
    .populate({ path: 'transaction_id', select: 'metadata.coupon_code' })
    .lean();

  if (!grant) return null;

  const couponCode = String(grant?.transaction_id?.metadata?.coupon_code || '').trim().toUpperCase();
  if (!couponCode) return grant;

  const coupon = await Coupon.findOne({ code: couponCode, is_deleted: false }).lean();
  if (isCouponActiveNow(coupon)) return grant;

  await PaymentAccessGrant.updateOne(
    { _id: grant._id, status: 'active' },
    {
      $set: {
        status: 'expired',
        expires_at: now,
        metadata: {
          ...(grant.metadata || {}),
          cleanup_reason: 'coupon_inactive',
          coupon_code: couponCode,
        },
      },
    }
  );

  return null;
}

async function findActiveGrantIncludingAdmin({ candId, grantCode, resourceId }) {
  // First check PaymentAccessGrant as before
  const g = await findActiveGrant({ candId, grantCode, resourceId }).catch(() => null);
  if (g) return g;

  // If none, try CandidatePurchase admin grants by resolving the user id
  try {
    const user = await User.findOne({ cand_id: String(candId).trim() }).select('_id email').lean();
    if (!user) return null;
    const now = new Date();
    // derive item_type from grantCode prefix (e.g., 'report_preview_full' -> 'report')
    const parts = String(grantCode || '').split('_');
    const itemType = parts[0] || null;
    if (!itemType) return null;

    const candidateId = user._id;
    const purchase = await CandidatePurchase.findOne({
      $and: [
        { status: 'grant-success' },
        { expires_at: { $gt: now } },
        {
          $or: [
            { candidate_id: candidateId },
            { candidate_email: String(user.email || '').trim().toLowerCase() },
          ],
        },
        { item_type: itemType },
        { item_id: String(resourceId) },
      ],
    })
      .sort({ expires_at: -1 })
      .lean();

    if (!purchase) return null;

    // normalize to same shape as PaymentAccessGrant to satisfy callers
    return {
      user_cand_id: String(candId).trim(),
      grant_code: grantCode,
      resource_id: String(resourceId).trim(),
      status: 'active',
      expires_at: purchase.expires_at,
      metadata: { source: 'admin_grant', purchase_id: purchase._id },
    };
  } catch (err) {
    return null;
  }
}

async function getMaterialAccessSummary({ user, materialType, resourceId, doc }) {
  await ensureCouponBackedSubscriptionStillActive({
    candId: user?.cand_id,
    subscription: user?.subscription,
  });

  const resolvedSubscription = resolveSubscription(user?.subscription);
  const config = await getMaterialAccessConfig(materialType, doc);
  const previewGrantCode = `${materialType}_preview_full`;
  const downloadGrantCode = `${materialType}_download`;
  const [previewGrant, downloadGrant] = await Promise.all([
    findActiveGrantIncludingAdmin({ candId: user?.cand_id, grantCode: previewGrantCode, resourceId }),
    findActiveGrantIncludingAdmin({ candId: user?.cand_id, grantCode: downloadGrantCode, resourceId }),
  ]);

  const planPricing = config?.plan_pricing?.[resolvedSubscription.plan] || {
    preview_pages: resolvedSubscription.plan === 'basic' ? (config?.basic_preview_pages || 3) : (config?.paygo_preview_pages || 3),
    preview_price: config?.paygo_full_preview_price || 0,
    download_price: config?.paygo_download_price || 0,
    access_minutes: config?.paygo_access_minutes || 60,
    free_access: resolvedSubscription.plan === 'full-package',
  };
  const base = {
    plan: resolvedSubscription.plan,
    allow_copy: ['pro', 'full-package'].includes(resolvedSubscription.plan),
    allow_download: false,
    preview_page_limit: Number(planPricing.preview_pages || 3),
    upgrade_required: false,
    payment_required: null,
    access_config: config,
  };

  if (['pro', 'full-package'].includes(resolvedSubscription.plan)) {
    return {
      ...base,
      allow_download: true,
      preview_page_limit: null,
      payment_required: null,
      upgrade_required: false,
    };
  }

  const preview_page_limit = previewGrant ? null : Number(planPricing.preview_pages || 3);

  if (resolvedSubscription.plan === 'basic') {
    return {
      ...base,
      preview_page_limit,
      allow_download: Boolean(downloadGrant),
      upgrade_required: true,
      payment_required: {
        preview: null,
        download: null,
      },
    };
  }

  const paymentRequired = {
    preview: previewGrant
      ? null
      : {
          purpose_code: previewGrantCode,
          amount: Number(planPricing.preview_price || 0),
          currency: 'XAF',
          access_minutes: Number(planPricing.access_minutes || 60),
        },
    download: downloadGrant
      ? null
      : {
          purpose_code: downloadGrantCode,
          amount: Number(planPricing.download_price || 0),
          currency: 'XAF',
          access_minutes: Number(planPricing.access_minutes || 60),
        },
  };

  return {
    ...base,
    preview_page_limit,
    allow_download: Boolean(downloadGrant),
    upgrade_required: true,
    payment_required: paymentRequired,
  };
}

function buildCandidatePaymentRequirement({ title, message, action, amount, resourceType, resourceId, purposeCode, accessMinutes }) {
  return {
    title,
    message,
    action,
    amount,
    currency: 'XAF',
    resource_type: resourceType,
    resource_id: String(resourceId || ''),
    purpose_code: purposeCode,
    access_minutes: accessMinutes || null,
  };
}

module.exports = {
  normalizeSubscription,
  resolveSubscription,
  getSubscriptionReminderState,
  syncUserSubscriptionIfExpired,
  buildSubscriptionResponse,
  getMaterialAccessConfig,
  getMaterialAccessSummary,
  buildCandidatePaymentRequirement,
  isFreeMaterialAccess,
  findActiveGrant,
  findActiveGrantIncludingAdmin,
};