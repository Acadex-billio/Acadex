'use strict';

const mongoose = require('mongoose');
const QuestionPaper = require('../models/QuestionPaper');
const AiStudyMaterial = require('../models/AiStudyMaterial');
const AiStudySession = require('../models/AiStudySession');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const materialAccessService = require('../services/materialAccessService');
const { getMaterialAccessSummary, resolveSubscription } = require('../utils/subscriptionUtils');
const { getCandidateMaterialProgramCodes } = require('../services/candidateMaterialVisibilityService');
const { findProgram, normalizeProgramCode } = require('../services/programCatalogService');
const { getS3ObjectStream } = require('../utils/s3Uploader');
const { streamToBuffer } = require('../utils/streamLimits');
const {
  getStudyQuestionCount,
  canUseFreeStudyTrial,
  selectStudyQuestionIds,
  hasUsedPaperTrial,
} = require('../services/aiStudySessionPolicy');

const PAPERS_DIRECTORY = path.resolve(__dirname, '../uploads/papers');
const MAX_STUDY_PAPER_BYTES = 15 * 1024 * 1024;

const parseMcqText = (text) => {
  const input = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!input) return [];

  const blocks = input.match(/Q\s*\d+\s*[-:].*?(?=(?:\n\s*Q\s*\d+\s*[-:])|$)/gis) || [];
  const parsed = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const questionText = String(lines[0] || '').replace(/^Q\s*\d+\s*[-:]\s*/i, '').trim();
    if (!questionText) continue;

    const options = { A: '', B: '', C: '', D: '' };
    for (const line of lines) {
      const opt = line.match(/^([A-D])\s*[-.)]\s*(.+)$/i);
      if (opt) options[opt[1].toUpperCase()] = String(opt[2] || '').trim();
    }

    const correctLine = lines.find((line) => /^CORRECT\s*ANSWER\s*[:\-]?/i.test(line)) || '';
    const correctOptionMatch = correctLine.match(/\b([A-D])\b/i);
    const correctOption = correctOptionMatch ? correctOptionMatch[1].toUpperCase() : '';

    const reasonIndex = lines.findIndex((line) => /^reason\s*[:\-]?/i.test(line));
    let reason = '';
    if (reasonIndex >= 0) {
      const reasonStart = lines[reasonIndex].replace(/^reason\s*[:\-]?\s*/i, '').trim();
      const reasonRest = lines.slice(reasonIndex + 1).join(' ').trim();
      reason = `${reasonStart}${reasonRest ? ` ${reasonRest}` : ''}`.trim();
    }

    if (!options.A || !options.B || !options.C || !options.D || !correctOption) {
      continue;
    }

    parsed.push({
      question_text: questionText,
      option_a: options.A,
      option_b: options.B,
      option_c: options.C,
      option_d: options.D,
      correct_option: correctOption,
      correct_answer_text: options[correctOption] || '',
      reason,
    });
  }

  return parsed;
};

const findQuestionById = (material, questionId) => {
  const id = String(questionId || '');
  return material.questions.find((q) => String(q._id) === id) || null;
};

const buildQuestionPayload = (question, index, total) => ({
  number: index + 1,
  total,
  questionId: String(question._id),
  text: question.question_text,
  options: [
    { key: 'A', text: question.option_a },
    { key: 'B', text: question.option_b },
    { key: 'C', text: question.option_c },
    { key: 'D', text: question.option_d },
  ],
});

