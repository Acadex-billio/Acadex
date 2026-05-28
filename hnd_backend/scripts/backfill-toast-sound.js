/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

if (!MONGO_URI) {
  console.error('[backfill-toast-sound] Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI/DB_URI).');
  process.exit(1);
}

async function main() {
  console.log('[backfill-toast-sound] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[backfill-toast-sound] Connected. Starting backfill...');

  try {
    const result = await User.updateMany(
      {
        $or: [
          { allow_toast_sound: { $exists: false } },
          { allow_toast_sound: null },
        ],
      },
      {
        $set: { allow_toast_sound: true },
      }
    );

    console.log(`[backfill-toast-sound] users: matched=${result.matchedCount} modified=${result.modifiedCount}`);
    console.log('[backfill-toast-sound] Backfill complete.');
  } finally {
    await mongoose.disconnect();
    console.log('[backfill-toast-sound] Disconnected.');
  }
}

main().catch((err) => {
  console.error('[backfill-toast-sound] Failed:', err);
  process.exit(1);
});
