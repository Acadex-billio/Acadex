/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const AiStudyMaterial = require('../models/AiStudyMaterial');
const QuestionPaper = require('../models/QuestionPaper');
const { normalizeProgramCode } = require('../services/programCatalogService');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;
const execute = process.argv.includes('--execute');

async function main() {
  if (!MONGO_URI) {
    throw new Error('Missing MONGODB_URI, MONGO_URI, or DB_URI.');
  }

  await mongoose.connect(MONGO_URI);
  try {
    const materials = await AiStudyMaterial.find()
      .select('_id question_paper_id program')
      .lean();
    const paperIds = [...new Set(
      materials
        .map((material) => material.question_paper_id)
        .filter(Boolean)
        .map(String)
    )];
    const papers = await QuestionPaper.find({ _id: { $in: paperIds } })
      .select('_id program')
      .lean();
    const programByPaperId = new Map(papers.map((paper) => [String(paper._id), normalizeProgramCode(paper.program || 'HND')]));
    const operations = [];
    let missingPaperCount = 0;

    for (const material of materials) {
      const actualProgram = programByPaperId.get(String(material.question_paper_id));
      if (!actualProgram) {
        missingPaperCount += 1;
        continue;
      }
      if (normalizeProgramCode(material.program) === actualProgram) continue;
      operations.push({
        updateOne: {
          filter: { _id: material._id, program: material.program },
          update: { $set: { program: actualProgram } },
        },
      });
    }

    console.log(`[backfill-ai-study-material-programs] mismatched=${operations.length} missingPapers=${missingPaperCount}`);
    if (!execute) {
      console.log('[backfill-ai-study-material-programs] Dry run only. Re-run with --execute to apply changes.');
      return;
    }

    let modifiedCount = 0;
    for (let index = 0; index < operations.length; index += 500) {
      const result = await AiStudyMaterial.bulkWrite(operations.slice(index, index + 500), { ordered: false });
      modifiedCount += result.modifiedCount;
    }
    console.log(`[backfill-ai-study-material-programs] modified=${modifiedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('[backfill-ai-study-material-programs] Failed:', error.message);
  process.exitCode = 1;
});
