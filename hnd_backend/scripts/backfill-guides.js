/**
 * backfill-guides.js
 *
 * Run with: node backfill-guides.js [--dry-run]
 * It will mark existing Report documents that look like guides as `is_guide: true`.
 * Heuristic: title or keywords or description contains the word "guide" (case-insensitive).
 */

const mongoose = require('mongoose');
const Report = require('../models/Report');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
if (!MONGODB_URI) {
  console.error('No MONGODB_URI found in environment. Set it in hnd_backend/.env or pass MONGODB_URI.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n');

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    // Find probable guides
    const regex = /guide/iu;
    const candidates = await Report.find({
      $or: [
        { title: { $regex: regex } },
        { keywords: { $regex: regex } },
        { description: { $regex: regex } },
      ],
    }).lean();

    console.log(`Found ${candidates.length} candidate report(s) that look like guides.`);
    if (candidates.length === 0) {
      console.log('No candidates found. Exiting.');
      process.exit(0);
    }

    candidates.forEach((c) => console.log(`- ${c._id} : ${c.title}`));

    if (dryRun) {
      console.log('\nDry-run complete. No documents were changed.');
      process.exit(0);
    }

    const ids = candidates.map((c) => c._id);
    const res = await Report.updateMany({ _id: { $in: ids } }, { $set: { is_guide: true } });
    console.log('Updated documents:', res.nModified || res.modifiedCount || res.n);

    process.exit(0);
  } catch (err) {
    console.error('Error during backfill:', err);
    process.exit(2);
  }
})();
