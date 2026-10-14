/* eslint-disable no-console */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true, override: true });

const User = require('../models/User');
const PaymentTransaction = require('../models/PaymentTransaction');
const ReferralLedger = require('../models/ReferralLedger');
const referralService = require('../services/referralService');

const apply = process.argv.includes('--apply');
const getRegistrationKey = (referredId, recipientId) => (
  `registration:${referredId}:${recipientId}`
);

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI, MONGO_URI, or DB_URI.');

  await mongoose.connect(mongoUri);
  try {
    const program = await referralService.getProgram();
    if (!program?.is_active) throw new Error('Referral program is not active; no rewards were changed.');

    const rule = (program.rules || []).find((item) => (
      item.is_active && item.trigger === 'registration'
    ));
    if (!rule) throw new Error('No active registration reward rule is configured; no rewards were changed.');

    const referredCandidates = await User.find({
      role: 'candidate',
      referred_by: { $ne: null },
    })
      .select('_id cand_id name referred_by')
      .lean();
    const nonSelfReferrals = referredCandidates.filter((candidate) => (
      String(candidate._id) !== String(candidate.referred_by)
    ));
    const selfReferralsExcluded = referredCandidates.length - nonSelfReferrals.length;

    const purchases = await PaymentTransaction.distinct('user_cand_id', {
      user_cand_id: { $in: nonSelfReferrals.map((candidate) => candidate.cand_id) },
      status: 'successful',
      amount: { $gt: 0 },
    });
    const purchasers = new Set(purchases.map(String));
    const eligibleReferrals = nonSelfReferrals.filter((candidate) => !purchasers.has(candidate.cand_id));

    const awardKeys = eligibleReferrals.flatMap((candidate) => [
      getRegistrationKey(candidate._id, candidate.referred_by),
      getRegistrationKey(candidate._id, candidate._id),
    ]);
    const existingAwards = await ReferralLedger.find({ idempotency_key: { $in: awardKeys } })
      .select('idempotency_key')
      .lean();
    const existingKeys = new Set(existingAwards.map((award) => award.idempotency_key));
    const missingReferrerAwards = eligibleReferrals.filter((candidate) => (
      !existingKeys.has(getRegistrationKey(candidate._id, candidate.referred_by))
    ));
    const missingReferredAwards = eligibleReferrals.filter((candidate) => (
      !existingKeys.has(getRegistrationKey(candidate._id, candidate._id))
    ));
    const referrerPoints = Number(rule.referrer_points || 0);
    const referredPoints = Number(rule.referred_points || 0);

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      ruleCode: rule.code,
      referrerPointsPerReferral: referrerPoints,
      referredCandidatePointsPerReferral: referredPoints,
      referredCandidatesWithNoSuccessfulPurchase: eligibleReferrals.length,
      missingReferrerAwards: missingReferrerAwards.length,
      missingReferredCandidateAwards: missingReferredAwards.length,
      referrerPointsToAward: missingReferrerAwards.length * referrerPoints,
      referredCandidatePointsToAward: missingReferredAwards.length * referredPoints,
      selfReferralsExcluded,
    }, null, 2));

    if (!apply) {
      console.log('Dry run complete; no documents changed. Pass --apply to award the missing points.');
      return;
    }

    let completed = 0;
    const failures = [];
    for (const candidate of eligibleReferrals) {
      try {
        await referralService.awardRegistration({
          referrerId: candidate.referred_by,
          referredUser: candidate,
        });
        completed += 1;
      } catch (error) {
        failures.push({ candidateId: candidate.cand_id, error: error?.message || String(error) });
      }
    }

    console.log(JSON.stringify({
      referralRecordsProcessed: completed,
      failures,
    }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(`[backfill-referral-registration-rewards] Failed: ${error.message}`);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
