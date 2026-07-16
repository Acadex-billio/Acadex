/**
 * Backfill script to add presentation description text to all existing presentations
 */
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: rootEnvPath, quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true, override: true });

const Presentation = require('../models/Presentation');

const DESCRIPTION_TEXT = 'An elegant design, simple and classic, acceptible for professionalism and a captivative layout, good color choices and well calculates slide contents';

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
        $or: [
          { description: { $exists: false } },
          { description: null },
          { description: '' },
        ],
      },
      {
        $set: { description: DESCRIPTION_TEXT },
      }
    );

    console.log('[Backfill] Update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });

    if (result.modifiedCount > 0) {
      console.log(`[Backfill] Successfully backfilled ${result.modifiedCount} existing presentations`);
    } else {
      console.log('[Backfill] No presentations required a backfill.');
    }

    await mongoose.disconnect();
    console.log('[Backfill] Completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('[Backfill] Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
};

main();
