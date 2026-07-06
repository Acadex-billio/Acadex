const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const mongoose = require('mongoose');
const CandidateProjectSubmission = require('../models/CandidateProjectSubmission');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const { USER_PROGRAMS } = require('../constants/userConstants');
const { getOrCreatePricingDocument, getPricingSnapshot } = require('../services/platformPricingService');
const { getS3ObjectStream } = require('../utils/s3Uploader');
const { enqueueLibreOfficeJob } = require('../services/libreOfficeQueue');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'candidate-projects');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const previewCacheDir = path.join(os.tmpdir(), 'hnd-preview', 'candidate-projects');
if (!fs.existsSync(previewCacheDir)) fs.mkdirSync(previewCacheDir, { recursive: true });

const LO_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'libreoffice',
  'soffice',
];
const COMMAND_CANDIDATES = LO_PATHS.filter((p) => (p.includes('\\') ? fs.existsSync(p) : true));
const LIBREOFFICE_TIMEOUT_MS = 30000;

const S3_BASE_URL = String(process.env.AWS_S3_URL || '').replace(/\/$/, '');

const getS3KeyFromValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');
  if (S3_BASE_URL && raw.startsWith(`${S3_BASE_URL}/`)) return raw.slice(S3_BASE_URL.length + 1);
  try {
    const parsed = new URL(raw);
    return String(parsed.pathname || '').replace(/^\/+/, '');
  } catch (_) {
    return null;
  }
};

const writeS3ObjectToFile = async (source, destinationPath) => {
  const key = getS3KeyFromValue(source);
  if (!key) return false;
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const readStream = getS3ObjectStream(key);
  const writeStream = fs.createWriteStream(destinationPath);
  await pipeline(readStream, writeStream);
  return true;
};

const downloadHttpToFile = async (sourceUrl, destinationPath, redirectCount = 0) => {
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const client = sourceUrl.startsWith('https://') ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(sourceUrl, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (redirectCount >= 5) {
          return reject(new Error('Too many redirects while downloading preview file.'));
        }
        return resolve(downloadHttpToFile(response.headers.location, destinationPath, redirectCount + 1));
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
      }

      const writeStream = fs.createWriteStream(destinationPath);
      pipeline(response, writeStream)
        .then(resolve)
        .catch(reject);
    });

    request.on('error', reject);
  });
};

const runLibreOfficeConvert = (command, sourcePath, outputDir) =>
  new Promise((resolve, reject) => {
    const args = ['--headless', '--convert-to', 'pdf', sourcePath, '--outdir', outputDir];
    const child = spawn(command, args, { windowsHide: true });
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`LibreOffice conversion timed out after ${LIBREOFFICE_TIMEOUT_MS}ms`));
    }, LIBREOFFICE_TIMEOUT_MS);

    let stderr = '';
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr || `LibreOffice exited with code ${code}`));
      return resolve();
    });
  });

