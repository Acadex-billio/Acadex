const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const PaymentTransaction = require('../models/PaymentTransaction');
const ReferralProgram = require('../models/ReferralProgram');
const ReferralLedger = require('../models/ReferralLedger');
const ReferralRedemption = require('../models/ReferralRedemption');

const PURCHASE_TYPES = new Set([
  'subscription',
  'material_access',
  'center_access',
  'tutorship_booking',
  'concours_partnership',
]);

const isEligiblePurchase = (transaction) => (
  Boolean(transaction) &&
  String(transaction.status || '').toLowerCase() === 'successful' &&
  Number(transaction.amount || 0) > 0
);

const buildAwardIdempotencyKey = ({ referredUser, transaction, rule, recipient }) => (
  rule.trigger === 'first_purchase'
    ? `first:${referredUser._id}:${recipient._id}`
    : `purchase:${transaction._id}:${transaction.purpose_type}:${recipient._id}`
);

const getProgram = async () => ReferralProgram.findOne({ key: 'default' }).lean();

const ensureReferralCode = async (user) => {
  if (user.referral_code) return user.referral_code;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    user.referral_code = crypto.randomBytes(5).toString('hex').toUpperCase();
    try {
      await user.save();
      return user.referral_code;
    } catch (error) {
      if (error?.code !== 11000 || !error?.keyPattern?.referral_code) throw error;
      user.referral_code = undefined;
    }
  }

  throw new Error('Unable to allocate a unique referral code.');
};

const applyAward = async ({ referredUser, transaction, rule, recipient, points }) => {
  if (!recipient || points <= 0) return false;

  const key = buildAwardIdempotencyKey({ referredUser, transaction, rule, recipient });
  const session = await mongoose.startSession();
  try {
    let created = false;
    await session.withTransaction(async () => {
      const existing = await ReferralLedger.exists({ idempotency_key: key }).session(session);
      if (existing) return;

      await ReferralLedger.create([{
        idempotency_key: key,
        candidate_id: recipient._id,
        referred_user_id: referredUser._id,
        transaction_id: transaction._id,
        rule_code: rule.code,
        entry_type: 'award',
        points,
        description: rule.trigger === 'first_purchase'
          ? `First successful purchase by ${referredUser.name}`
          : `Successful ${transaction.purpose_type.replace(/_/g, ' ')} purchase by ${referredUser.name}`,
      }], { session });

      const increments = { referral_points_balance: points, referral_points_earned: points };
      await User.updateOne({ _id: recipient._id }, { $inc: increments }, { session });
      created = true;
    });
    return created;
  } catch (error) {
    if (error?.code === 11000 && await ReferralLedger.exists({ idempotency_key: key })) return false;
    throw error;
  } finally {
    await session.endSession();
  }
};

const awardSuccessfulPurchase = async (transaction) => {
  if (!isEligiblePurchase(transaction)) return;

  const referredUser = await User.findOne({ cand_id: transaction.user_cand_id, role: 'candidate' });
  if (!referredUser?.referred_by) return;

  const program = await getProgram();
  if (!program?.is_active) return;

  const activeRules = (Array.isArray(program.rules) ? program.rules : [])
    .filter((rule) => rule?.is_active && (Number(rule.referrer_points) > 0 || Number(rule.referred_points) > 0));

  let isFirstPurchase = false;
  {
    const successfulPurchases = await PaymentTransaction.find({
      user_cand_id: referredUser.cand_id,
      status: 'successful',
      amount: { $gt: 0 },
    })
      .sort({ completed_at: 1, _id: 1 })
      .select('_id')
      .limit(1)
      .lean();
    const firstTransactionId = successfulPurchases[0]?._id;
    if (firstTransactionId && String(firstTransactionId) === String(transaction._id)) {
      const firstPurchaseClaim = await User.findOneAndUpdate(
        {
          _id: referredUser._id,
          $or: [
            { referral_first_purchase_transaction_id: null },
            { referral_first_purchase_transaction_id: transaction._id },
          ],
        },
        { $set: { referral_first_purchase_transaction_id: transaction._id } },
        { new: true, projection: { _id: 1 } }
      );
      isFirstPurchase = Boolean(firstPurchaseClaim);
    } else if (firstTransactionId && !referredUser.referral_first_purchase_transaction_id) {
      await User.updateOne(
        { _id: referredUser._id, referral_first_purchase_transaction_id: null },
        { $set: { referral_first_purchase_transaction_id: firstTransactionId } }
      );
    }
  }

  if (!activeRules.length) return;
  const referrer = await User.findById(referredUser.referred_by).select('_id').lean();
  if (!referrer) return;

  for (const rule of activeRules) {
    const isFirstRule = rule.trigger === 'first_purchase';
    if (isFirstRule && !isFirstPurchase) continue;
    if (!isFirstRule && (rule.trigger !== 'each_purchase' || rule.purchase_type !== transaction.purpose_type)) continue;

    await applyAward({
      referredUser,
      transaction,
      rule,
      recipient: referrer,
      points: Number(rule.referrer_points || 0),
    });
    await applyAward({
      referredUser,
      transaction,
      rule,
      recipient: referredUser,
      points: Number(rule.referred_points || 0),
    });
  }
};

