/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const QuestionPaper = require('../models/QuestionPaper');
const InternshipTopic = require('../models/InternshipTopic');
const {
  normalizeIds,
  normalizeSession,
  buildDuplicateKey,
  normalizeText,
} = require('../utils/materialDuplicate');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n');

const idsFor = (doc) => Array.isArray(doc.departments)
  ? doc.departments
  : (Array.isArray(doc.department_ids) ? doc.department_ids : []);

const identityFor = (doc, type) => {
  const departments = normalizeIds(idsFor(doc));
  const session = normalizeSession(doc.academic_session);

  if (type === 'report') {
    return buildDuplicateKey([
      'report', doc.title, doc.writer_names, doc.program, session, departments,
      doc.is_guide ? 'guide' : 'standard',
    ]);
  }
  if (type === 'presentation') {
    return buildDuplicateKey([
      'presentation', doc.title, doc.presenter_name, doc.program, session,
      departments, doc.report_id || '',
    ]);
  }
  if (type === 'question-paper') {
    return buildDuplicateKey([
      'question-paper', doc.paper_type, doc.course_title,
      doc.uploaded_by || doc.institution_name, doc.program, doc.hnd_year, session,
      doc.institution_name, doc.region, doc.semester, departments,
    ]);
  }
  const author = doc.normalized_author || doc.created_by || '';
  return buildDuplicateKey([
    'internship-topic', doc.title, author, doc.program, session, departments,
  ]);
};

async function backfill(model, type, projection) {
  const docs = await model.find({ $or: [{ duplicate_key: { $exists: false } }, { duplicate_key: null }] })
    .select(projection)
    .lean();
  const groups = new Map();

  for (const doc of docs) {
    const key = identityFor(doc, type);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }

  const collisions = [...groups.values()].filter((items) => items.length > 1);
  console.log(`${type}: ${docs.length} missing identity keys, ${collisions.length} collision groups`);
  collisions.forEach((items) => console.log(`  collision: ${items.map((item) => item._id).join(', ')}`));

  if (!dryRun) {
    for (const doc of docs) {
      const update = { duplicate_key: identityFor(doc, type) };
      if (type === 'internship-topic' && !doc.normalized_author) {
        update.normalized_author = normalizeText(doc.created_by) || null;
      }
      await model.updateOne({ _id: doc._id, duplicate_key: { $in: [null, undefined] } }, { $set: update });
    }
  }
}

async function main() {
  if (!MONGO_URI) throw new Error('Missing MONGODB_URI, MONGO_URI, or DB_URI');
  await mongoose.connect(MONGO_URI);
  try {
    await backfill(Report, 'report', 'title writer_names program academic_session departments is_guide');
    await backfill(Presentation, 'presentation', 'title presenter_name program academic_session departments report_id');
    await backfill(QuestionPaper, 'question-paper', 'course_title paper_type uploaded_by institution_name program hnd_year academic_session departments region semester');
    await backfill(InternshipTopic, 'internship-topic', 'title created_by normalized_author program academic_session department_ids');
    console.log(dryRun ? 'Dry run complete; no documents changed.' : 'Material identity backfill complete.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[backfill-material-identity] Failed:', err.message);
  process.exitCode = 1;
});