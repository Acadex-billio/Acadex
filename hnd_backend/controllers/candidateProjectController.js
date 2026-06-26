const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const CandidateProjectSubmission = require('../models/CandidateProjectSubmission');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const { USER_PROGRAMS } = require('../constants/userConstants');
const { getOrCreatePricingDocument, getPricingSnapshot } = require('../services/platformPricingService');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'candidate-projects');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const normalizeProgram = (value) => String(value || '').trim().toUpperCase();
const resolveTargetProgram = (user) => {
  const program = normalizeProgram(user?.program);
  const role = String(user?.role || '').trim().toLowerCase();
  const preferredLanguage = String(user?.preferred_language || '').trim().toLowerCase();

  if (role === 'lecturer' || program === USER_PROGRAMS.LECTURER) {
    if (preferredLanguage === 'fr') return 'MASTER';
    if (preferredLanguage === 'en') return 'MASTERS';
    return null;
  }

  if (program === 'BACHELOR') return 'BACHELOR';
  if (program === 'MASTERS') return 'BACHELOR';
  if (program === 'LICENCE') return 'BTS';
  if (program === 'MASTER') return 'LICENCE';
  return null;
};

const isEligibleProgram = (user) => Boolean(resolveTargetProgram(user));
const isWordFile = (fileName) => ['.doc', '.docx'].includes(path.extname(fileName || '').toLowerCase());
const isPowerPointFile = (fileName) => ['.ppt', '.pptx'].includes(path.extname(fileName || '').toLowerCase());

const defaultFees = {
  HND: 0,
  BACHELOR: 0,
  MASTERS: 0,
  LICENCE: 0,
  MASTER: 0,
  BTS: 0,
};

const getIneligibleProgramMessage = (user) => {
  const program = normalizeProgram(user?.program);
  if (program === 'HND' || program === 'BTS') {
    return 'Candidate project upload routes are enabled for platform consistency, but HND and BTS candidates are not eligible to upload reports or presentations in this queue. This queue is reserved for BACHELOR, MASTERS, LICENCE, MASTER candidates and eligible lecturers only.';
  }
  return 'This feature is available for BACHELOR, MASTERS, LICENCE, MASTER candidates and eligible lecturers.';
};

const buildUploadFee = async (program) => {
  const snapshot = await getPricingSnapshot();
  const value = Number(snapshot?.candidateProjectUploadPricing?.[program]);
  if (Number.isFinite(value) && value >= 0) return value;
  return defaultFees[program] || 0;
};

const getTargetProgramLabel = (program) => {
  const labels = {
    BACHELOR: 'Bachelor',
    MASTERS: 'Masters',
    LICENCE: 'Licence',
    MASTER: 'Master',
  };
  return labels[program] || program;
};

exports.getMySubmissionOverview = async (req, res) => {
  try {
    const user = req.user;
    const uploaderProgram = normalizeProgram(user?.program);
    const targetProgram = resolveTargetProgram(user);
    const eligible = isEligibleProgram(user);

    if (!eligible) {
      return res.json({ success: true, eligible: false, message: getIneligibleProgramMessage(user) });
    }

    const submissions = await CandidateProjectSubmission.find({ uploader_cand_id: user.cand_id })
      .sort({ createdAt: -1 })
      .lean();

    const uploadFee = await buildUploadFee(targetProgram);

    const reportCount = submissions.filter((item) => item.submission_type === 'report').length;
    const presentationCount = submissions.filter((item) => item.submission_type === 'presentation').length;
    const hasPublishedSubmission = submissions.some((item) => item.status === 'published');
    const hasPermissionGrant = submissions.some((item) => item.permission_status === 'approved');

    return res.json({
      success: true,
      eligible,
      uploadFee,
      uploaderProgram,
      targetProgram,
      targetProgramLabel: getTargetProgramLabel(targetProgram),
      submissions,
      reportCount,
      presentationCount,
      hasPublishedSubmission,
      hasPermissionGrant,
      canUploadMore: hasPermissionGrant || (!hasPublishedSubmission && reportCount < 1 && presentationCount < 1),
      canRequestPermission: hasPublishedSubmission || reportCount >= 1 || presentationCount >= 1,
      infoMessage: hasPublishedSubmission
        ? 'You have already completed a published project upload and are not entitled to submit another project without developer permission.'
        : 'You may upload one report and one presentation. Once a submission is published, you can request developer permission for another upload.',
    });
  } catch (err) {
    console.error('[CandidateProject] overview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load submission overview.' });
  }
};