const createRedemption = async ({ candidate, benefit }) => {
  const session = await mongoose.startSession();
  try {
    let redemption;
    await session.withTransaction(async () => {
      const updatedCandidate = await User.findOneAndUpdate(
        {
          _id: candidate._id,
          $expr: {
            $gte: [
              { $ifNull: ['$referral_points_balance', 0] },
              benefit.points_required,
            ],
          },
        },
        { $inc: { referral_points_balance: -benefit.points_required } },
        { new: true, session }
      );
      if (!updatedCandidate) {
        const error = new Error('You do not have enough points for this benefit.');
        error.statusCode = 400;
        throw error;
      }

      [redemption] = await ReferralRedemption.create([{
        candidate_id: candidate._id,
        benefit_code: benefit.code,
        benefit_name: benefit.name,
        points_spent: benefit.points_required,
      }], { session });

      await ReferralLedger.create([{
        idempotency_key: `redemption:${redemption._id}`,
        candidate_id: candidate._id,
        referred_user_id: candidate._id,
        redemption_id: redemption._id,
        rule_code: benefit.code,
        entry_type: 'redemption',
        points: benefit.points_required,
        description: `Redeemed ${benefit.name}`,
      }], { session });
    });
    return redemption;
  } finally {
    await session.endSession();
  }
};

const reviewRedemption = async ({ redemptionId, decision, reviewer, note }) => {
  const session = await mongoose.startSession();
  try {
    let redemption;
    await session.withTransaction(async () => {
      redemption = await ReferralRedemption.findOneAndUpdate(
        { _id: redemptionId, status: 'pending' },
        {
          $set: {
            status: decision,
            reviewed_by: reviewer,
            reviewed_at: new Date(),
            review_note: note,
          },
        },
        { new: true, session }
      );
      if (!redemption) {
        const error = new Error('Pending redemption not found.');
        error.statusCode = 404;
        throw error;
      }

      if (decision === 'rejected') {
        await ReferralLedger.create([{
          idempotency_key: `refund:${redemption._id}`,
          candidate_id: redemption.candidate_id,
          referred_user_id: redemption.candidate_id,
          redemption_id: redemption._id,
          rule_code: redemption.benefit_code,
          entry_type: 'refund',
          points: redemption.points_spent,
          description: `Points returned for rejected ${redemption.benefit_name} redemption`,
        }], { session });
        await User.updateOne(
          { _id: redemption.candidate_id },
          { $inc: { referral_points_balance: redemption.points_spent } },
          { session }
        );
      }
    });
    return redemption;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  PURCHASE_TYPES,
  isEligiblePurchase,
  buildAwardIdempotencyKey,
  getProgram,
  ensureReferralCode,
  awardSuccessfulPurchase,
  createRedemption,
  reviewRedemption,
};
