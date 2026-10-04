const crypto = require('crypto');
const User = require('../models/User');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const QuestionPaper = require('../models/QuestionPaper');
const AiStudyMaterial = require('../models/AiStudyMaterial');
const ChatRoom = require('../models/ChatRoom');
const PaymentTransaction = require('../models/PaymentTransaction');
const paymentGrantService = require('../services/paymentGrantService');
const { getPlanDefinitions, getPlanDefinition, getCenterPricing, getCatalogSnapshot } = require('../utils/subscriptionCatalog');
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
const logger = require('../utils/logger');
const {
  validatePaymentAmountAndCurrency,
  validateTransactionReference,
} = require('../services/paymentValidationService');

const MANUAL_PAYMENT_RECIPIENT_NUMBER = '678507737';
const MANUAL_PAYMENT_RECIPIENT_NAME = 'TEBEI NOEL FORKANG';

const PROGRAM_GROUPS = {
  ENGLISH: ['HND', 'BACHELOR', 'MASTERS'],
  FRENCH: ['BTS', 'LICENCE', 'MASTER'],
};

const getProgramGroup = (program) => {
  const prog = String(program || 'HND').toUpperCase();
  if (PROGRAM_GROUPS.ENGLISH.includes(prog)) return 'ENGLISH';
  if (PROGRAM_GROUPS.FRENCH.includes(prog)) return 'FRENCH';
  return null;
};

const getProgramsInGroup = (program) => {
  const group = getProgramGroup(program);
  return group ? PROGRAM_GROUPS[group] : [String(program || 'HND').toUpperCase()];
};

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
  const summary = {
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
    provider_reference: transaction.provider_reference || null,
    external_reference: transaction.external_reference || null,
    access_minutes: Number(transaction?.metadata?.access_minutes || 0) || null,
    payment_action: transaction?.metadata?.action || null,
    createdAt: transaction.createdAt,
    completed_at: transaction.completed_at,
  };
  
  // Include material_name for material access payments
  if (transaction.purpose_type === 'material_access' && transaction.metadata?.material_name) {
    summary.material_name = transaction.metadata.material_name;
  }
  
  return summary;
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

