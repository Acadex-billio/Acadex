/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const QuestionPaper = require('../models/QuestionPaper');
const { getMaterialDefaults } = require('../utils/subscriptionCatalog');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

if (!MONGO_URI) {
  console.error('[backfill-subscription-access] Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI/DB_URI).');
  process.exit(1);
}

async function backfillUsers() {
  const result = await User.updateMany(
    {
      $or: [
        { subscription: { $exists: false } },
        { subscription: null },
        { 'subscription.plan': { $exists: false } },
      ],
    },
    {
      $set: {
        subscription: {
          plan: 'basic',
          status: 'active',
          activated_at: new Date(),
          expires_at: null,
          last_payment_at: null,
          phone_number: null,
          source_transaction_id: null,
        },
      },
    }
  );
  console.log(`[backfill-subscription-access] users: matched=${result.matchedCount} modified=${result.modifiedCount}`);
}

async function backfillMaterial(model, label, defaults) {
  const result = await model.updateMany(
    {
      $or: [
        { subscription_access: { $exists: false } },
        { subscription_access: null },
      ],
    },
    {
      $set: { subscription_access: defaults },
    }
  );
  console.log(`[backfill-subscription-access] ${label}: matched=${result.matchedCount} modified=${result.modifiedCount}`);
}

async function main() {
  console.log('[backfill-subscription-access] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[backfill-subscription-access] Connected. Starting backfill...');

  try {
    await backfillUsers();
    await backfillMaterial(Report, 'reports', getMaterialDefaults('report'));
    await backfillMaterial(Presentation, 'presentations', getMaterialDefaults('presentation'));
    await backfillMaterial(QuestionPaper, 'question_papers', getMaterialDefaults('question_paper'));
    console.log('[backfill-subscription-access] Backfill complete.');
  } finally {
    await mongoose.disconnect();
    console.log('[backfill-subscription-access] Disconnected.');
  }
}

main().catch((err) => {
  console.error('[backfill-subscription-access] Failed:', err);
  process.exit(1);
});