exports.getStudyPaperSource = async (req, res) => {
  try {
    const paperId = String(req.params?.paperId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(paperId)) {
      return res.status(400).json({ success: false, message: 'Valid question paper is required.' });
    }

    const paper = await QuestionPaper.findById(paperId).select('paper_file course_title').lean();
    if (!paper) {
      return res.status(404).json({ success: false, message: 'Question paper not found.' });
    }

    const source = String(paper.paper_file || '').trim();
    if (!source) {
      return res.status(404).json({ success: false, message: 'Question paper file is unavailable.' });
    }

    let buffer;
    if (/^https?:\/\//i.test(source)) {
      const configuredBase = String(process.env.AWS_S3_URL || '').replace(/\/+$/, '');
      if (!configuredBase) {
        return res.status(503).json({ success: false, message: 'Question paper storage is not configured.' });
      }

      const sourceUrl = new URL(source);
      const baseUrl = new URL(configuredBase);
      const basePath = baseUrl.pathname.replace(/\/+$/, '');
      if (
        sourceUrl.origin !== baseUrl.origin
        || (basePath && sourceUrl.pathname !== basePath && !sourceUrl.pathname.startsWith(`${basePath}/`))
      ) {
        return res.status(400).json({ success: false, message: 'Question paper storage location is invalid.' });
      }

      const keyPath = sourceUrl.pathname.slice(basePath.length).replace(/^\/+/, '');
      const key = decodeURIComponent(keyPath);
      if (!key || path.extname(key).toLowerCase() !== '.pdf') {
        return res.status(400).json({ success: false, message: 'Only PDF question papers can be extracted.' });
      }
      const sourceStream = getS3ObjectStream(key);
      sourceStream.once('missing', () => {
        sourceStream.destroy(Object.assign(new Error('Question paper file is unavailable.'), {
          code: 'MATERIAL_FILE_NOT_FOUND',
        }));
      });
      buffer = await streamToBuffer(sourceStream, { maxBytes: MAX_STUDY_PAPER_BYTES });
    } else {
      const filename = path.basename(source.replace(/\\/g, '/'));
      const localPath = path.resolve(PAPERS_DIRECTORY, filename);
      if (
        !filename
        || path.extname(filename).toLowerCase() !== '.pdf'
        || !localPath.startsWith(`${PAPERS_DIRECTORY}${path.sep}`)
      ) {
        return res.status(400).json({ success: false, message: 'Only PDF question papers can be extracted.' });
      }
      const stats = await fs.promises.stat(localPath);
      if (stats.size > MAX_STUDY_PAPER_BYTES) {
        return res.status(413).json({ success: false, message: 'Question paper exceeds the 15 MB extraction limit.' });
      }
      buffer = await fs.promises.readFile(localPath);
    }

    if (buffer.length > MAX_STUDY_PAPER_BYTES) {
      return res.status(413).json({ success: false, message: 'Question paper exceeds the 15 MB extraction limit.' });
    }
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return res.status(400).json({ success: false, message: 'The selected question paper is not a valid PDF.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(buffer);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'NoSuchKey' || error.code === 'MATERIAL_FILE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Question paper file is unavailable.' });
    }
    if (error.code === 'PREVIEW_FILE_TOO_LARGE') {
      return res.status(413).json({ success: false, message: 'Question paper exceeds the 15 MB extraction limit.' });
    }
    console.error('[AI Study] getStudyPaperSource error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load question paper for extraction.' });
  }
};

exports.createStudyMaterial = async (req, res) => {
  try {
    const createdBy = String(req.user?.cand_id || '').trim();
    if (!createdBy) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const questionPaperId = String(req.body?.questionPaperId || '').trim();
    const numberOfQuestions = Number(req.body?.numberOfQuestions || 0);
    const mcqText = String(req.body?.mcqText || '');

    if (!questionPaperId || !mongoose.Types.ObjectId.isValid(questionPaperId)) {
      return res.status(400).json({ success: false, message: 'Valid question paper is required.' });
    }
    if (!mcqText.trim()) {
      return res.status(400).json({ success: false, message: 'Question text is required.' });
    }

    const paper = await QuestionPaper.findById(questionPaperId)
      .select('course_title program departments')
      .lean();
    if (!paper) {
      return res.status(404).json({ success: false, message: 'Question paper not found.' });
    }
    const paperProgram = normalizeProgramCode(paper.program || 'HND');
    if (!await findProgram(paperProgram)) {
      return res.status(400).json({ success: false, message: 'The question paper program is no longer active.' });
    }

    const parsedQuestions = parseMcqText(mcqText);
    if (!parsedQuestions.length) {
      return res.status(400).json({ success: false, message: 'No valid MCQ question blocks were found.' });
    }

    if (numberOfQuestions > 0 && numberOfQuestions !== parsedQuestions.length) {
      return res.status(400).json({
        success: false,
        message: `Number of questions mismatch: expected ${numberOfQuestions}, parsed ${parsedQuestions.length}.`,
      });
    }

    const material = await AiStudyMaterial.create({
      question_paper_id: paper._id,
      paper_title: paper.course_title,
      program: paperProgram,
      departments: Array.isArray(paper.departments) ? paper.departments : [],
      question_count: parsedQuestions.length,
      questions: parsedQuestions,
      created_by: createdBy,
      is_active: true,
    });

    return res.status(201).json({
      success: true,
      material: {
        materialId: String(material._id),
        paperTitle: material.paper_title,
        questionCount: material.question_count,
        program: material.program,
        createdAt: material.createdAt,
      },
    });
  } catch (error) {
    console.error('[AI Study] createStudyMaterial error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create study material.' });
  }
};

