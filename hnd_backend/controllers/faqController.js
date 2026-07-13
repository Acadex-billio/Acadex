const mongoose = require('mongoose');
const Faq = require('../models/Faq');

exports.listPublic = async (req, res) => {
  try {
    const faqs = await Faq.find({ published: true, audience: { $in: ['candidate', 'all'] } })
      .sort({ order: 1, createdAt: -1 })
      .lean();
    return res.json({ success: true, faqs });
  } catch (err) {
    console.error('[Faq] listPublic error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load FAQs.' });
  }
};

exports.getBySlugOrId = async (req, res) => {
  try {
    const raw = String(req.params.slugOrId || '').trim();
    if (!raw) return res.status(400).json({ success: false, message: 'Invalid identifier.' });

    let faq = null;
    if (mongoose.Types.ObjectId.isValid(raw)) {
      faq = await Faq.findById(raw).lean();
    }
    if (!faq) {
      faq = await Faq.findOne({ slug: raw, published: true, audience: { $in: ['candidate', 'all'] } }).lean();
    }

    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found.' });
    return res.json({ success: true, faq });
  } catch (err) {
    console.error('[Faq] getBySlugOrId error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load FAQ.' });
  }
};

// Admin: list all FAQs (including unpublished)
exports.listAdmin = async (req, res) => {
  try {
    const faqs = await Faq.find({}).sort({ order: 1, createdAt: -1 }).lean();
    return res.json({ success: true, faqs });
  } catch (err) {
    console.error('[Faq] listAdmin error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load FAQs.' });
  }
};

// Admin: create FAQ
exports.create = async (req, res) => {
  try {
    const payload = req.body || {};
    const title = String(payload.title || '').trim();
    const content = String(payload.content || '').trim();
    const audience = String(payload.audience || 'candidate').trim();
    const published = payload.published === true;
    const order = Number.isFinite(Number(payload.order)) ? Number(payload.order) : 0;

    if (!title || !content) return res.status(400).json({ success: false, message: 'Title and content are required.' });

    const slug = String(payload.slug || title)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 120);

    const faq = await Faq.create({ title, slug, content, audience, published, order, created_by: req.user?.cand_id || req.user?.id || 'admin' });
    return res.json({ success: true, faq });
  } catch (err) {
    console.error('[Faq] create error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create FAQ.' });
  }
};

// Admin: update FAQ
exports.update = async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id.' });
    const payload = req.body || {};
    const updates = {};
    if (payload.title) updates.title = String(payload.title).trim();
    if (payload.content) updates.content = String(payload.content).trim();
    if (payload.audience) updates.audience = String(payload.audience).trim();
    if (typeof payload.published === 'boolean') updates.published = payload.published;
    if (Number.isFinite(Number(payload.order))) updates.order = Number(payload.order);
    if (payload.slug) {
      updates.slug = String(payload.slug).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0,120);
    }

    const faq = await Faq.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found.' });
    return res.json({ success: true, faq });
  } catch (err) {
    console.error('[Faq] update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update FAQ.' });
  }
};

// Admin: delete FAQ
exports.remove = async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id.' });
    const faq = await Faq.findByIdAndDelete(id).lean();
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found.' });
    return res.json({ success: true, message: 'FAQ deleted.' });
  } catch (err) {
    console.error('[Faq] remove error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete FAQ.' });
  }
};
