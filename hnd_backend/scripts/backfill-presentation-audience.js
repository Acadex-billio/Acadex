/**
 * Backfill script to add audience field to all presentations
 * Sets all existing presentations to GENERAL audience
 */
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: rootEnvPath, quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true, override: true });

const Presentation = require('../models/Presentation');

const main = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hnd_platform';
    console.log('[Backfill] Connecting to MongoDB:', mongoUri.replace(/:[^:]*@/, ':****@'));
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    console.log('[Backfill] Connected to MongoDB');

    const result = await Presentation.updateMany(
      {
        audience: { $exists: false }
      },
      {
        $set: {
          audience: 'GENERAL',
          departments: []
        }
      }
    );

    console.log('[Backfill] Update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });

    if (result.modifiedCount > 0) {
      console.log(`[Backfill] Successfully updated ${result.modifiedCount} presentations to GENERAL audience`);
    } else {
      console.log('[Backfill] No presentations needed updating (all already have audience field)');
    }

    const total = await Presentation.countDocuments({});
    const withAudience = await Presentation.countDocuments({ audience: { $exists: true } });
    
    console.log('[Backfill] Final statistics:', {
      totalPresentations: total,
      withAudience,
    });

    await mongoose.disconnect();
    console.log('[Backfill] Script completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('[Backfill] Error:', err.message);
    console.error('[Backfill] Stack:', err.stack);
    process.exit(1);
  }
};

main();
