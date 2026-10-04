/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const Report = require('../models/Report');
const Presentation = require('../models/Presentation');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;
const APPLY_CHANGES = process.argv.includes('--apply');
const LEGACY_FIELDS = { material_price: '', subscription_access: '' };
const LEGACY_FILTER = {
  $or: [
    { material_price: { $exists: true } },
    { subscription_access: { $exists: true } },
  ],
};

const cleanupCollection = async (model, label) => {
  const collection = model.collection;
  const matching = await collection.countDocuments(LEGACY_FILTER);
  if (!APPLY_CHANGES) {
    console.log(`[legacy-material-pricing] ${label}: ${matching} documents contain obsolete pricing fields (dry run)`);
    return;
  }

  const result = await collection.updateMany(LEGACY_FILTER, { $unset: LEGACY_FIELDS });
  console.log(`[legacy-material-pricing] ${label}: matched=${result.matchedCount} modified=${result.modifiedCount}`);
};

const main = async () => {
  if (!MONGO_URI) {
    throw new Error('Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI/DB_URI).');
  }

  await mongoose.connect(MONGO_URI);
  try {
    await cleanupCollection(Report, 'reports');
    await cleanupCollection(Presentation, 'presentations');
    if (!APPLY_CHANGES) {
      console.log('[legacy-material-pricing] No changes made. Re-run with --apply to remove the fields.');
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('[legacy-material-pricing] Cleanup failed:', error.message);
  process.exitCode = 1;
});