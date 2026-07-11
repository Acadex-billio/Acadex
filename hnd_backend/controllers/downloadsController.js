const MaterialAccess = require('../models/MaterialAccess');
const QuestionPaper = require('../models/QuestionPaper');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const materialAccessService = require('../services/materialAccessService');
const { getS3ObjectStream } = require('../utils/s3Uploader');

const PAPERS_DIR = path.join(__dirname, '../uploads/papers');

const resolveMaterial = async (resourceType, identifier, program) => {
  // identifier may be an _id or a filename
  if (!resourceType) return null;
  const rt = String(resourceType || '').toLowerCase();
  if (rt === 'question_paper' || rt === 'questionpaper') {
    if (identifier.match && identifier.match(/^[0-9a-fA-F]{24}$/)) {
      return await QuestionPaper.findById(identifier).lean();
    }
    return await QuestionPaper.findOne({ paper_file: identifier, program }).lean();
  }

  if (rt === 'report') {
    if (identifier.match && identifier.match(/^[0-9a-fA-F]{24}$/)) {
      return await Report.findById(identifier).lean();
    }
    // Try to resolve by program first, but fall back to global match (guides may belong to other programs)
    let found = await Report.findOne({ file_path: identifier, program }).lean();
    if (found) return found;
    return await Report.findOne({ file_path: identifier }).lean();
  }

  if (rt === 'presentation') {
    if (identifier.match && identifier.match(/^[0-9a-fA-F]{24}$/)) {
      return await Presentation.findById(identifier).lean();
    }
    return await Presentation.findOne({ file_path: identifier, program }).lean();
  }

  return null;
};

exports.saveDownload = async (req, res) => {
  try {
    const { resourceType, resourceId, filename } = req.body || {};
    const program = String(req.user?.program || 'HND').toUpperCase();
    const identifier = resourceId || filename;
    if (!resourceType || !identifier) return res.status(400).json({ success: false, message: 'Missing resourceType or identifier' });

    const material = await resolveMaterial(resourceType, identifier, program);
    if (!material) return res.status(404).json({ success: false, message: 'Resource not found' });

    // Find user document to get _id
    const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id').lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const materialTypeMap = {
      question_paper: 'questionPaper',
      questionpaper: 'questionPaper',
      report: 'report',
      presentation: 'presentation',
    };

    const mappedType = materialTypeMap[String(resourceType).toLowerCase()] || String(resourceType);

    const access = await materialAccessService.grantMaterialAccess(user._id, material._id, mappedType, 'download', null);

    return res.json({ success: true, downloadId: access._id, expiresAt: access.expiresAt });
  } catch (err) {
    console.error('[Downloads] Save error:', err);
    return res.status(500).json({ success: false, message: 'Failed to save download' });
  }
};

exports.listDownloads = async (req, res) => {
  try {
    const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id').lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const accesses = await materialAccessService.getUserActiveAccesses(user._id);

    const results = await Promise.all(
      accesses.map(async (a) => {
        const item = { id: a._id, materialType: a.materialType, accessType: a.accessType, expiresAt: a.expiresAt };
        try {
          if (a.materialType === 'questionPaper') {
            const m = await QuestionPaper.findById(a.materialId).select('course_title paper_file').lean();
            item.title = m?.course_title || null;
            item.filename = m?.paper_file || null;
            item.resource_type = 'question_paper';
            item.resource_id = m?._id || null;
          } else if (a.materialType === 'report') {
            const m = await Report.findById(a.materialId).select('title file_path').lean();
            item.title = m?.title || null;
            item.filename = m?.file_path || null;
            item.resource_type = 'report';
            item.resource_id = m?._id || null;
          } else if (a.materialType === 'presentation') {
            const m = await Presentation.findById(a.materialId).select('title file_path').lean();
            item.title = m?.title || null;
            item.filename = m?.file_path || null;
            item.resource_type = 'presentation';
            item.resource_id = m?._id || null;
          }
        } catch (e) {
          // ignore
        }
        return item;
      })
    );

    return res.json({ success: true, downloads: results });
  } catch (err) {
    console.error('[Downloads] List error:', err);
    return res.status(500).json({ success: false, message: 'Failed to list downloads' });
  }
};

const streamS3OrLocal = (fileRef, res, downloadName) => {
  if (!fileRef) return false;
  const isRemote = /^https?:\/\//i.test(fileRef);
  if (isRemote) {
    const key = String(fileRef || '').replace(/^\/+/, '');
    const stream = getS3ObjectStream(key);
    if (!stream) return false;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName || 'file'}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    stream.on('error', (err) => {
      console.error('[Downloads] S3 stream error:', err.message);
      if (!res.headersSent) res.status(404).json({ success: false, message: 'File not found' });
    });
    stream.pipe(res);
    return true;
  }

  const filename = sanitizeFilename(fileRef);
  if (!filename) return false;
  const filePath = path.join(PAPERS_DIR, filename);
  if (!fs.existsSync(filePath)) return false;
  res.download(filePath, filename);
  return true;
};

exports.streamSavedDownload = async (req, res) => {
  try {
    const downloadId = req.params.downloadId;
    if (!downloadId) return res.status(400).json({ success: false, message: 'Missing downloadId' });

    const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id').lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const access = await MaterialAccess.findOne({ _id: downloadId, userId: user._id }).lean();
    if (!access || new Date(access.expiresAt) <= new Date()) {
      return res.status(404).json({ success: false, message: 'Download not found or expired' });
    }

    // Resolve material and stream
    const materialType = access.materialType;
    if (materialType === 'questionPaper') {
      const m = await QuestionPaper.findById(access.materialId).select('paper_file course_title').lean();
      if (!m) return res.status(404).json({ success: false, message: 'File not found' });
      if (streamS3OrLocal(m.paper_file, res, sanitizeFilename(m.paper_file) || m.course_title)) return;
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (materialType === 'report') {
      const m = await Report.findById(access.materialId).select('file_path title').lean();
      if (!m) return res.status(404).json({ success: false, message: 'File not found' });
      if (streamS3OrLocal(m.file_path, res, sanitizeFilename(m.file_path) || m.title)) return;
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (materialType === 'presentation') {
      const m = await Presentation.findById(access.materialId).select('file_path title').lean();
      if (!m) return res.status(404).json({ success: false, message: 'File not found' });
      if (streamS3OrLocal(m.file_path, res, sanitizeFilename(m.file_path) || m.title)) return;
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    return res.status(400).json({ success: false, message: 'Unsupported material type' });
  } catch (err) {
    console.error('[Downloads] Stream error:', err);
    return res.status(500).json({ success: false, message: 'Failed to stream download' });
  }
};

exports.deleteDownload = async (req, res) => {
  try {
    const { downloadId } = req.params;
    if (!downloadId) return res.status(400).json({ success: false, message: 'Missing downloadId' });

    const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id').lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const access = await MaterialAccess.findOne({ _id: downloadId, userId: user._id });
    if (!access) return res.status(404).json({ success: false, message: 'Download not found' });

    await MaterialAccess.deleteOne({ _id: downloadId, userId: user._id });

    return res.json({ success: true, message: 'Download removed' });
  } catch (err) {
    console.error('[Downloads] Delete error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete download' });
  }
};