exports.listStudyMaterialsForDeveloper = async (req, res) => {
  try {
    const program = normalizeProgramCode(req.query?.program || 'HND');
    if (!await findProgram(program)) {
      return res.status(400).json({ success: false, message: 'Select an active program.' });
    }
    const docs = await AiStudyMaterial.find({ program })
      .sort({ createdAt: -1 })
      .select('paper_title question_count created_by createdAt is_active')
      .lean();

    return res.json({
      success: true,
      materials: docs.map((doc) => ({
        materialId: String(doc._id),
        paperTitle: doc.paper_title,
        questionCount: doc.question_count,
        createdBy: doc.created_by,
        createdAt: doc.createdAt,
        isActive: Boolean(doc.is_active),
      })),
    });
  } catch (error) {
    console.error('[AI Study] listStudyMaterialsForDeveloper error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to list study materials.' });
  }
};

exports.listStudyPapersForCandidate = async (req, res) => {
  try {
    const candidateId = String(req.user?.cand_id || '').trim();
    if (!candidateId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const [visiblePrograms, candidate] = await Promise.all([
      getCandidateMaterialProgramCodes(req.user?.program),
      User.findOne({ cand_id: candidateId })
        .select('subscription ai_study_free_trial_paper_ids')
        .lean(),
    ]);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found.' });
    }

    const filter = {
      is_active: true,
      program: { $in: visiblePrograms },
      question_count: { $gte: 5 },
    };

    const materials = await AiStudyMaterial.find(filter)
      .sort({ createdAt: -1 })
      .select('paper_title question_count question_paper_id')
      .lean();

    const plan = resolveSubscription(candidate.subscription).plan;
    const supportsFreeQuestions = ['basic', 'paygo'].includes(plan);
    const canPayForFullPaper = plan === 'paygo';
    const trialPaperIds = candidate.ai_study_free_trial_paper_ids || [];

    return res.json({
      success: true,
      papers: materials.map((item) => {
        const freeTrialUsed = hasUsedPaperTrial(trialPaperIds, item.question_paper_id);
        return {
          materialId: String(item._id),
          questionPaperId: String(item.question_paper_id || ''),
          paperTitle: item.paper_title,
          questionCount: item.question_count,
          freeTrialAvailable: supportsFreeQuestions && !freeTrialUsed,
          freeTrialUsed,
          canPayForFullPaper,
        };
      }),
    });
  } catch (error) {
    console.error('[AI Study] listStudyPapersForCandidate error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load study papers.' });
  }
};

