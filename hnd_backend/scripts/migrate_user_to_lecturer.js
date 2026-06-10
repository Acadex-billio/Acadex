'use strict';

require('dotenv').config({ quiet: true });
const connectDB = require('../config/database');
const User = require('../models/User');

const TARGET_CAND_ID = process.env.TARGET_CAND_ID || 'CAND48056';

async function run() {
  await connectDB();

  console.log(`Migrating user ${TARGET_CAND_ID} to lecturer...`);
  try {
    const before = await User.findOne({ cand_id: TARGET_CAND_ID }).lean();
    if (!before) {
      console.error('User not found for cand_id', TARGET_CAND_ID);
      process.exit(3);
    }

    console.log('Before:', { cand_id: before.cand_id, role: before.role, program: before.program });

    const updated = await User.findOneAndUpdate(
      { cand_id: TARGET_CAND_ID },
      {
        $set: { role: 'lecturer', program: 'LECTURER' },
        $unset: { student: '' },
      },
      { new: true }
    ).lean();

    console.log('After:', { cand_id: updated.cand_id, role: updated.role, program: updated.program });
  } catch (err) {
    console.error('Error migrating user:', err.message || err);
    process.exit(4);
  }

  process.exit(0);
}

run();
