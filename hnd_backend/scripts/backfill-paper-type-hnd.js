/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const QuestionPaper = require('../models/QuestionPaper');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

if (!MONGO_URI) {
  console.error('[backfill-paper-type-hnd] Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI/DB_URI).');
  process.exit(1);
}

async function main() {
  console.log('[backfill-paper-type-hnd] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[backfill-paper-type-hnd] Connected. Running backfill...');

  try {
    const result = await QuestionPaper.updateMany(
      {
        $or: [
          { paper_type: { $exists: false } },
          { paper_type: null },
          { paper_type: '' },
        ],
      },
      {
        $set: { paper_type: 'hnd' },
      }
    );

    console.log(`[backfill-paper-type-hnd] question_papers: matched=${result.matchedCount} modified=${result.modifiedCount}`);
    console.log('[backfill-paper-type-hnd] Backfill complete.');
  } finally {
    await mongoose.disconnect();
    console.log('[backfill-paper-type-hnd] Disconnected.');
  }
}

main().catch((err) => {
  console.error('[backfill-paper-type-hnd] Failed:', err);
  process.exit(1);
});