async function createTransaction({ candId, phoneNumber, purposeType, purposeCode, resourceType, resourceId, amount, currency, description, metadata, paymentMethod }) {
  validatePaymentAmountAndCurrency({ amount, currency });

  const idempotencyKey = String(metadata?.idempotency_key || '').trim();
  if (idempotencyKey) {
    const existing = await PaymentTransaction.findOne({
      user_cand_id: candId,
      idempotency_key: idempotencyKey,
    });
    if (existing) {
      logger.info('payment.idempotency.hit', {
        user_cand_id: candId,
        idempotency_key: idempotencyKey,
        transaction_id: String(existing._id),
      });
      return existing;
    }
  }

  const isCouponPayment = Number(amount || 0) <= 0 && sanitizePromoCodeInput(metadata?.promo_code);
  if (isCouponPayment) {
    const coupon = { code: metadata?.promo_code, expires_at: metadata?.coupon_expires_at || null, _id: metadata?.coupon_id || null };
    return paymentGrantService.applySuccessfulPayment(await createCouponTransaction({
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

  if (Number(amount || 0) <= 0) {
    const transaction = await PaymentTransaction.create({
      user_cand_id: candId,
      provider: 'free',
      provider_mode: 'production',
      purpose_type: purposeType,
      purpose_code: purposeCode,
      resource_type: resourceType,
      resource_id: resourceId ? String(resourceId) : null,
      amount: 0,
      currency,
      phone_number: String(phoneNumber || '').trim(),
      description,
      external_reference: validateTransactionReference(buildTransactionReference()),
      external_id: `cand-${candId}`,
      status: 'successful',
      provider_response: { source: 'free' },
      metadata: metadata || null,
      initiated_at: new Date(),
      completed_at: new Date(),
      expires_at: null,
      idempotency_key: idempotencyKey || null,
    });

    // Immediately apply successful payment side-effects
    return paymentGrantService.applySuccessfulPayment(transaction);
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
      external_reference: validateTransactionReference(buildTransactionReference()),
      external_id: `cand-${candId}`,
      status: 'pending',
      metadata: metadata || null,
      expires_at: new Date(Date.now() + (30 * 60 * 1000)),
      idempotency_key: idempotencyKey || null,
    },
    phoneNumber,
    payerMessage: description.slice(0, 60),
    payeeNote: description.slice(0, 120),
    paymentMethod,
    redirectUrl: metadata?.redirectUrl || metadata?.returnUrl || null,
    onSuccessfulPayment: paymentGrantService.applySuccessfulPayment,
  });
}

async function refreshTransactionStatus(transaction) {
  if (!transaction) return transaction;
  if (String(transaction.provider || '').toLowerCase() !== 'camerpay') return transaction;
  return refreshCampayPaymentStatus(transaction, paymentGrantService.applySuccessfulPayment);
}

async function buildPlanCards() {
  const definitions = await getPlanDefinitions();
  return Object.values(definitions || {});
}

exports.getCatalog = async (_req, res) => {
  const plans = await buildPlanCards();
  return res.json({
    success: true,
    plans,
    center_pricing: {
      create: {
        basic: await getCenterPricing('create', 'basic'),
        pro: await getCenterPricing('create', 'pro'),
        paygo: await getCenterPricing('create', 'paygo'),
        'full-package': await getCenterPricing('create', 'full-package'),
      },
      join: {
        basic: await getCenterPricing('join', 'basic'),
        pro: await getCenterPricing('join', 'pro'),
        paygo: await getCenterPricing('join', 'paygo'),
        'full-package': await getCenterPricing('join', 'full-package'),
      },
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
    const pricingSnapshot = await getCatalogSnapshot();

    return res.json({
      success: true,
      subscription: await buildSubscriptionResponse(user.subscription),
      plans: await buildPlanCards(),
      pricing: {
        plans: pricingSnapshot.planDefinitions,
        materials: pricingSnapshot.materialDefaults,
        center: pricingSnapshot.centerPricing,
        ai_study_mode: pricingSnapshot.aiStudyMode,
        candidate_project_upload: pricingSnapshot.candidateProjectUploadPricing,
        concours_partnership: pricingSnapshot.concoursPartnership,
      },
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
    const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '').trim();
    const promoCode = sanitizePromoCodeInput(req.body?.promoCode || req.body?.referralCode);
    const plan = await getPlanDefinition(planCode);

    if (!['pro', 'paygo', 'full-package'].includes(plan.code)) {
      return res.status(400).json({ success: false, message: 'Only Pro, PAYGO, or Full Package plans require payment.' });
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
        idempotency_key: idempotencyKey || null,
      },
      paymentMethod,
    });

    return res.json({
      success: true,
      payment: buildPaymentSummary(transaction),
      subscription: await buildSubscriptionResponse((await loadCandidate(candId)).subscription),
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
  const audienceFields = 'audience departments title course_title';
  if (resourceType === 'report') {
    const doc = await Report.findOne({ _id: resourceIdValue, program }).select(audienceFields).lean();
    if (!doc) return null;
    const allowed = String(doc.audience || 'GENERAL').toUpperCase() === 'GENERAL'
      || (deptId && (doc.departments || []).map(String).includes(String(deptId)));
    return allowed ? doc : null;
  }
  if (resourceType === 'presentation') {
    const allowedPrograms = getProgramsInGroup(program);
    const doc = await Presentation.findOne({ _id: resourceIdValue, program: { $in: allowedPrograms } }).select(audienceFields).lean();
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
  if (resourceType === 'ai_mode') {
    const normalizedProgram = String(program || 'HND').toUpperCase() === 'BTS' ? 'BTS' : 'HND';
    const doc = await AiStudyMaterial.findOne({ _id: resourceIdValue, program: normalizedProgram, is_active: true })
      .select('paper_title program departments createdAt')
      .lean();
    if (!doc) return null;
    const allowed = !Array.isArray(doc.departments) || doc.departments.length === 0
      || (deptId && doc.departments.map(String).includes(String(deptId)));
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
    if (resourceType === 'ai_mode' && action !== 'preview') {
      return res.status(400).json({ success: false, message: 'AI Study Mode checkout only supports session access.' });
    }
    const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '').trim();
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

    // Extract material name for payment feedback
    const materialName = material.title || material.course_title || `${resourceType.replace('_', ' ')}`;
    const materialYear = material.hnd_year || new Date(material.createdAt).getFullYear();

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
        material_name: materialName,
        material_year: materialYear,
        original_amount: paymentDetails.amount,
        discount_amount: pricing.discountAmount,
        promo_code: pricing.promoCode,
        coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
        coupon_expires_at: pricing.coupon?.expires_at || null,
        idempotency_key: idempotencyKey || null,
      },
      paymentMethod: 'momo',
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
    if (resolvedSubscription.plan === 'full-package') {
      return res.json({
        success: true,
        free_access: true,
        message: 'Full Package members already have center access included.',
        payment: {
          amount: 0,
          currency: 'XAF',
          status: 'free',
          purpose_code: 'center_access_full_package',
        },
      });
    }
    if (resolvedSubscription.plan !== 'paygo') {
      return res.status(403).json({ success: false, message: 'Center payment actions are only available to PAYGO candidates.' });
    }

    const action = String(req.body?.action || '').trim().toLowerCase();
    const promoCode = sanitizePromoCodeInput(req.body?.promoCode || req.body?.referralCode);
    const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '').trim();
    const roomId = String(req.body?.roomId || '').trim();
    const phoneNumber = String(req.body?.phoneNumber || user.phone || '').trim();
    const centerPricing = await getCenterPricing(action, resolvedSubscription.plan || 'paygo');
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
        idempotency_key: idempotencyKey || null,
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
    const rawId = String(req.params?.transactionId || '').trim();

    // Try ObjectId lookup only when valid, otherwise fallback to provider/external refs
    let transaction = null;
    if (rawId) {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(rawId)) {
        transaction = await PaymentTransaction.findOne({ _id: rawId, user_cand_id: candId });
      }

      if (!transaction) {
        transaction = await PaymentTransaction.findOne({
          user_cand_id: candId,
          $or: [
            { provider_reference: rawId },
            { external_reference: rawId },
          ],
        });
      }
    }

    if (!transaction) return res.status(404).json({ success: false, message: 'Payment transaction not found' });

    try {
      await refreshTransactionStatus(transaction);
    } catch (refreshErr) {
      // log and continue — don't surface provider transient errors to client as 500
      logger.warn('Failed to refresh transaction status during status read', { transactionId: String(transaction._id), error: String(refreshErr?.message || refreshErr) });
    }

    const latestUser = await User.findOne({ cand_id: candId }).select('subscription').lean();

    return res.json({
      success: true,
      payment: buildPaymentSummary(transaction),
      subscription: latestUser ? await buildSubscriptionResponse(latestUser.subscription) : null,
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
    const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '').trim();
    const paymentProof = String(req.body?.paymentProof || '').trim();
    const plan = await getPlanDefinition(planCode);

    if (!['pro', 'paygo', 'full-package'].includes(plan.code)) {
      return res.status(400).json({ success: false, message: 'Only Pro, PAYGO, or Full Package plans require payment.' });
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
      idempotency_key: idempotencyKey || null,
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
      subscription: await buildSubscriptionResponse((await loadCandidate(candId)).subscription),
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