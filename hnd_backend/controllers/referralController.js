const mongoose = require('mongoose');
const User = require('../models/User');
const ReferralProgram = require('../models/ReferralProgram');
const ReferralLedger = require('../models/ReferralLedger');
const ReferralRedemption = require('../models/ReferralRedemption');
const referralService = require('../services/referralService');
const logger = require('../utils/logger');

const PURCHASE_TYPES = [...referralService.PURCHASE_TYPES];
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const DEFAULT_PROGRAM = {
  key: 'default',
  is_active: false,
  title: 'Acadex Referral Program',
  description: '',
  rules: [],
  benefits: [],
};

const responseError = (res, error, fallback) => {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) logger.error('referral.request.error', { error: error?.message || error, stack: error?.stack });
  return res.status(status).json({ success: false, message: status === 500 ? fallback : error.message });
};

const getCandidate = (req) => User.findOne({ cand_id: req.user?.cand_id, role: 'candidate' });

exports.getCandidateProgram = async (req, res) => {
  try {
    const candidate = await getCandidate(req);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate account not found.' });
    const referralCode = await referralService.ensureReferralCode(candidate);
    const [program, referrals, referralCount, ledger, redemptions] = await Promise.all([
      referralService.getProgram(),
      User.find({ referred_by: candidate._id, role: 'candidate' })
        .select('name createdAt referral_first_purchase_transaction_id')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      User.countDocuments({ referred_by: candidate._id, role: 'candidate' }),
      ReferralLedger.find({ candidate_id: candidate._id })
        .select('entry_type points description createdAt')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      ReferralRedemption.find({ candidate_id: candidate._id })
        .select('benefit_code benefit_name points_spent status review_note createdAt reviewed_at')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    ]);

    const benefits = (program?.is_active ? program.benefits : [])
      .filter((benefit) => benefit.is_active)
      .map((benefit) => ({
        ...benefit,
        unlocked: benefit.mode === 'automatic' && Number(candidate.referral_points_earned || 0) >= benefit.points_required,
        can_redeem: benefit.mode === 'redeem' && Number(candidate.referral_points_balance || 0) >= benefit.points_required,
      }));

    return res.json({
      success: true,
      program: {
        active: Boolean(program?.is_active),
        title: program?.title || DEFAULT_PROGRAM.title,
        description: program?.description || '',
        rules: program?.is_active ? (program.rules || []).filter((rule) => rule.is_active) : [],
      },
      referral_code: referralCode,
      referral_link: `${String(process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '')}/register?ref=${encodeURIComponent(referralCode)}`,
      points: {
        balance: Number(candidate.referral_points_balance || 0),
        lifetime_earned: Number(candidate.referral_points_earned || 0),
      },
      referrals: referrals.map((referred) => ({
        name: referred.name,
        registered_at: referred.createdAt,
        qualified: Boolean(referred.referral_first_purchase_transaction_id),
      })),
      referral_count: referralCount,
      benefits,
      ledger,
      redemptions,
    });
  } catch (error) {
    return responseError(res, error, 'Failed to load referral program.');
  }
};

exports.createCandidateRedemption = async (req, res) => {
  try {
    const candidate = await getCandidate(req);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate account not found.' });
    const code = String(req.body?.benefitCode || '').trim();
    if (!CODE_PATTERN.test(code)) return res.status(400).json({ success: false, message: 'A valid benefit code is required.' });

    const program = await referralService.getProgram();
    const benefit = (program?.is_active ? program.benefits : [])
      ?.find((item) => item.is_active && item.mode === 'redeem' && item.code === code);
    if (!benefit) return res.status(404).json({ success: false, message: 'This benefit is not available for redemption.' });

    const redemption = await referralService.createRedemption({ candidate, benefit });
    return res.status(201).json({ success: true, redemption });
  } catch (error) {
    return responseError(res, error, 'Failed to request benefit redemption.');
  }
};

exports.getAdminProgram = async (_req, res) => {
  try {
    const program = await referralService.getProgram();
    return res.json({ success: true, program: program || DEFAULT_PROGRAM });
  } catch (error) {
    return responseError(res, error, 'Failed to load referral program settings.');
  }
};

