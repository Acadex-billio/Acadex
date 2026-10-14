const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const User = require('../models/User');
const ReferralProgram = require('../models/ReferralProgram');
const ReferralLedger = require('../models/ReferralLedger');
const ReferralRedemption = require('../models/ReferralRedemption');
const ReferralBenefitUnlock = require('../models/ReferralBenefitUnlock');
const QuestionPaper = require('../models/QuestionPaper');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const referralService = require('../services/referralService');
const { uploadFile } = require('../utils/s3Uploader');
const logger = require('../utils/logger');

const PURCHASE_TYPES = [...referralService.PURCHASE_TYPES];
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const MATERIAL_MODELS = {
  question_paper: QuestionPaper,
  report: Report,
  presentation: Presentation,
};
const APPAREL_REWARDS = {
  t_shirt: {
    code: 'gift-t-shirt',
    name: 'Acadex T-shirt',
    image_url: '/referral-tshirt.png',
  },
  shirt: {
    code: 'gift-shirt',
    name: 'Acadex shirt',
    image_url: '/referral-shirt.png',
  },
};
const DEFAULT_PROGRAM = {
  key: 'default',
  is_active: false,
  title: 'Acadex Referral Program',
  description: '',
  rules: [],
  benefits: Object.entries(APPAREL_REWARDS).map(([apparel_type, reward]) => ({
    ...reward,
    description: '',
    mode: 'automatic',
    points_required: 500,
    reward_type: 'apparel_gift',
    apparel_type,
    is_active: false,
  })),
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
    await referralService.ensureBenefitUnlocks(candidate._id);
    const [program, referrals, referralCount, ledger, redemptions, benefitUnlocks] = await Promise.all([
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
        .select('benefit_code benefit_name benefit_image_url points_spent status review_note createdAt reviewed_at')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      ReferralBenefitUnlock.find({ candidate_id: candidate._id }).lean(),
    ]);

    const unlocks = new Map(benefitUnlocks.map((unlock) => [unlock.benefit_code, unlock]));

    const benefits = (program?.benefits || [])
      .filter((benefit) => benefit.is_active || unlocks.has(benefit.code))
      .map((benefit) => {
        const unlock = unlocks.get(benefit.code);
        const pointsRemaining = benefit.mode === 'automatic'
          ? Math.max(0, benefit.points_required - Number(candidate.referral_points_earned || 0))
          : Math.max(0, benefit.points_required - Number(candidate.referral_points_balance || 0));
        return {
          ...benefit,
          unlocked: benefit.mode === 'automatic' && Boolean(unlock),
          unlock_status: unlock?.status || null,
          gift_number: unlock?.gift_number || null,
          points_remaining: pointsRemaining,
          can_redeem: benefit.mode === 'redeem' && pointsRemaining === 0,
        };
      });

    return res.json({
      success: true,
      candidate_name: candidate.name,
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
    const settings = program || DEFAULT_PROGRAM;
    const benefits = Array.isArray(settings.benefits) ? [...settings.benefits] : [];
    for (const [apparel_type, reward] of Object.entries(APPAREL_REWARDS)) {
      if (!benefits.some((benefit) => benefit.apparel_type === apparel_type)) {
        benefits.push({
          ...reward,
          description: '',
          mode: 'automatic',
          points_required: 500,
          reward_type: 'apparel_gift',
          apparel_type,
          is_active: false,
        });
      }
    }
    return res.json({ success: true, program: { ...settings, benefits } });
  } catch (error) {
    return responseError(res, error, 'Failed to load referral program settings.');
  }
};

exports.getMaterialCatalog = async (_req, res) => {
  try {
    const [questionPapers, reports, presentations] = await Promise.all([
      QuestionPaper.find().select('course_title hnd_year academic_session').sort({ createdAt: -1 }).limit(500).lean(),
      Report.find().select('title academic_session').sort({ createdAt: -1 }).limit(500).lean(),
      Presentation.find().select('title academic_session').sort({ createdAt: -1 }).limit(500).lean(),
    ]);
    const materials = [
      ...questionPapers.map((material) => ({
        id: String(material._id),
        type: 'question_paper',
        title: [material.course_title, material.hnd_year, material.academic_session].filter(Boolean).join(' - '),
      })),
      ...reports.map((material) => ({ id: String(material._id), type: 'report', title: material.title })),
      ...presentations.map((material) => ({ id: String(material._id), type: 'presentation', title: material.title })),
    ];
    return res.json({ success: true, materials });
  } catch (error) {
    return responseError(res, error, 'Failed to load available materials.');
  }
};

exports.uploadBenefitImage = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'Choose a JPG or PNG image to upload.' });
    }
    const extension = path.extname(req.file.originalname).toLowerCase();
    const filename = `referral-benefit-${crypto.randomBytes(16).toString('hex')}${extension}`;
    const uploaded = await uploadFile(req.file.buffer, filename, req.file.mimetype, 'referral-benefits');
    return res.status(201).json({ success: true, image_url: uploaded.url });
  } catch (error) {
    return responseError(res, error, 'Failed to upload benefit image.');
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
      const eventKey = trigger === 'each_purchase' ? `each_purchase:${purchaseType}` : trigger;
      if (
        !CODE_PATTERN.test(code) ||
        seenRuleCodes.has(code) ||
        seenRuleEvents.has(eventKey) ||
        !['registration', 'first_purchase', 'each_purchase'].includes(trigger) ||
        (trigger === 'each_purchase' && !PURCHASE_TYPES.includes(purchaseType)) ||
        (trigger !== 'each_purchase' && purchaseType) ||
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
    const benefits = await Promise.all(body.benefits.map(async (benefit) => {
      const code = String(benefit?.code || '').trim();
      const benefitDescription = String(benefit?.description || '').trim();
      const mode = String(benefit?.mode || '').trim();
      const rewardType = String(benefit?.reward_type || 'benefit').trim();
      const apparelType = benefit?.apparel_type ? String(benefit.apparel_type).trim() : null;
      const name = rewardType === 'apparel_gift'
        ? (APPAREL_REWARDS[apparelType]?.name || '')
        : String(benefit?.name || '').trim();
      const imageUrl = String(benefit?.image_url || '').trim();
      const materialType = String(benefit?.material_type || '').trim();
      const materialId = String(benefit?.material_id || '').trim();
      const accessType = String(benefit?.access_type || 'download').trim();
      const points = Number(benefit?.points_required);
      if (imageUrl && rewardType !== 'apparel_gift') {
        let parsedImageUrl;
        try {
          parsedImageUrl = new URL(imageUrl);
        } catch (_) {
          parsedImageUrl = null;
        }
        if (!parsedImageUrl || !['http:', 'https:'].includes(parsedImageUrl.protocol)) {
          throw Object.assign(new Error(`Invalid image URL for benefit: ${code || '(missing code)'}.`), { statusCode: 400 });
        }
      }
      if (!['benefit', 'material_access', 'apparel_gift'].includes(rewardType)) {
        throw Object.assign(new Error(`Invalid reward type for benefit: ${code || '(missing code)'}.`), { statusCode: 400 });
      }
      if (rewardType === 'apparel_gift') {
        const fixedReward = APPAREL_REWARDS[apparelType];
        if (!fixedReward || mode !== 'automatic' || code !== fixedReward.code) {
          throw Object.assign(new Error(`Invalid built-in apparel reward: ${code || '(missing code)'}.`), { statusCode: 400 });
        }
      }
      if (rewardType === 'material_access') {
        const MaterialModel = MATERIAL_MODELS[materialType];
        if (
          mode !== 'automatic' ||
          !MaterialModel ||
          !mongoose.Types.ObjectId.isValid(materialId) ||
          !['preview', 'download'].includes(accessType)
        ) {
          throw Object.assign(new Error(`Select a valid material and automatic unlock for benefit: ${code || '(missing code)'}.`), { statusCode: 400 });
        }
        const material = await MaterialModel.findById(materialId).select('_id title course_title').lean();
        if (!material) {
          throw Object.assign(new Error(`Selected material was not found for benefit: ${code || '(missing code)'}.`), { statusCode: 400 });
        }
        benefit.material_title = material.title || material.course_title || 'Material';
      }
      if (
        !CODE_PATTERN.test(code) ||
        seenBenefitCodes.has(code) ||
        seenRuleCodes.has(code) ||
        !name || name.length > 120 || benefitDescription.length > 1000 ||
        !['automatic', 'redeem'].includes(mode) ||
        (rewardType === 'material_access' && mode !== 'automatic') ||
        !Number.isSafeInteger(points) || points < 1 || points > 1000000 ||
        (benefit?.is_active !== undefined && typeof benefit.is_active !== 'boolean') ||
        imageUrl.length > 2000
      ) {
        throw Object.assign(new Error(`Invalid or duplicate benefit: ${code || '(missing code)'}.`), { statusCode: 400 });
      }
      seenBenefitCodes.add(code);
      return {
        code,
        name,
        description: benefitDescription,
        mode,
        points_required: points,
        reward_type: rewardType,
        apparel_type: rewardType === 'apparel_gift' ? apparelType : null,
        image_url: rewardType === 'apparel_gift'
          ? APPAREL_REWARDS[apparelType].image_url
          : imageUrl || null,
        material_type: rewardType === 'material_access' ? materialType : null,
        material_id: rewardType === 'material_access' ? materialId : null,
        material_title: rewardType === 'material_access' ? benefit.material_title : null,
        access_type: rewardType === 'material_access' ? accessType : 'download',
        is_active: benefit.is_active !== false,
      };
    }));

    for (const [apparelType, reward] of Object.entries(APPAREL_REWARDS)) {
      if (!benefits.some((benefit) => benefit.apparel_type === apparelType && benefit.code === reward.code)) {
        throw Object.assign(new Error(`The built-in ${reward.name} reward must remain configured.`), { statusCode: 400 });
      }
    }

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
