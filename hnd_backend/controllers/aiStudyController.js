'use strict';

const mongoose = require('mongoose');
const QuestionPaper = require('../models/QuestionPaper');
const AiStudyMaterial = require('../models/AiStudyMaterial');
const AiStudySession = require('../models/AiStudySession');
const materialAccessService = require('../services/materialAccessService');

const STUDY_LIMIT = 20;

const normalizeProgram = (value) => {
  const raw = String(value || 'HND').trim().toUpperCase();
  return raw === 'BTS' ? 'BTS' : 'HND';
};

const toObjectId = (value) => {
  const raw = String(value || '').trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
};

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
      program: normalizeProgram(paper.program),
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
    const program = normalizeProgram(req.query?.program);
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
    const program = normalizeProgram(req.user?.program);
    const deptObjectId = toObjectId(req.user?.dpt_id);

    const filter = {
      is_active: true,
      program,
      question_count: { $gte: STUDY_LIMIT },
      $or: [
        { departments: { $exists: false } },
        { departments: { $size: 0 } },
      ],
    };

    if (deptObjectId) {
      filter.$or.push({ departments: deptObjectId });
    }

    const materials = await AiStudyMaterial.find(filter)
      .sort({ createdAt: -1 })
      .select('paper_title question_count question_paper_id')
      .lean();

    return res.json({
      success: true,
      papers: materials.map((item) => ({
        materialId: String(item._id),
        questionPaperId: String(item.question_paper_id || ''),
        paperTitle: item.paper_title,
        questionCount: item.question_count,
      })),
    });
  } catch (error) {
    console.error('[AI Study] listStudyPapersForCandidate error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load study papers.' });
  }
};

exports.startStudySession = async (req, res) => {
  try {
    const candidateId = String(req.user?.cand_id || '').trim();
    const program = normalizeProgram(req.user?.program);
    const deptObjectId = toObjectId(req.user?.dpt_id);
    const materialId = String(req.body?.materialId || '').trim();

    if (!candidateId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!materialId || !mongoose.Types.ObjectId.isValid(materialId)) {
      return res.status(400).json({ success: false, message: 'Valid study material is required.' });
    }

    const material = await AiStudyMaterial.findById(materialId).lean();
    if (!material || !material.is_active) {
      return res.status(404).json({ success: false, message: 'Study material not found.' });
    }
    if (normalizeProgram(material.program) !== program) {
      return res.status(403).json({ success: false, message: 'You cannot access this study material.' });
    }

    const hasAiAccess = await materialAccessService.hasActiveAccess(candidateId, String(materialId), 'ai_mode', 'preview').catch(() => false);
    if (!hasAiAccess) {
      return res.status(403).json({ success: false, message: 'You need granted access to use AI study mode.' });
    }

    const materialDepartments = Array.isArray(material.departments) ? material.departments.map((d) => String(d)) : [];
    if (materialDepartments.length > 0) {
      const deptId = String(deptObjectId || '');
      if (!deptId || !materialDepartments.includes(deptId)) {
        return res.status(403).json({ success: false, message: 'You cannot access this study material.' });
      }
    }

    const questionIds = (material.questions || []).map((q) => q._id).filter(Boolean);
    if (questionIds.length < STUDY_LIMIT) {
      return res.status(400).json({ success: false, message: 'This study material has fewer than 20 questions.' });
    }

    const shuffled = [...questionIds].sort(() => Math.random() - 0.5).slice(0, STUDY_LIMIT);

    const session = await AiStudySession.create({
      candidate_cand_id: candidateId,
      material_id: material._id,
      question_order: shuffled,
      current_index: 0,
      answers: [],
      status: 'in_progress',
      total_questions: STUDY_LIMIT,
      started_at: new Date(),
    });

    const firstQuestion = findQuestionById(material, shuffled[0]);
    if (!firstQuestion) {
      return res.status(500).json({ success: false, message: 'Could not start session.' });
    }

    return res.json({
      success: true,
      session: {
        sessionId: String(session._id),
        paperTitle: material.paper_title,
        totalQuestions: STUDY_LIMIT,
      },
      question: buildQuestionPayload(firstQuestion, 0, STUDY_LIMIT),
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

    if (nextIndex >= STUDY_LIMIT) {
      return res.json({
        success: true,
        completedQuestions: STUDY_LIMIT,
        done: true,
        message: 'All 20 questions answered. Submit to get your result.',
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
      question: buildQuestionPayload(nextQuestion, nextIndex, STUDY_LIMIT),
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

    if (review.length < STUDY_LIMIT) {
      return res.status(400).json({ success: false, message: 'Session is incomplete. Please answer all questions.' });
    }

    const total = STUDY_LIMIT;
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