exports.requestPermission = async (req, res) => {
  try {
    const user = req.user;
    const message = String(req.body?.message || '').trim();

    if (!message) return res.status(400).json({ success: false, message: 'Please explain why you need permission.' });

    await CandidateProjectSubmission.updateMany(
      { uploader_cand_id: user.cand_id, permission_status: { $ne: 'approved' } },
      {
        $set: {
          permission_status: 'requested',
          permission_message: message,
          status: 'permission_requested',
        },
      }
    );

    return res.json({ success: true, message: 'Your permission request has been submitted to the developer.' });
  } catch (err) {
    console.error('[CandidateProject] permission request error:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit permission request.' });
  }
};

exports.submitProject = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'A file is required.' });

    const user = req.user;
    const uploaderProgram = normalizeProgram(user?.program);
    const targetProgram = resolveTargetProgram(user);
    const submissionType = String(req.body?.submission_type || '').trim().toLowerCase();
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!targetProgram) {
      return res.status(403).json({ success: false, message: getIneligibleProgramMessage(user) });
    }

    if (!['report', 'presentation'].includes(submissionType)) {
      return res.status(400).json({ success: false, message: 'Submission type must be report or presentation.' });
    }

    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });

    if (submissionType === 'report' && !isWordFile(req.file.originalname)) {
      return res.status(400).json({ success: false, message: 'Reports must be uploaded as Word documents (.doc or .docx).' });
    }

    if (submissionType === 'presentation' && !isPowerPointFile(req.file.originalname)) {
      return res.status(400).json({ success: false, message: 'Presentations must be uploaded as PowerPoint files (.ppt or .pptx).' });
    }

    const existing = await CandidateProjectSubmission.find({ uploader_cand_id: user.cand_id });
    const hasPublished = existing.some((item) => item.status === 'published');
    const reportCount = existing.filter((item) => item.submission_type === 'report').length;
    const presentationCount = existing.filter((item) => item.submission_type === 'presentation').length;
    const hasPermissionGrant = existing.some((item) => item.permission_status === 'approved');

    if (!hasPermissionGrant && (hasPublished || (submissionType === 'report' && reportCount >= 1) || (submissionType === 'presentation' && presentationCount >= 1))) {
      return res.status(403).json({ success: false, message: 'You are not entitled to submit another project without developer permission.' });
    }

    const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
    const finalPath = path.join(uploadsDir, fileName);
    fs.writeFileSync(finalPath, req.file.buffer);

    const uploadFee = await buildUploadFee(targetProgram);

    const record = await CandidateProjectSubmission.create({
      uploader_cand_id: user.cand_id,
      uploader_name: user.name || null,
      uploader_email: user.email || null,
      uploader_program: uploaderProgram || USER_PROGRAMS.HND,
      target_program: targetProgram,
      submission_type: submissionType,
      title,
      description,
      file_path: `/uploads/candidate-projects/${fileName}`,
      file_name: fileName,
      file_type: path.extname(req.file.originalname).toLowerCase(),
      upload_fee: uploadFee,
      status: 'pending_review',
      visibility: 'private',
    });

    if (hasPermissionGrant) {
      await CandidateProjectSubmission.updateMany(
        { uploader_cand_id: user.cand_id, permission_status: 'approved' },
        { $set: { permission_status: 'none', status: 'draft' } }
      );
    }

    return res.json({ success: true, submission: record });
  } catch (err) {
    console.error('[CandidateProject] submit error:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit project.' });
  }
};

exports.listForDeveloper = async (req, res) => {
  try {
    const submissions = await CandidateProjectSubmission.find({ visibility: 'private' }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, submissions });
  } catch (err) {
    console.error('[CandidateProject] list dev error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load submissions.' });
  }
};