exports.startStudySession = async (req, res) => {
  try {
    const candidateId = String(req.user?.cand_id || '').trim();
    const visiblePrograms = await getCandidateMaterialProgramCodes(req.user?.program);
    const materialId = String(req.body?.materialId || '').trim();

    if (!candidateId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!materialId || !mongoose.Types.ObjectId.isValid(materialId)) {
      return res.status(400).json({ success: false, message: 'Valid study material is required.' });
    }

    const material = await AiStudyMaterial.findOne({
      _id: materialId,
      program: { $in: visiblePrograms },
    }).lean();
    if (!material || !material.is_active) {
      return res.status(404).json({ success: false, message: 'Study material not found.' });
    }
    const questionIds = (material.questions || []).map((q) => q._id).filter(Boolean);
    const questionCount = getStudyQuestionCount(req.body?.questionCount, questionIds.length);
    if (!questionCount) {
      return res.status(400).json({
        success: false,
        message: `Choose a whole number of questions between 5 and ${questionIds.length}.`,
      });
    }

    const [candidate, activeAiAccess] = await Promise.all([
      User.findOne({ cand_id: candidateId })
        .select('cand_id subscription ai_study_free_trial_paper_ids')
        .lean(),
      materialAccessService.hasActiveAccess(candidateId, String(materialId), 'ai_mode', 'preview'),
    ]);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found.' });
    }

    const plan = resolveSubscription(candidate.subscription).plan;
    const hasAiAccess = activeAiAccess || ['pro', 'full-package'].includes(plan);
    let isFreeTrial = canUseFreeStudyTrial({
      plan,
      questionCount,
      hasAiAccess,
      freeTrialUsed: hasUsedPaperTrial(candidate.ai_study_free_trial_paper_ids, material.question_paper_id),
    });

    let trialClaimed = false;
    if (isFreeTrial) {
      const claimedCandidate = await User.findOneAndUpdate(
        {
          cand_id: candidateId,
          ai_study_free_trial_paper_ids: { $ne: material.question_paper_id },
        },
        { $addToSet: { ai_study_free_trial_paper_ids: material.question_paper_id } },
        { new: true }
      ).select('_id').lean();
      trialClaimed = Boolean(claimedCandidate);
      isFreeTrial = trialClaimed;
    }

    if (!hasAiAccess && !isFreeTrial) {
      if (plan === 'paygo') {
        const access = await getMaterialAccessSummary({
          user: candidate,
          materialType: 'ai_mode',
          resourceId: materialId,
          doc: material,
        });
        if (access.payment_required?.preview) {
          const requirement = access.payment_required.preview;
          return res.status(402).json({
            success: false,
            code: 'PAYMENT_REQUIRED',
            message: 'Pay to unlock full AI Study Mode access for this paper.',
            payment_requirement: {
              title: 'Unlock full paper in AI Study Mode',
              message: `Pay ${requirement.amount} ${requirement.currency} to answer more than the 5 free questions on this paper.`,
              action: 'preview',
              amount: requirement.amount,
              currency: requirement.currency,
              resource_type: 'ai_mode',
              resource_id: String(materialId),
              purpose_code: requirement.purpose_code,
              access_minutes: requirement.access_minutes,
            },
          });
        }
        return res.status(403).json({
          success: false,
          code: 'PLAN_UPGRADE_REQUIRED',
          message: 'Full-paper AI Study Mode payment is not configured. Upgrade your plan to answer more than the 5 free questions.',
        });
      }

      return res.status(403).json({
        success: false,
        code: 'PLAN_UPGRADE_REQUIRED',
        message: hasUsedPaperTrial(candidate.ai_study_free_trial_paper_ids, material.question_paper_id)
          ? 'You have answered the 5 free questions for this paper. Upgrade your plan to continue.'
          : 'The free Study Mode access covers the first 5 questions on each paper. Upgrade your plan to answer more.',
      });
    }

    const selectedQuestionIds = selectStudyQuestionIds(questionIds, questionCount);

    const firstQuestion = findQuestionById(material, selectedQuestionIds[0]);
    if (!firstQuestion) {
      if (trialClaimed) {
        await User.updateOne(
          { cand_id: candidateId },
          { $pull: { ai_study_free_trial_paper_ids: material.question_paper_id } }
        );
      }
      return res.status(500).json({ success: false, message: 'Could not start session.' });
    }

    let session;
    try {
      session = await AiStudySession.create({
        candidate_cand_id: candidateId,
        material_id: material._id,
        is_free_trial: isFreeTrial,
        question_order: selectedQuestionIds,
        current_index: 0,
        answers: [],
        status: 'in_progress',
        total_questions: questionCount,
        started_at: new Date(),
      });
    } catch (error) {
      if (trialClaimed) {
        try {
          await User.updateOne(
            { cand_id: candidateId },
            { $pull: { ai_study_free_trial_paper_ids: material.question_paper_id } }
          );
        } catch (rollbackError) {
          console.error('[AI Study] Free trial claim rollback failed:', rollbackError.message);
        }
      }
      throw error;
    }

    return res.json({
      success: true,
      session: {
        sessionId: String(session._id),
        paperTitle: material.paper_title,
        totalQuestions: questionCount,
        isFreeTrial,
      },
      question: buildQuestionPayload(firstQuestion, 0, questionCount),
    });
  } catch (error) {
    console.error('[AI Study] startStudySession error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to start study session.' });
  }
};

