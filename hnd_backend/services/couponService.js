const crypto = require('crypto');
const User = require('../models/User');
const PaymentTransaction = require('../models/PaymentTransaction');
const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const LecturerBooking = require('../models/LecturerBooking');
const { Coupon } = require('../models/Coupon');

const normalizePromoCode = (value) => String(value || '').trim().toUpperCase();

const sanitizePromoCodeInput = (value) => {
  const code = normalizePromoCode(value);
  return code || null;
};

const isCouponActiveNow = (coupon, now = new Date()) => {
  if (!coupon || coupon.is_deleted || !coupon.is_published) return false;
  if (!coupon.starts_at || !coupon.expires_at) return false;
  const startsAt = new Date(coupon.starts_at);
  const expiresAt = new Date(coupon.expires_at);
  return startsAt <= now && expiresAt >= now;
};

const computeDiscountedAmount = (baseAmount, coupon) => {
  const amount = Math.max(0, Number(baseAmount || 0));
  if (!coupon) return { finalAmount: amount, discountAmount: 0 };

  let finalAmount = amount;
  if (coupon.outcome_type === 'free') {
    finalAmount = 0;
  } else if (coupon.outcome_type === 'amount_off') {
    finalAmount = Math.max(0, amount - Number(coupon.amount_off || 0));
  } else if (coupon.outcome_type === 'percent_off') {
    const pct = Math.min(100, Math.max(0, Number(coupon.percent_off || 0)));
    finalAmount = Math.max(0, amount - (amount * pct / 100));
  }

  const discountAmount = Math.max(0, amount - finalAmount);
  return { finalAmount: Number(finalAmount.toFixed(2)), discountAmount: Number(discountAmount.toFixed(2)) };
};

const applyCouponToAmount = async ({
  promoCode,
  appliesTo,
  baseAmount,
  planCode = null,
}) => {
  await cleanupExpiredCoupons();

  const normalizedCode = sanitizePromoCodeInput(promoCode);
  const amount = Math.max(0, Number(baseAmount || 0));

  if (!normalizedCode) {
    return {
      promoCode: null,
      coupon: null,
      finalAmount: amount,
      discountAmount: 0,
      applied: false,
    };
  }

  const coupon = await Coupon.findOne({ code: normalizedCode, is_deleted: false }).lean();
  if (!coupon) {
    const err = new Error('Promo code not found.');
    err.statusCode = 404;
    throw err;
  }

  if (!isCouponActiveNow(coupon)) {
    const err = new Error('Promo code is inactive or expired.');
    err.statusCode = 400;
    throw err;
  }

  if (!Array.isArray(coupon.applies_to) || !coupon.applies_to.includes(String(appliesTo || '').trim())) {
    const err = new Error('Promo code does not apply to this payment area.');
    err.statusCode = 400;
    throw err;
  }

  if (String(appliesTo || '') === 'subscription' && Array.isArray(coupon.target_plans) && coupon.target_plans.length > 0) {
    const plan = String(planCode || '').trim().toLowerCase();
    if (!coupon.target_plans.includes(plan)) {
      const err = new Error('Promo code does not apply to this subscription plan.');
      err.statusCode = 400;
      throw err;
    }
  }

  const pricing = computeDiscountedAmount(amount, coupon);
  return {
    promoCode: normalizedCode,
    coupon,
    finalAmount: pricing.finalAmount,
    discountAmount: pricing.discountAmount,
    applied: pricing.discountAmount > 0 || pricing.finalAmount === 0,
  };
};

const createCouponTransaction = async ({
  candId,
  purposeType,
  purposeCode,
  resourceType,
  resourceId,
  amount,
  currency,
  description,
  phoneNumber,
  metadata,
  coupon,
}) => {
  const now = new Date();
  const phone = String(phoneNumber || '').trim() || '+237000000000';

  return PaymentTransaction.create({
    user_cand_id: candId,
    provider: 'coupon',
    provider_mode: 'production',
    purpose_type: purposeType,
    purpose_code: purposeCode,
    resource_type: resourceType,
    resource_id: resourceId ? String(resourceId) : null,
    amount: Math.max(0, Number(amount || 0)),
    currency: String(currency || 'XAF').toUpperCase(),
    phone_number: phone,
    description,
    external_reference: crypto.randomUUID(),
    external_id: `coupon-${coupon?.code || 'promo'}`,
    status: 'successful',
    provider_response: {
      source: 'coupon',
      code: coupon?.code || null,
      message: 'Payment completed via coupon',
    },
    metadata: {
      ...(metadata || {}),
      coupon_code: coupon?.code || null,
      coupon_id: coupon?._id ? String(coupon._id) : null,
      coupon_expires_at: coupon?.expires_at || null,
      paid_via_coupon: true,
    },
    initiated_at: now,
    completed_at: now,
    expires_at: null,
  });
};

