const crypto = require('crypto');
const User = require('../models/User');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const QuestionPaper = require('../models/QuestionPaper');
const ChatRoom = require('../models/ChatRoom');
const PaymentTransaction = require('../models/PaymentTransaction');
const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const materialAccessService = require('../services/materialAccessService');
const paymentCallbackService = require('../services/paymentCallbackService');
const History = require('../models/History');
const { PLAN_DEFINITIONS, getPlanDefinition, getCenterPricing } = require('../utils/subscriptionCatalog');
const {
  resolveSubscription,
  syncUserSubscriptionIfExpired,
  buildSubscriptionResponse,
  getMaterialAccessSummary,
} = require('../utils/subscriptionUtils');
const { normalizeCheckoutError, startCampayPayment, refreshCampayPaymentStatus } = require('../services/paymentOrchestrationService');
const {
  sanitizePromoCodeInput,
  applyCouponToAmount,
  createCouponTransaction,
  ensureCouponBackedSubscriptionStillActive,
} = require('../services/couponService');

const PLAN_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const MANUAL_PAYMENT_RECIPIENT_NUMBER = '678507737';
const MANUAL_PAYMENT_RECIPIENT_NAME = 'TEBEI NOEL FORKANG';

function requireCandidate(req) {
  const candId = String(req.user?.cand_id || '').trim();
  if (!candId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  return candId;
}

function buildTransactionReference() {
  return crypto.randomUUID();
}

function buildPaymentSummary(transaction) {
  return {
    transaction_id: transaction._id,
    purpose_type: transaction.purpose_type,
    purpose_code: transaction.purpose_code,
    resource_type: transaction.resource_type,
    resource_id: transaction.resource_id,
    amount: transaction.amount,
    currency: transaction.currency,
    phone_number: transaction.phone_number,
    description: transaction.description,
    status: transaction.status,
    provider: transaction.provider,
    provider_mode: transaction.provider_mode,
    access_minutes: Number(transaction?.metadata?.access_minutes || 0) || null,
    payment_action: transaction?.metadata?.action || null,
    createdAt: transaction.createdAt,
    completed_at: transaction.completed_at,
  };
}

async function loadCandidate(candId) {
  const user = await User.findOne({ cand_id: candId }).select('cand_id name email phone subscription').lean();
  if (!user) {
    const err = new Error('Candidate not found');
    err.statusCode = 404;
    throw err;
  }

  const resolved = resolveSubscription(user.subscription);
  await ensureCouponBackedSubscriptionStillActive({ candId, subscription: resolved });
  if (resolved.fallback_applied) {
    await syncUserSubscriptionIfExpired(candId, resolved);
    user.subscription = {
      plan: 'basic',
      status: 'active',
      activated_at: new Date(),
      expires_at: null,
      last_payment_at: resolved.last_payment_at || null,
      phone_number: resolved.phone_number || null,
      source_transaction_id: resolved.source_transaction_id || null,
    };
  }

  return user;
}

async function grantMaterialAccess(transaction) {
  const expiresAt = new Date(Date.now() + (Number(transaction.metadata?.access_minutes || 60) * 60 * 1000));
  const grantCode = String(transaction.purpose_code || '').trim();
  await PaymentAccessGrant.create({
    user_cand_id: transaction.user_cand_id,
    grant_code: grantCode,
    resource_type: transaction.resource_type,
    resource_id: String(transaction.resource_id),
    transaction_id: transaction._id,
    amount: transaction.amount,
    currency: transaction.currency,
    status: 'active',
    granted_at: new Date(),
    expires_at: expiresAt,
    metadata: {
      description: transaction.description,
    },
  });
}

async function applySuccessfulPayment(transaction) {
  if (transaction.status === 'successful' && transaction.completed_at) return transaction;

  transaction.status = 'successful';
  transaction.completed_at = new Date();

  if (transaction.purpose_type === 'subscription') {
    const nextPlan = transaction.purpose_code === 'plan_pro' ? 'pro' : 'paygo';
    await User.updateOne(
      { cand_id: transaction.user_cand_id },
      {
        $set: {
          subscription: {
            plan: nextPlan,
            status: 'active',
            activated_at: new Date(),
            expires_at: new Date(Date.now() + PLAN_DURATION_MS),
            last_payment_at: new Date(),
            phone_number: transaction.phone_number,
            source_transaction_id: transaction._id,
          },
        },
      }
    );
  }

  if (transaction.purpose_type === 'material_access') {
    const existingGrant = await PaymentAccessGrant.findOne({
      transaction_id: transaction._id,
      user_cand_id: transaction.user_cand_id,
      grant_code: transaction.purpose_code,
      resource_id: String(transaction.resource_id),
    }).lean();
    if (!existingGrant) {
      await grantMaterialAccess(transaction);
    }

    console.info('[Subscription] Material payment successful', {
      transaction_id: String(transaction._id),
      user_cand_id: String(transaction.user_cand_id),
      resource_type: String(transaction.resource_type || ''),
      resource_id: String(transaction.resource_id || ''),
      access_minutes: Number(transaction.metadata?.access_minutes || 60),
    });
  }

  await transaction.save();

  try {
    const materialScope = transaction.purpose_type === 'material_access'
      ? ` [resource:${transaction.resource_type}:${transaction.resource_id} duration:${Number(transaction.metadata?.access_minutes || 60)}m]`
      : '';
    await History.create({
      user_id: transaction.user_cand_id,
      content_type: 'payment',
      content_title: `${transaction.description}${materialScope}`,
      action: transaction.purpose_code,
    });
  } catch (_) {}

  return transaction;
}

async function createTransaction({ candId, phoneNumber, purposeType, purposeCode, resourceType, resourceId, amount, currency, description, metadata, paymentMethod }) {
  const isCouponPayment = Number(amount || 0) <= 0 && sanitizePromoCodeInput(metadata?.promo_code);
  if (isCouponPayment) {
    const coupon = { code: metadata?.promo_code, expires_at: metadata?.coupon_expires_at || null, _id: metadata?.coupon_id || null };
    return applySuccessfulPayment(await createCouponTransaction({
      candId,
      purposeType,
      purposeCode,
      resourceType,
      resourceId,
      amount: 0,
      currency,
      description,
      phoneNumber,
      metadata,
      coupon,
    }));
  }

  return startCampayPayment({
    transactionPayload: {
      user_cand_id: candId,
      provider: 'camerpay',
      purpose_type: purposeType,
      purpose_code: purposeCode,
      resource_type: resourceType,
      resource_id: resourceId ? String(resourceId) : null,
      amount,
      currency,
      description,
      external_reference: buildTransactionReference(),
      external_id: `cand-${candId}`,
      status: 'pending',
      metadata: metadata || null,
      expires_at: new Date(Date.now() + (30 * 60 * 1000)),
    },
    phoneNumber,
    payerMessage: description.slice(0, 60),
    payeeNote: description.slice(0, 120),
    paymentMethod,
    redirectUrl: metadata?.redirectUrl || metadata?.returnUrl || null,
    onSuccessfulPayment: applySuccessfulPayment,
  });
}

async function refreshTransactionStatus(transaction) {
  if (!transaction) return transaction;
  if (String(transaction.provider || '').toLowerCase() !== 'camerpay') return transaction;
  return refreshCampayPaymentStatus(transaction, applySuccessfulPayment);
}

function buildPlanCards() {
  return Object.values(PLAN_DEFINITIONS);
}

exports.getCatalog = async (_req, res) => {
  return res.json({
    success: true,
    plans: buildPlanCards(),
    center_pricing: {
      create: getCenterPricing('create'),
      join: getCenterPricing('join'),
    },
  });
};

exports.getMySubscription = async (req, res) => {
  try {
    const candId = requireCandidate(req);
    const user = await loadCandidate(candId);
    const recentTransactions = await PaymentTransaction.find({ user_cand_id: candId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({
      success: true,
      subscription: buildSubscriptionResponse(user.subscription),
      plans: buildPlanCards(),
      recent_transactions: recentTransactions.map(buildPaymentSummary),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to load subscription' });
  }
};

exports.startPlanCheckout = async (req, res) => {
  try {
    const candId = requireCandidate(req);
    const user = await loadCandidate(candId);
    const planCode = String(req.body?.planCode || '').trim().toLowerCase();
    const phoneNumber = String(req.body?.phoneNumber || user.phone || '').trim();
    const requestedPaymentMethod = String(req.body?.paymentMethod || 'momo').trim().toLowerCase();
    const paymentMethod = ['momo', 'mtn_momo', 'orange_money'].includes(requestedPaymentMethod) ? requestedPaymentMethod : 'momo';
    const redirectUrl = String(req.body?.redirectUrl || req.body?.returnUrl || '').trim();
    const promoCode = sanitizePromoCodeInput(req.body?.promoCode || req.body?.referralCode);
    const plan = getPlanDefinition(planCode);

    if (!['pro', 'paygo'].includes(plan.code)) {
      return res.status(400).json({ success: false, message: 'Only Pro or PAYGO plans require payment.' });
    }

    const pricing = await applyCouponToAmount({
      promoCode,
      appliesTo: 'subscription',
      baseAmount: plan.price,
      planCode: plan.code,
    });

    const transaction = await createTransaction({
      candId,
      phoneNumber,
      purposeType: 'subscription',
      purposeCode: `plan_${plan.code}`,
      resourceType: 'subscription',
      resourceId: plan.code,
      amount: pricing.finalAmount,
      currency: plan.currency,
      description: `${plan.name} subscription payment`,
      metadata: {
        plan_code: plan.code,
        payment_method: paymentMethod,
        redirectUrl: redirectUrl || null,
        original_amount: plan.price,
        discount_amount: pricing.discountAmount,
        promo_code: pricing.promoCode,
        coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
        coupon_expires_at: pricing.coupon?.expires_at || null,
      },
      paymentMethod,
    });

    return res.json({
      success: true,
      payment: buildPaymentSummary(transaction),
      subscription: buildSubscriptionResponse((await loadCandidate(candId)).subscription),
    });
  } catch (err) {
    const normalized = normalizeCheckoutError(err, 'Failed to start subscription payment');
    return res.status(normalized.statusCode).json({
      success: false,
      message: normalized.message,
      provider_error: normalized.provider_error,
    });
  }
};

async function findMaterial(resourceType, resourceId, program, deptId) {
  const resourceIdValue = String(resourceId || '').trim();
  if (!resourceIdValue) return null;
  const audienceFields = 'audience departments subscription_access material_price title course_title';
  if (resourceType === 'report') {
    const doc = await Report.findOne({ _id: resourceIdValue, program }).select(audienceFields).lean();
    if (!doc) return null;
    const allowed = String(doc.audience || 'GENERAL').toUpperCase() === 'GENERAL'
      || (deptId && (doc.departments || []).map(String).includes(String(deptId)));
    return allowed ? doc : null;
  }
  if (resourceType === 'presentation') {
    const doc = await Presentation.findOne({ _id: resourceIdValue, program }).select(audienceFields).lean();
    if (!doc) return null;
    const audience = String(doc.audience || 'GENERAL').toUpperCase();
    const allowed = audience === 'GENERAL' || (deptId && (doc.departments || []).map(String).includes(String(deptId)));
    return allowed ? doc : null;
  }
  if (resourceType === 'question_paper') {
    const doc = await QuestionPaper.findOne({ _id: resourceIdValue, program }).select(audienceFields).lean();
    if (!doc) return null;
    const audience = String(doc.audience || 'GENERAL').toUpperCase();
    const allowed = audience === 'GENERAL' || (deptId && (doc.departments || []).map(String).includes(String(deptId)));
    return allowed ? doc : null;
  }
  return null;
}

exports.startMaterialCheckout = async (req, res) => {
  try {
    const candId = requireCandidate(req);
    const user = await User.findOne({ cand_id: candId }).select('cand_id phone subscription dpt_id program').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Candidate not found' });

    const resolvedSubscription = resolveSubscription(user.subscription);
    if (resolvedSubscription.plan !== 'paygo') {
      return res.status(403).json({ success: false, message: 'PAYGO access charges are only available for PAYGO candidates.' });
    }

    const resourceType = String(req.body?.resourceType || '').trim().toLowerCase();
    const resourceId = String(req.body?.resourceId || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const promoCode = sanitizePromoCodeInput(req.body?.promoCode || req.body?.referralCode);
    const phoneNumber = String(req.body?.phoneNumber || user.phone || '').trim();
    const material = await findMaterial(resourceType, resourceId, String(user.program || 'HND').toUpperCase(), user.dpt_id);
    if (!material) return res.status(404).json({ success: false, message: 'Material not found or not accessible.' });

    const access = await getMaterialAccessSummary({ user, materialType: resourceType, resourceId, doc: material });
    const paymentDetails = action === 'download' ? access.payment_required?.download : access.payment_required?.preview;
    if (!paymentDetails) {
      return res.status(400).json({ success: false, message: 'This action is already unlocked for the current candidate.' });
    }

    const pricing = await applyCouponToAmount({
      promoCode,
      appliesTo: 'material_access',
      baseAmount: paymentDetails.amount,
    });

    const transaction = await createTransaction({
      candId,
      phoneNumber,
      purposeType: 'material_access',
      purposeCode: paymentDetails.purpose_code,
      resourceType,
      resourceId,
      amount: pricing.finalAmount,
      currency: paymentDetails.currency,
      description: `${action === 'download' ? 'Download' : 'Full preview'} access for ${resourceType.replace('_', ' ')}`,
      metadata: {
        access_minutes: paymentDetails.access_minutes,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        original_amount: paymentDetails.amount,
        discount_amount: pricing.discountAmount,
        promo_code: pricing.promoCode,
        coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
        coupon_expires_at: pricing.coupon?.expires_at || null,
      },
    });

    return res.json({ success: true, payment: buildPaymentSummary(transaction) });
  } catch (err) {
    const normalized = normalizeCheckoutError(err, 'Failed to start material payment');
    return res.status(normalized.statusCode).json({
      success: false,
      message: normalized.message,
      provider_error: normalized.provider_error,
    });
  }
};

exports.startCenterCheckout = async (req, res) => {
  try {
    const candId = requireCandidate(req);
    const user = await User.findOne({ cand_id: candId }).select('cand_id phone subscription program').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Candidate not found' });

    const resolvedSubscription = resolveSubscription(user.subscription);
    if (resolvedSubscription.plan !== 'paygo') {
      return res.status(403).json({ success: false, message: 'Center payment actions are only available to PAYGO candidates.' });
    }

    const action = String(req.body?.action || '').trim().toLowerCase();
    const promoCode = sanitizePromoCodeInput(req.body?.promoCode || req.body?.referralCode);
    const roomId = String(req.body?.roomId || '').trim();
    const phoneNumber = String(req.body?.phoneNumber || user.phone || '').trim();
    const centerPricing = getCenterPricing(action);
    if (!centerPricing) return res.status(400).json({ success: false, message: 'Invalid center action.' });

    if (action === 'join') {
      const room = await ChatRoom.findById(roomId).select('type program').lean();
      if (!room || room.type !== 'center' || String(room.program || 'HND').toUpperCase() !== String(user.program || 'HND').toUpperCase()) {
        return res.status(404).json({ success: false, message: 'Center room not found.' });
      }
    }

    const pricing = await applyCouponToAmount({
      promoCode,
      appliesTo: 'center_access',
      baseAmount: centerPricing.amount,
    });

    const transaction = await createTransaction({
      candId,
      phoneNumber,
      purposeType: 'center_access',
      purposeCode: centerPricing.code,
      resourceType: 'chat_room',
      resourceId: roomId || 'new-center',
      amount: pricing.finalAmount,
      currency: centerPricing.currency,
      description: centerPricing.description,
      metadata: {
        center_action: action,
        original_amount: centerPricing.amount,
        discount_amount: pricing.discountAmount,
        promo_code: pricing.promoCode,
        coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
        coupon_expires_at: pricing.coupon?.expires_at || null,
      },
    });

    return res.json({ success: true, payment: buildPaymentSummary(transaction) });
  } catch (err) {
    const normalized = normalizeCheckoutError(err, 'Failed to start center payment');
    return res.status(normalized.statusCode).json({
      success: false,
      message: normalized.message,
      provider_error: normalized.provider_error,
    });
  }
};

exports.getPaymentStatus = async (req, res) => {
  try {
    const candId = requireCandidate(req);
    const transactionId = String(req.params?.transactionId || '').trim();
    const transaction = await PaymentTransaction.findOne({ _id: transactionId, user_cand_id: candId });
    if (!transaction) return res.status(404).json({ success: false, message: 'Payment transaction not found' });

    await refreshTransactionStatus(transaction);
    const latestUser = await User.findOne({ cand_id: candId }).select('subscription').lean();

    return res.json({
      success: true,
      payment: buildPaymentSummary(transaction),
      subscription: latestUser ? buildSubscriptionResponse(latestUser.subscription) : null,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to get payment status' });
  }
};

exports.consumeCenterAuthorization = async ({ candId, transactionId, action, roomId }) => {
  const transaction = await PaymentTransaction.findOne({ _id: transactionId, user_cand_id: candId });
  if (!transaction) {
    const err = new Error('Payment authorization not found.');
    err.statusCode = 404;
    throw err;
  }

  await refreshTransactionStatus(transaction);
  if (transaction.status !== 'successful') {
    const err = new Error('Payment has not completed yet.');
    err.statusCode = 402;
    throw err;
  }

  if (transaction.authorization_consumed_at) {
    const err = new Error('This payment authorization has already been used.');
    err.statusCode = 409;
    throw err;
  }

  const expectedCode = action === 'create' ? 'center_create' : 'center_join';
  if (transaction.purpose_code !== expectedCode) {
    const err = new Error('Payment authorization does not match this center action.');
    err.statusCode = 400;
    throw err;
  }

  if (action === 'join' && String(transaction.resource_id || '') !== String(roomId || '')) {
    const err = new Error('Payment authorization does not match this center room.');
    err.statusCode = 400;
    throw err;
  }

  transaction.authorization_consumed_at = new Date();
  await transaction.save();
  return transaction;
};

exports.startManualPlanCheckout = async (req, res) => {
  try {
    const candId = requireCandidate(req);
    const user = await loadCandidate(candId);
    const planCode = String(req.body?.planCode || '').trim().toLowerCase();
    const promoCode = sanitizePromoCodeInput(req.body?.promoCode || req.body?.referralCode);
    const paymentProof = String(req.body?.paymentProof || '').trim();
    const plan = getPlanDefinition(planCode);

    if (!['pro', 'paygo'].includes(plan.code)) {
      return res.status(400).json({ success: false, message: 'Only Pro or PAYGO plans require payment.' });
    }

    if (paymentProof.length < 6) {
      return res.status(400).json({ success: false, message: 'Please enter a valid transaction ID or payment message.' });
    }

    const pricing = await applyCouponToAmount({
      promoCode,
      appliesTo: 'subscription',
      baseAmount: plan.price,
      planCode: plan.code,
    });

    const transaction = await PaymentTransaction.create({
      user_cand_id: candId,
      provider: 'manual_momo',
      provider_mode: 'production',
      purpose_type: 'subscription',
      purpose_code: `plan_${plan.code}`,
      resource_type: 'subscription',
      resource_id: plan.code,
      amount: pricing.finalAmount,
      currency: plan.currency,
      phone_number: String(user.phone || user.subscription?.phone_number || '').trim() || 'N/A',
      description: `${plan.name} subscription payment (manual verification)`,
      external_reference: buildTransactionReference(),
      external_id: `cand-${candId}`,
      status: 'pending',
      expires_at: new Date(Date.now() + (30 * 60 * 1000)),
      metadata: {
        plan_code: plan.code,
        payment_method: 'manual_momo',
        original_amount: plan.price,
        discount_amount: pricing.discountAmount,
        promo_code: pricing.promoCode,
        coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
        coupon_expires_at: pricing.coupon?.expires_at || null,
        manual_submission: {
          recipient_number: MANUAL_PAYMENT_RECIPIENT_NUMBER,
          recipient_name: MANUAL_PAYMENT_RECIPIENT_NAME,
          payment_proof: paymentProof,
          submitted_at: new Date(),
          submitted_by: candId,
          verification_status: 'pending_review',
        },
      },
    });

    return res.json({
      success: true,
      payment: buildPaymentSummary(transaction),
      verification: {
        status: 'pending_review',
        recipient_number: MANUAL_PAYMENT_RECIPIENT_NUMBER,
        recipient_name: MANUAL_PAYMENT_RECIPIENT_NAME,
        max_wait_minutes: 10,
        message: 'Payment proof submitted. A developer will verify and activate your plan.',
      },
      subscription: buildSubscriptionResponse((await loadCandidate(candId)).subscription),
    });
  } catch (err) {
    const normalized = normalizeCheckoutError(err, 'Failed to submit manual payment proof');
    return res.status(normalized.statusCode).json({
      success: false,
      message: normalized.message,
      provider_error: normalized.provider_error,
    });
  }
};