exports.answerStudyQuestion = async (req, res) => {
  try {
    const candidateId = String(req.user?.cand_id || '').trim();
    const sessionId = String(req.body?.sessionId || '').trim();
    const selectedOption = String(req.body?.selectedOption || '').trim().toUpperCase();

    if (!candidateId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: 'Valid sessionId is required.' });
    }
    if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
      return res.status(400).json({ success: false, message: 'selectedOption must be A, B, C, or D.' });
    }

    const session = await AiStudySession.findOne({
      _id: sessionId,
      candidate_cand_id: candidateId,
      status: 'in_progress',
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Active study session not found.' });
    }

    const material = await AiStudyMaterial.findById(session.material_id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Study material not found.' });
    }

    const currentIndex = Number(session.current_index || 0);
    const currentQuestionId = session.question_order[currentIndex];
    if (!currentQuestionId) {
      return res.status(400).json({ success: false, message: 'No active question to answer.' });
    }

    const question = findQuestionById(material, currentQuestionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    const isCorrect = String(question.correct_option || '').toUpperCase() === selectedOption;
    const answerIdx = session.answers.findIndex((item) => String(item.question_id) === String(currentQuestionId));
    const answerPayload = {
      question_id: currentQuestionId,
      selected_option: selectedOption,
      is_correct: isCorrect,
      answered_at: new Date(),
    };

    if (answerIdx >= 0) {
      session.answers[answerIdx] = answerPayload;
    } else {
      session.answers.push(answerPayload);
    }

    const nextIndex = currentIndex + 1;
    session.current_index = nextIndex;
    await session.save();

    const totalQuestions = Number(session.total_questions || session.question_order.length);
    if (nextIndex >= totalQuestions) {
      return res.json({
        success: true,
        completedQuestions: totalQuestions,
        totalQuestions,
        done: true,
        message: `All ${totalQuestions} questions answered. Submit to get your result.`,
      });
    }

    const nextQuestionId = session.question_order[nextIndex];
    const nextQuestion = findQuestionById(material, nextQuestionId);
    if (!nextQuestion) {
      return res.status(500).json({ success: false, message: 'Could not load next question.' });
    }

    return res.json({
      success: true,
      done: false,
      question: buildQuestionPayload(nextQuestion, nextIndex, totalQuestions),
    });
  } catch (error) {
    console.error('[AI Study] answerStudyQuestion error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to save answer.' });
  }
};

exports.submitStudySession = async (req, res) => {
  try {
    const candidateId = String(req.user?.cand_id || '').trim();
    const sessionId = String(req.body?.sessionId || '').trim();

    if (!candidateId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: 'Valid sessionId is required.' });
    }

    const session = await AiStudySession.findOne({
      _id: sessionId,
      candidate_cand_id: candidateId,
      status: 'in_progress',
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Active study session not found.' });
    }

    const material = await AiStudyMaterial.findById(session.material_id).lean();
    if (!material) {
      return res.status(404).json({ success: false, message: 'Study material not found.' });
    }

    const answerByQuestionId = new Map(session.answers.map((a) => [String(a.question_id), a]));
    const review = [];
    let correct = 0;

    for (let i = 0; i < session.question_order.length; i += 1) {
      const qid = session.question_order[i];
      const question = findQuestionById(material, qid);
      if (!question) continue;
      const answer = answerByQuestionId.get(String(qid));
      const isCorrect = Boolean(answer?.is_correct);
      if (isCorrect) correct += 1;

      review.push({
        number: i + 1,
        question: question.question_text,
        selectedOption: String(answer?.selected_option || ''),
        correctOption: String(question.correct_option || ''),
        correctAnswer: String(question.correct_answer_text || ''),
        reason: String(question.reason || ''),
        isCorrect,
      });
    }

    const total = Number(session.total_questions || session.question_order.length);
    if (review.length < total || session.answers.length < total) {
      return res.status(400).json({ success: false, message: 'Session is incomplete. Please answer all questions.' });
    }

    const wrong = total - correct;
    const percentage = Math.round((correct / total) * 100);

    let grade = 'F';
    if (percentage >= 85) grade = 'A';
    else if (percentage >= 70) grade = 'B';
    else if (percentage >= 55) grade = 'C';
    else if (percentage >= 45) grade = 'D';

    session.status = 'completed';
    session.score = correct;
    session.completed_at = new Date();
    await session.save();

    return res.json({
      success: true,
      result: {
        paperTitle: material.paper_title,
        total,
        correct,
        wrong,
        percentage,
        grade,
        summary:
          percentage >= 70
            ? 'Great work. Keep revising and focus on explanations for missed questions.'
            : 'Good attempt. Review the explanations and retry this paper to improve your score.',
        review,
      },
    });
  } catch (error) {
    console.error('[AI Study] submitStudySession error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit study session.' });
  }
};