const expireCouponLinkedAssets = async (couponDoc) => {
  if (!couponDoc?.code) return { transactions: 0, grants: 0, subscriptions: 0, bookings: 0, invites: 0 };
  const code = String(couponDoc.code).toUpperCase();
  const now = new Date();

  const transactions = await PaymentTransaction.find({
    status: 'successful',
    'metadata.coupon_code': code,
  })
    .select('_id purpose_type resource_id')
    .lean();

  if (!transactions.length) {
    await Coupon.updateOne({ _id: couponDoc._id }, { $set: { cleanup_processed_at: now } });
    return { transactions: 0, grants: 0, subscriptions: 0, bookings: 0, invites: 0 };
  }

  const txIds = transactions.map((tx) => tx._id);

  const grantsResult = await PaymentAccessGrant.updateMany(
    { transaction_id: { $in: txIds }, status: 'active' },
    { $set: { status: 'expired', expires_at: now, metadata: { cleanup_reason: 'coupon_inactive', coupon_code: code } } }
  );

  const subscriptionTxIds = transactions
    .filter((tx) => String(tx.purpose_type || '') === 'subscription')
    .map((tx) => tx._id);

  let subscriptionsModified = 0;
  if (subscriptionTxIds.length > 0) {
    const subResult = await User.updateMany(
      { 'subscription.source_transaction_id': { $in: subscriptionTxIds } },
      {
        $set: {
          subscription: {
            plan: 'basic',
            status: 'active',
            activated_at: now,
            expires_at: null,
            last_payment_at: now,
            phone_number: null,
            source_transaction_id: null,
          },
        },
      }
    );
    subscriptionsModified = Number(subResult.modifiedCount || 0);
  }

  const bookingTxIds = transactions
    .filter((tx) => String(tx.purpose_type || '') === 'tutorship_booking')
    .map((tx) => tx._id);

  let bookingsModified = 0;
  let invitesModified = 0;

  if (bookingTxIds.length > 0) {
    const bookingResult = await LecturerBooking.updateMany(
      { payment_transaction_id: { $in: bookingTxIds } },
      {
        $set: {
          payment_status: 'failed',
          contract_sealed: false,
          contract_sealed_at: null,
        },
      }
    );
    bookingsModified = Number(bookingResult.modifiedCount || 0);

    const inviteResult = await LecturerBooking.updateMany(
      { 'invited_candidates.payment_transaction_id': { $in: bookingTxIds } },
      {
        $set: {
          'invited_candidates.$[invite].payment_status': 'failed',
        },
      },
      {
        arrayFilters: [{ 'invite.payment_transaction_id': { $in: bookingTxIds } }],
      }
    );
    invitesModified = Number(inviteResult.modifiedCount || 0);
  }

  await Coupon.updateOne({ _id: couponDoc._id }, { $set: { cleanup_processed_at: now } });

  return {
    transactions: txIds.length,
    grants: Number(grantsResult.modifiedCount || 0),
    subscriptions: subscriptionsModified,
    bookings: bookingsModified,
    invites: invitesModified,
  };
};

const cleanupExpiredCoupons = async () => {
  const now = new Date();
  const expiredCoupons = await Coupon.find({
    is_deleted: false,
    is_published: true,
    expires_at: { $lt: now },
    cleanup_processed_at: null,
  }).lean();

  for (const coupon of expiredCoupons) {
    // eslint-disable-next-line no-await-in-loop
    await expireCouponLinkedAssets(coupon);
  }
};

const ensureCouponBackedSubscriptionStillActive = async ({ candId, subscription }) => {
  const sourceId = subscription?.source_transaction_id;
  if (!sourceId) return false;

  const tx = await PaymentTransaction.findById(sourceId).select('metadata purpose_type').lean();
  if (!tx || String(tx.purpose_type || '') !== 'subscription') return false;

  const couponCode = String(tx?.metadata?.coupon_code || '').toUpperCase();
  if (!couponCode) return false;

  const coupon = await Coupon.findOne({ code: couponCode, is_deleted: false }).lean();
  if (isCouponActiveNow(coupon)) return false;

  await User.updateOne(
    { cand_id: String(candId).trim() },
    {
      $set: {
        subscription: {
          plan: 'basic',
          status: 'active',
          activated_at: new Date(),
          expires_at: null,
          last_payment_at: new Date(),
          phone_number: null,
          source_transaction_id: null,
        },
      },
    }
  );

  return true;
};

module.exports = {
  normalizePromoCode,
  sanitizePromoCodeInput,
  isCouponActiveNow,
  computeDiscountedAmount,
  applyCouponToAmount,
  createCouponTransaction,
  expireCouponLinkedAssets,
  cleanupExpiredCoupons,
  ensureCouponBackedSubscriptionStillActive,
};