const convertToPdf = async (sourcePath, outputDir, lockKey) =>
  enqueueLibreOfficeJob(lockKey, async () => {
    let lastError;
    for (const command of COMMAND_CANDIDATES) {
      try {
        await runLibreOfficeConvert(command, sourcePath, outputDir);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('LibreOffice command not available');
  });

const normalizeProgram = (value) => String(value || '').trim().toUpperCase();
const normalizePagesValue = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return String(parsed);
};
const ALL_PROGRAMS = ['HND', 'BTS', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER'];
const resolveTargetProgram = (user) => {
  const program = normalizeProgram(user?.program);
  const role = String(user?.role || '').trim().toLowerCase();
  const preferredLanguage = String(user?.preferred_language || '').trim().toLowerCase();

  if (role === 'lecturer' || program === USER_PROGRAMS.LECTURER) {
    if (preferredLanguage === 'fr') return 'MASTER';
    if (preferredLanguage === 'en') return 'MASTERS';
    return null;
  }

  if (program === 'BACHELOR' || program === 'BACHELORS') return 'HND';
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
    HND: 'HND',
    BTS: 'BTS',
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
      canUploadMore: hasPermissionGrant || reportCount < 1 || presentationCount < 1,
      canRequestPermission: hasPublishedSubmission || (reportCount >= 1 && presentationCount >= 1),
      infoMessage: hasPublishedSubmission
        ? 'You have already completed a published project upload and are not entitled to submit another project without developer permission.'
        : 'You can upload one report and one presentation. After both slots are used, request developer permission for additional uploads.',
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
    const location = String(req.body?.location || '').trim();
    const pages = normalizePagesValue(req.body?.pages);

    if (!targetProgram) {
      return res.status(403).json({ success: false, message: getIneligibleProgramMessage(user) });
    }

    if (!['report', 'presentation'].includes(submissionType)) {
      return res.status(400).json({ success: false, message: 'Submission type must be report or presentation.' });
    }

    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });
    if (!location) return res.status(400).json({ success: false, message: 'Location is required.' });
    if (!pages) return res.status(400).json({ success: false, message: 'Number of pages is required.' });

    if (submissionType === 'report' && !isWordFile(req.file.originalname)) {
      return res.status(400).json({ success: false, message: 'Reports must be uploaded as Word documents (.doc or .docx).' });
    }

    if (submissionType === 'presentation' && !isPowerPointFile(req.file.originalname)) {
      return res.status(400).json({ success: false, message: 'Presentations must be uploaded as PowerPoint files (.ppt or .pptx).' });
    }

    const existing = await CandidateProjectSubmission.find({ uploader_cand_id: user.cand_id });
    const reportCount = existing.filter((item) => item.submission_type === 'report').length;
    const presentationCount = existing.filter((item) => item.submission_type === 'presentation').length;
    const hasPermissionGrant = existing.some((item) => item.permission_status === 'approved');

    if (!hasPermissionGrant && ((submissionType === 'report' && reportCount >= 1) || (submissionType === 'presentation' && presentationCount >= 1))) {
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
      location,
      pages,
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

exports.getSubmissionDraftForMaterialUpload = async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid submission id.' });
    }

    const submission = await CandidateProjectSubmission.findById(id).lean();
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    if (submission.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Only approved submissions can be prepared for material upload.' });
    }

    return res.json({
      success: true,
      draft: {
        _id: String(submission._id),
        submission_type: submission.submission_type,
        title: submission.title || '',
        description: submission.description || '',
        location: submission.location || '',
        pages: submission.pages || '',
        uploader_name: submission.uploader_name || '',
        uploader_email: submission.uploader_email || '',
        uploader_program: submission.uploader_program || null,
        target_program: submission.target_program || null,
        file_path: submission.file_path || null,
        file_name: submission.file_name || null,
        upload_fee: submission.upload_fee ?? null,
      },
    });
  } catch (err) {
    console.error('[CandidateProject] draft fetch error:', err);
    return res.status(500).json({ success: false, message: 'Failed to prepare submission draft.' });
  }
};

