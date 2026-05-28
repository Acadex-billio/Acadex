/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Department = require('../models/Department');
const QuestionPaper = require('../models/QuestionPaper');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const ChatRoom = require('../models/ChatRoom');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

if (!MONGO_URI) {
  console.error('[backfill-program-hnd] Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI/DB_URI).');
  process.exit(1);
}

async function backfillModel(model, name) {
  const result = await model.updateMany(
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

  console.log(`[backfill-program-hnd] ${name}: matched=${result.matchedCount} modified=${result.modifiedCount}`);
  return result;
}

async function main() {
  console.log('[backfill-program-hnd] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[backfill-program-hnd] Connected. Starting backfill...');

  try {
    await backfillModel(User, 'users');
    await backfillModel(Department, 'departments');
    await backfillModel(QuestionPaper, 'question_papers');
    await backfillModel(Report, 'reports');
    await backfillModel(Presentation, 'presentations');
    await backfillModel(ChatRoom, 'chat_rooms');

    // Preferred language should align with HND default for legacy users that don't have it.
    const languageResult = await User.updateMany(
      {
        $or: [
          { preferred_language: { $exists: false } },
          { preferred_language: null },
          { preferred_language: '' },
        ],
      },
      {
        $set: { preferred_language: 'en' },
      }
    );
    console.log(`[backfill-program-hnd] users preferred_language: matched=${languageResult.matchedCount} modified=${languageResult.modifiedCount}`);

    console.log('[backfill-program-hnd] Backfill complete.');
  } finally {
    await mongoose.disconnect();
    console.log('[backfill-program-hnd] Disconnected.');
  }
}

main().catch((err) => {
  console.error('[backfill-program-hnd] Failed:', err);
  process.exit(1);
});
