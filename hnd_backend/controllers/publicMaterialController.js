const QuestionPaper = require('../models/QuestionPaper');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const mongoose = require('mongoose');
const path = require('path');
const { createFirstPagePreview, getMaterialSource, readMaterialSource } = require('../services/publicMaterialPreview');

const PUBLIC_PROGRAMS = ['HND', 'BTS', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER'];
const MATERIAL_TYPES = ['papers', 'reports', 'presentations'];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatDepartments = (departments = []) => departments
  .map((department) => String(department?.department_name || '').trim())
  .filter(Boolean);

exports.listCatalog = async (req, res) => {
  try {
    const type = String(req.query.type || 'papers').trim().toLowerCase();
    if (!MATERIAL_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be papers, reports, or presentations' });
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
    const skip = (page - 1) * limit;
    const search = String(req.query.q || '').trim().slice(0, 100);
    const programFilter = { program: { $in: PUBLIC_PROGRAMS } };
    if (search) {
      const match = new RegExp(escapeRegex(search), 'i');
      programFilter.$or = type === 'papers'
        ? [{ course_title: match }, { hnd_year: match }, { paper_type: match }]
        : type === 'reports'
          ? [{ title: match }, { writer_names: match }, { description: match }, { keywords: match }]
          : [{ title: match }, { presenter_name: match }, { description: match }];
    }
    let items;
    let total;

    if (type === 'papers') {
      [items, total] = await Promise.all([
        QuestionPaper.find(programFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('course_title hnd_year paper_type program academic_session departments createdAt')
          .populate('departments', 'department_name')
          .lean(),
        QuestionPaper.countDocuments(programFilter),
      ]);
      items = items.map((paper) => ({
        id: String(paper._id),
        title: paper.course_title,
        year: paper.hnd_year,
        category: String(paper.paper_type || 'hnd').toUpperCase(),
        program: String(paper.program || 'HND').toUpperCase(),
        academicSession: paper.academic_session || null,
        departments: formatDepartments(paper.departments),
        createdAt: paper.createdAt,
      }));
    } else if (type === 'reports') {
      [items, total] = await Promise.all([
        Report.find(programFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('title writer_names keywords description pages program academic_session departments is_guide createdAt')
          .populate('departments', 'department_name')
          .lean(),
        Report.countDocuments(programFilter),
      ]);
      items = items.map((report) => ({
        id: String(report._id),
        title: report.title,
        author: report.writer_names,
        description: report.description || '',
        keywords: report.keywords || '',
        pages: report.pages || null,
        program: String(report.program || 'HND').toUpperCase(),
        academicSession: report.academic_session || null,
        departments: formatDepartments(report.departments),
        isGuide: Boolean(report.is_guide),
        createdAt: report.createdAt,
      }));
    } else {
      [items, total] = await Promise.all([
        Presentation.find(programFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('title presenter_name description pages program academic_session departments createdAt')
          .populate('departments', 'department_name')
          .lean(),
        Presentation.countDocuments(programFilter),
      ]);
      items = items.map((presentation) => ({
        id: String(presentation._id),
        title: presentation.title,
        author: presentation.presenter_name,
        description: presentation.description || '',
        pages: presentation.pages || null,
        program: String(presentation.program || 'HND').toUpperCase(),
        academicSession: presentation.academic_session || null,
        departments: formatDepartments(presentation.departments),
        createdAt: presentation.createdAt,
      }));
    }

    return res.json({
      success: true,
      type,
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[PublicMaterials] Catalog error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve public materials' });
  }
};

exports.previewMaterial = async (req, res) => {
  const type = String(req.params.type || '').trim().toLowerCase();
  if (!MATERIAL_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'type must be papers, reports, or presentations' });
  }
  if (!mongoose.isValidObjectId(req.params.materialId)) {
    return res.status(404).json({ success: false, message: 'Material not found' });
  }

  try {
    const Model = type === 'papers' ? QuestionPaper : type === 'reports' ? Report : Presentation;
    const material = await Model.findOne({
      _id: req.params.materialId,
      program: { $in: PUBLIC_PROGRAMS },
    }).select(`program ${type === 'papers' ? 'paper_file' : 'file_path'}`).lean();
    if (!material) return res.status(404).json({ success: false, message: 'Material not found' });

    const source = getMaterialSource(material, type);
    const sourceBuffer = await readMaterialSource(source, type);
    const extension = path.extname(String(source || '').split('?')[0]).toLowerCase();
    const preview = await createFirstPagePreview(sourceBuffer, extension, type);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="acadex-material-preview.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Preview-Page-Limit', '1');
    return res.send(preview);
  } catch (error) {
    if (error.code === 'MATERIAL_FILE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Material file not found' });
    }
    if (
      ['PREVIEW_FORMAT_UNSUPPORTED', 'PREVIEW_PAGE_UNAVAILABLE', 'PREVIEW_INVALID_PDF'].includes(error.code)
    ) {
      return res.status(422).json({ success: false, message: error.message });
    }
    if (
      ['PREVIEW_CONVERSION_UNAVAILABLE', 'PREVIEW_FILE_TOO_LARGE', 'QUEUE_FULL', 'QUEUE_WAIT_TIMEOUT'].includes(error.code)
    ) {
      return res.status(503).json({ success: false, message: error.message });
    }
    console.error('[PublicMaterials] Preview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create material preview' });
  }
};
