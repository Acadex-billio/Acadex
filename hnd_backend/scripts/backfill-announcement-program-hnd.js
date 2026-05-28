/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const Announcement = require('../models/Announcement');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

if (!MONGO_URI) {
  console.error('[backfill-announcement-program-hnd] Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI/DB_URI).');
  process.exit(1);
}

async function main() {
  console.log('[backfill-announcement-program-hnd] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[backfill-announcement-program-hnd] Connected. Starting backfill...');

  try {
    const result = await Announcement.updateMany(
      {
        $or: [
          { program: { $exists: false } },
          { program: null },
          { program: '' },
        ],
      },
      {
        $set: { program: 'HND' },
      }
    );

    console.log(
      `[backfill-announcement-program-hnd] announcements: matched=${result.matchedCount} modified=${result.modifiedCount}`
    );
    console.log('[backfill-announcement-program-hnd] Backfill complete.');
  } finally {
    await mongoose.disconnect();
    console.log('[backfill-announcement-program-hnd] Disconnected.');
  }
}

main().catch((err) => {
  console.error('[backfill-announcement-program-hnd] Failed:', err);
  process.exit(1);
});
