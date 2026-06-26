const User = require('../models/User');
const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const { getPlanDefinition, getMaterialDefaults } = require('./subscriptionCatalog');
const { Coupon } = require('../models/Coupon');
const { isCouponActiveNow, ensureCouponBackedSubscriptionStillActive } = require('../services/couponService');

function normalizeSubscription(raw) {
  const plan = String(raw?.plan || 'basic').toLowerCase();
  return {
    plan: ['basic', 'pro', 'paygo'].includes(plan) ? plan : 'basic',
    status: String(raw?.status || 'active').toLowerCase() === 'expired' ? 'expired' : 'active',
    activated_at: raw?.activated_at ? new Date(raw.activated_at) : null,
    expires_at: raw?.expires_at ? new Date(raw.expires_at) : null,
    last_payment_at: raw?.last_payment_at ? new Date(raw.last_payment_at) : null,
    phone_number: raw?.phone_number ? String(raw.phone_number) : null,
    source_transaction_id: raw?.source_transaction_id || null,
  };
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
  const config = {
    ...((await getMaterialDefaults(materialType)) || {}),
    ...(doc?.subscription_access || {}),
  };

  const materialPrice = Number(doc?.material_price);
  if (Number.isFinite(materialPrice) && materialPrice >= 0) {
    config.paygo_download_price = materialPrice;
  }

  return config;
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

async function getMaterialAccessSummary({ user, materialType, resourceId, doc }) {
  await ensureCouponBackedSubscriptionStillActive({
    candId: user?.cand_id,
    subscription: user?.subscription,
  });

  const resolvedSubscription = resolveSubscription(user?.subscription);
  const config = await getMaterialAccessConfig(materialType, doc);
  const base = {
    plan: resolvedSubscription.plan,
    allow_copy: resolvedSubscription.plan === 'pro',
    allow_download: false,
    preview_page_limit: config.basic_preview_pages,
    upgrade_required: false,
    payment_required: null,
    access_config: config,
  };

  if (resolvedSubscription.plan === 'pro') {
    return {
      ...base,
      allow_download: true,
      preview_page_limit: null,
    };
  }

  if (resolvedSubscription.plan === 'basic') {
    return {
      ...base,
      upgrade_required: true,
    };
  }

  const previewGrantCode = `${materialType}_preview_full`;
  const downloadGrantCode = `${materialType}_download`;
  const [previewGrant, downloadGrant] = await Promise.all([
    findActiveGrant({ candId: user?.cand_id, grantCode: previewGrantCode, resourceId }),
    findActiveGrant({ candId: user?.cand_id, grantCode: downloadGrantCode, resourceId }),
  ]);

  return {
    ...base,
    preview_page_limit: previewGrant ? null : config.paygo_preview_pages,
    allow_download: Boolean(downloadGrant),
    payment_required: {
      preview: previewGrant
        ? null
        : {
            purpose_code: previewGrantCode,
            amount: config.paygo_full_preview_price,
            currency: 'XAF',
            access_minutes: config.paygo_access_minutes,
          },
      download: downloadGrant
        ? null
        : {
            purpose_code: downloadGrantCode,
            amount: config.paygo_download_price,
            currency: 'XAF',
            access_minutes: config.paygo_access_minutes,
          },
    },
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
  syncUserSubscriptionIfExpired,
  buildSubscriptionResponse,
  getMaterialAccessConfig,
  getMaterialAccessSummary,
  buildCandidatePaymentRequirement,
};