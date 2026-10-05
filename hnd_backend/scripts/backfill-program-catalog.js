'use strict';

const { ensureDefaultPrograms, listPrograms } = require('../services/programCatalogService');

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;
  if (!mongoUri) {
    console.error('[backfill-program-catalog] Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI/DB_URI).');
    process.exit(1);
  }

  const mongoose = require('mongoose');
  const connectDB = require('../config/database');

  try {
    console.log('[backfill-program-catalog] Connecting to MongoDB...');
    await connectDB();
    console.log('[backfill-program-catalog] Connected. Syncing program catalog...');
    await ensureDefaultPrograms();
    const programs = await listPrograms({ includeInactive: true });
    console.log(`[backfill-program-catalog] programs: ${programs.length} catalog entries synced.`);
    console.log('[backfill-program-catalog] Backfill complete.');
  } catch (err) {
    console.error('[backfill-program-catalog] Failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
