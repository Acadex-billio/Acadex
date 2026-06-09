#!/usr/bin/env node
require('dotenv').config();
const connectDB = require('../config/database');
const User = require('../models/User');
const PaymentTransaction = require('../models/PaymentTransaction');

const PLAN_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

function parseArgs() {
  const args = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i += 1) {
    const value = raw[i];
    if (value === '--email' && raw[i + 1]) {
      args.email = raw[i + 1];
      i += 1;
    } else if (value === '--candId' && raw[i + 1]) {
      args.candId = raw[i + 1];
      i += 1;
    } else if (value === '--plan' && raw[i + 1]) {
      args.plan = raw[i + 1];
      i += 1;
    } else if (!args._) {
      args._ = [value];
    } else {
      args._.push(value);
    }
  }
  return args;
}

(async () => {
  const args = parseArgs();
  const email = String(args.email || args._?.[0] || 'hndplatform@gmail.com').trim();
  const plan = String(args.plan || 'paygo').trim().toLowerCase();

  if (!email && !args.candId) {
    console.error('Please provide a user identifier with --email or --candId.');
    process.exit(1);
  }

  try {
    await connectDB();
    console.log('Connected to MongoDB — repairing candidate subscription');

    const userQuery = args.candId ? { cand_id: String(args.candId).trim() } : { email };
    const user = await User.findOne(userQuery).lean();
    if (!user) {
      console.error(`Candidate not found for ${args.candId ? `cand_id=${args.candId}` : `email=${email}`}`);
      process.exit(1);
    }

    console.log(`Found candidate: cand_id=${user.cand_id} email=${user.email || 'N/A'}`);

    const transaction = await PaymentTransaction.findOne({
      user_cand_id: user.cand_id,
      purpose_type: 'subscription',
      purpose_code: plan === 'paygo' ? 'plan_paygo' : 'plan_pro',
      status: 'successful',
    }).sort({ createdAt: -1 }).lean();

    if (!transaction) {
      console.error(`No successful ${plan.toUpperCase()} subscription transaction found for this candidate.`);
      process.exit(1);
    }

    const now = new Date();
    const subscription = {
      plan,
      status: 'active',
      activated_at: now,
      expires_at: new Date(now.getTime() + PLAN_DURATION_MS),
      last_payment_at: transaction.completed_at || now,
      phone_number: transaction.phone_number || user.phone || null,
      source_transaction_id: transaction._id,
    };

    await User.updateOne({ _id: user._id }, { $set: { subscription } });
    console.log(`Updated subscription to ${plan.toUpperCase()} for cand_id=${user.cand_id}`);
    console.log('Subscription payload:', subscription);
    process.exit(0);
  } catch (err) {
    console.error('Repair script failed:', err.message || err);
    process.exit(2);
  }
})();
