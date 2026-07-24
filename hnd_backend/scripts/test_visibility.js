const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Presentation = require('../models/Presentation');

const PROGRAM_GROUPS = {
  ENGLISH: ['HND', 'BACHELOR', 'MASTERS'],
  FRENCH: ['BTS', 'LICENCE', 'MASTER'],
};

const getProgramGroup = (program) => {
  const prog = String(program || 'HND').toUpperCase();
  if (PROGRAM_GROUPS.ENGLISH.includes(prog)) return 'ENGLISH';
  if (PROGRAM_GROUPS.FRENCH.includes(prog)) return 'FRENCH';
  return null;
};

const getUserProgramsInGroup = (userProgram) => {
  const group = getProgramGroup(userProgram);
  return group === 'ENGLISH' ? PROGRAM_GROUPS.ENGLISH : PROGRAM_GROUPS.FRENCH;
};

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DBNAME || undefined });
  console.log('Connected to MongoDB');

  const englishPrograms = PROGRAM_GROUPS.ENGLISH;
  for (const userProg of englishPrograms) {
    const userProgramGroup = getUserProgramsInGroup(userProg);
    const accessQuery = { program: { $in: userProgramGroup }, audience: 'GENERAL' };

    const total = await Presentation.countDocuments(accessQuery);
    const samples = await Presentation.find(accessQuery).limit(5).lean();

    console.log('\n=== User program:', userProg, ' (group:', userProgramGroup.join(', '), ') ===');
    console.log('Total visible presentations (audience=GENERAL):', total);
    if (samples.length) {
      console.log('Sample titles:');
      samples.forEach((s, i) => {
        console.log(`${i + 1}. [${s.program}] ${s.title} - audience:${s.audience}`);
      });
    } else {
      console.log('No sample presentations found for this query');
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(2);
});