exports.updateSubmission = async (req, res) => {
  try {
    const id = req.params.id;
    const action = String(req.body?.action || '').trim();
    const note = String(req.body?.note || '').trim();

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid submission id.' });

    const submission = await CandidateProjectSubmission.findById(id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found.' });

    if (action === 'approve') {
      submission.status = 'approved';
      submission.review_note = note || 'Approved for publishing.';
      submission.reviewed_by = req.user?.cand_id || 'developer';
      submission.reviewed_at = new Date();
      submission.visibility = 'private';
    } else if (action === 'publish') {
      if (!submission.published_resource_id) {
        if (submission.submission_type === 'report') {
          const publishedReport = await Report.create({
            title: submission.title,
            writer_names: submission.uploader_name || submission.uploader_cand_id,
            writer_email: submission.uploader_email || 'no-email@acadex.local',
            description: submission.description || '',
            keywords: '',
            location: 'Candidate Project Upload',
            pages: null,
            file_path: submission.file_path,
            program: submission.target_program,
            audience: 'GENERAL',
            notify_candidates: false,
            departments: [],
            material_price: submission.upload_fee,
          });
          submission.published_resource_id = String(publishedReport._id);
          submission.published_resource_type = 'report';
        } else if (submission.submission_type === 'presentation') {
          const publishedPresentation = await Presentation.create({
            title: submission.title,
            presenter_name: submission.uploader_name || submission.uploader_cand_id,
            presenter_email: submission.uploader_email || 'no-email@acadex.local',
            file_path: submission.file_path,
            program: submission.target_program,
            audience: 'GENERAL',
            departments: [],
            material_price: submission.upload_fee,
            report_id: null,
          });
          submission.published_resource_id = String(publishedPresentation._id);
          submission.published_resource_type = 'presentation';
        }
      }

      submission.status = 'published';
      submission.publish_note = note || 'Published to the public candidate materials.';
      submission.visibility = 'public';
      submission.published_at = new Date();
      submission.reviewed_by = req.user?.cand_id || 'developer';
      submission.reviewed_at = new Date();
    } else if (action === 'reject') {
      submission.status = 'rejected';
      submission.review_note = note || 'Rejected by developer.';
      submission.reviewed_by = req.user?.cand_id || 'developer';
      submission.reviewed_at = new Date();
      submission.visibility = 'private';
    } else if (action === 'request-permission') {
      submission.status = 'permission_requested';
      submission.permission_status = 'requested';
      submission.permission_message = note || 'Requested permission to upload another project.';
    } else if (action === 'grant-permission') {
      submission.status = 'permission_granted';
      submission.permission_status = 'approved';
      submission.permission_message = note || 'Permission granted.';
    } else {
      return res.status(400).json({ success: false, message: 'Unknown action.' });
    }

    await submission.save();
    return res.json({ success: true, submission });
  } catch (err) {
    console.error('[CandidateProject] update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update submission.' });
  }
};

exports.listPricingForDeveloper = async (_req, res) => {
  try {
    const targetPrograms = ['HND', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER', 'BTS'];
    const snapshot = await getPricingSnapshot();
    const raw = snapshot?.raw || null;

    const pricing = targetPrograms.map((targetProgram) => ({
      target_program: targetProgram,
      upload_fee: Number(snapshot?.candidateProjectUploadPricing?.[targetProgram] ?? defaultFees[targetProgram] ?? 0),
      updated_by: raw?.updated_by || null,
      updatedAt: raw?.updatedAt || null,
    }));

    return res.json({ success: true, pricing });
  } catch (err) {
    console.error('[CandidateProject] pricing list error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load pricing.' });
  }
};

exports.updatePricing = async (req, res) => {
  try {
    const targetProgram = String(req.body?.target_program || '').trim().toUpperCase();
    const uploadFee = Number(req.body?.upload_fee);

    if (!['HND', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER', 'BTS'].includes(targetProgram)) {
      return res.status(400).json({ success: false, message: 'Invalid target program.' });
    }

    if (!Number.isFinite(uploadFee) || uploadFee < 0) {
      return res.status(400).json({ success: false, message: 'Upload fee must be a non-negative number.' });
    }

    const pricingDoc = await getOrCreatePricingDocument();
    pricingDoc.candidate_project_upload = {
      ...(pricingDoc.candidate_project_upload?.toObject?.() || pricingDoc.candidate_project_upload || {}),
      [targetProgram]: uploadFee,
    };
    pricingDoc.updated_by = req.user?.cand_id || 'developer';
    await pricingDoc.save();

    return res.json({
      success: true,
      pricing: {
        target_program: targetProgram,
        upload_fee: uploadFee,
        updated_by: pricingDoc.updated_by,
        updatedAt: pricingDoc.updatedAt,
      },
    });
  } catch (err) {
    console.error('[CandidateProject] pricing update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update pricing.' });
  }
};