exports.previewSubmissionFile = async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid submission id.' });
    }

    const submission = await CandidateProjectSubmission.findById(id).lean();
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    const ext = String(submission.file_type || '').toLowerCase();
    const isReport = submission.submission_type === 'report';
    const isPresentation = submission.submission_type === 'presentation';

    if (isReport && !['.doc', '.docx'].includes(ext)) {
      return res.status(400).json({ success: false, message: 'Report preview supports DOC and DOCX files only.' });
    }
    if (isPresentation && !['.ppt', '.pptx'].includes(ext)) {
      return res.status(400).json({ success: false, message: 'Presentation preview supports PPT and PPTX files only.' });
    }

    const sourceName = submission.file_name || path.basename(String(submission.file_path || 'submission').replace(/^\/+/, ''));
    const sourcePath = path.join(previewCacheDir, sourceName);
    const filePathValue = String(submission.file_path || '').trim();
    const fileExt = path.extname(sourceName).toLowerCase();

    if (!filePathValue) {
      return res.status(404).json({ success: false, message: 'Submission file path is missing.' });
    }

    const makeLocalPath = (rawPath) => {
      const safePath = String(rawPath || '').replace(/^\/+/, '');
      return path.resolve(path.join(__dirname, '..', safePath));
    };

    console.log('[CandidateProject] preview request', {
      submissionId: id,
      filePathValue,
      sourceName,
      fileExt,
    });

    if (/^https?:\/\//i.test(filePathValue)) {
      await downloadHttpToFile(filePathValue, sourcePath);
    } else if (/^s3:\/\//i.test(filePathValue) || (S3_BASE_URL && filePathValue.startsWith(S3_BASE_URL))) {
      const downloaded = await writeS3ObjectToFile(filePathValue, sourcePath);
      if (!downloaded) {
        return res.status(404).json({ success: false, message: 'Unable to fetch file from S3 path.' });
      }
    } else {
      const localPathsToTry = [
        makeLocalPath(filePathValue),
        makeLocalPath(`/uploads/candidate-projects/${sourceName}`),
        makeLocalPath(`uploads/candidate-projects/${sourceName}`),
        makeLocalPath(`uploads/${sourceName}`),
      ];

      let resolvedLocalPath = null;
      for (const localPath of localPathsToTry) {
        if (fs.existsSync(localPath)) {
          resolvedLocalPath = localPath;
          break;
        }
      }

      if (!resolvedLocalPath) {
        console.error('[CandidateProject] preview file not found in any local path', {
          filePathValue,
          attempted: localPathsToTry,
        });
        return res.status(404).json({
          success: false,
          message: 'Submission file not found at any expected local path.',
          attempted_paths: localPathsToTry,
        });
      }

      await fs.promises.copyFile(resolvedLocalPath, sourcePath);
    }

    const pdfName = sourceName.replace(/\.[^.]+$/, '.pdf');
    const pdfPath = path.join(previewCacheDir, pdfName);

    if (fileExt === '.pdf') {
      if (!fs.existsSync(sourcePath)) {
        return res.status(404).json({ success: false, message: 'Submission PDF file missing.' });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      return fs.createReadStream(sourcePath).pipe(res);
    }

    if (!fs.existsSync(pdfPath)) {
      console.log('[CandidateProject] converting preview source to PDF', { sourcePath, pdfPath });
      await convertToPdf(sourcePath, previewCacheDir, `candidate-project:${sourceName}`);
    }

    if (!fs.existsSync(pdfPath)) {
      console.error('[CandidateProject] preview conversion failed for', { sourcePath, pdfPath });
      return res.status(500).json({ success: false, message: 'Preview conversion failed.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    return fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('[CandidateProject] preview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to preview file.' });
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
            location: submission.location || 'Candidate Project Upload',
            pages: submission.pages || null,
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
            location: submission.location || null,
            pages: submission.pages || null,
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
    } else if (action === 'delete') {
      if (submission.status !== 'rejected') {
        return res.status(400).json({ success: false, message: 'Only rejected submissions can be deleted.' });
      }

      const filePathValue = String(submission.file_path || '');
      if (filePathValue && !filePathValue.startsWith('http')) {
        const localPath = path.join(__dirname, '..', filePathValue.replace(/^\/+/, ''));
        try {
          if (fs.existsSync(localPath)) {
            await fs.promises.unlink(localPath);
          }
        } catch (fileErr) {
          console.warn('[CandidateProject] delete local file warning:', fileErr?.message || fileErr);
        }
      }

      await CandidateProjectSubmission.deleteOne({ _id: submission._id });
      return res.json({ success: true, message: 'Rejected submission deleted successfully.' });
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

    if (!ALL_PROGRAMS.includes(targetProgram)) {
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