exports.updateAdminProgram = async (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body.is_active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'is_active must be a boolean.' });
    }
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    if (!title || title.length > 120 || description.length > 1000) {
      return res.status(400).json({ success: false, message: 'Enter a title up to 120 characters and a description up to 1000 characters.' });
    }
    if (!Array.isArray(body.rules) || body.rules.length > 50 || !Array.isArray(body.benefits) || body.benefits.length > 50) {
      return res.status(400).json({ success: false, message: 'Rules and benefits must be arrays of at most 50 entries.' });
    }

    const seenRuleCodes = new Set();
    const seenRuleEvents = new Set();
    const rules = body.rules.map((rule) => {
      const code = String(rule?.code || '').trim();
      const trigger = String(rule?.trigger || '').trim();
      const purchaseType = rule?.purchase_type ? String(rule.purchase_type).trim() : null;
      const referrerPoints = Number(rule?.referrer_points);
      const referredPoints = Number(rule?.referred_points);
      const eventKey = trigger === 'first_purchase' ? 'first_purchase' : `each_purchase:${purchaseType}`;
      if (
        !CODE_PATTERN.test(code) ||
        seenRuleCodes.has(code) ||
        seenRuleEvents.has(eventKey) ||
        !['first_purchase', 'each_purchase'].includes(trigger) ||
        (trigger === 'each_purchase' && !PURCHASE_TYPES.includes(purchaseType)) ||
        (trigger === 'first_purchase' && purchaseType) ||
        !Number.isSafeInteger(referrerPoints) || referrerPoints < 0 || referrerPoints > 1000000 ||
        !Number.isSafeInteger(referredPoints) || referredPoints < 0 || referredPoints > 1000000 ||
        (!referrerPoints && !referredPoints) ||
        (rule?.is_active !== undefined && typeof rule.is_active !== 'boolean')
      ) {
        throw Object.assign(new Error(`Invalid or duplicate reward rule: ${code || '(missing code)'}.`), { statusCode: 400 });
      }
      seenRuleCodes.add(code);
      seenRuleEvents.add(eventKey);
      return { code, trigger, purchase_type: purchaseType, referrer_points: referrerPoints, referred_points: referredPoints, is_active: rule.is_active !== false };
    });

    const seenBenefitCodes = new Set();
    const benefits = body.benefits.map((benefit) => {
      const code = String(benefit?.code || '').trim();
      const name = String(benefit?.name || '').trim();
      const benefitDescription = String(benefit?.description || '').trim();
      const mode = String(benefit?.mode || '').trim();
      const points = Number(benefit?.points_required);
      if (
        !CODE_PATTERN.test(code) ||
        seenBenefitCodes.has(code) ||
        seenRuleCodes.has(code) ||
        !name || name.length > 120 || benefitDescription.length > 1000 ||
        !['automatic', 'redeem'].includes(mode) ||
        !Number.isSafeInteger(points) || points < 1 || points > 1000000 ||
        (benefit?.is_active !== undefined && typeof benefit.is_active !== 'boolean')
      ) {
        throw Object.assign(new Error(`Invalid or duplicate benefit: ${code || '(missing code)'}.`), { statusCode: 400 });
      }
      seenBenefitCodes.add(code);
      return { code, name, description: benefitDescription, mode, points_required: points, is_active: benefit.is_active !== false };
    });

    const program = await ReferralProgram.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          is_active: body.is_active,
          title,
          description,
          rules,
          benefits,
          updated_by: String(req.user?.cand_id || ''),
        },
        $setOnInsert: { key: 'default' },
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    return res.json({ success: true, program });
  } catch (error) {
    return responseError(res, error, 'Failed to save referral program settings.');
  }
};

exports.listAdminRedemptions = async (req, res) => {
  try {
    const status = String(req.query?.status || 'pending');
    if (!['pending', 'fulfilled', 'rejected', 'all'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid redemption status filter.' });
    }
    const query = status === 'all' ? {} : { status };
    const redemptions = await ReferralRedemption.find(query)
      .populate('candidate_id', 'cand_id name email')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, redemptions });
  } catch (error) {
    return responseError(res, error, 'Failed to load benefit redemptions.');
  }
};

exports.reviewAdminRedemption = async (req, res) => {
  try {
    const { redemptionId } = req.params;
    const decision = String(req.body?.decision || '');
    const note = String(req.body?.note || '').trim();
    if (!mongoose.Types.ObjectId.isValid(redemptionId)) {
      return res.status(400).json({ success: false, message: 'Invalid redemption ID.' });
    }
    if (!['fulfilled', 'rejected'].includes(decision) || note.length > 500) {
      return res.status(400).json({ success: false, message: 'A valid decision and note of at most 500 characters are required.' });
    }

    const redemption = await referralService.reviewRedemption({
      redemptionId,
      decision,
      reviewer: String(req.user?.cand_id || ''),
      note,
    });
    return res.json({ success: true, redemption });
  } catch (error) {
    return responseError(res, error, 'Failed to review benefit redemption.');
  }
};
