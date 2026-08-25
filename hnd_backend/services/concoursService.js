const Concours = require('../models/Concours');
const ConcoursApplication = require('../models/ConcoursApplication');
const User = require('../models/User');
const { canAccessPartner, isDeveloper } = require('../middlewares/concoursAuthorization');

const profileSnapshot = (user) => ({
  name: user.name || null,
  email: user.email || null,
  phone: user.phone || null,
  address: user.address || null,
  program: user.program || null,
  profile_picture: user.profile_picture || null,
});

const validateForm = (form) => {
  const fields = Array.isArray(form?.fields) ? form.fields : [];
  const ids = new Set();
  for (const field of fields) {
    if (!field?.id || ids.has(field.id)) throw new Error('Form field IDs must be unique');
    ids.add(field.id);
    if (field.type === 'section') continue;
    if (!String(field.label || '').trim()) throw new Error('Every form field needs a label');
    if (['select', 'radio', 'multi_select'].includes(field.type) && (!Array.isArray(field.options) || !field.options.length)) throw new Error('Choice fields require options');
    if (Array.isArray(field.conditions)) {
      field.conditions.forEach((condition) => {
        if (!ids.has(condition.fieldId)) throw new Error('Conditional fields must reference an earlier field');
      });
    }
  }
  return true;
};

const buildVisibilityQuery = (query) => {
  const filter = { status: 'published', closingDate: { $gte: new Date() } };
  const search = String(query.q || '').trim();
  if (search) filter.$text = { $search: search };
  if (query.category) filter.category = String(query.category).trim();
  return filter;
};

async function listPublicConcours(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  await Concours.updateMany({ status: 'published', closingDate: { $lt: new Date() } }, { $set: { status: 'closed' } });
  const filter = buildVisibilityQuery(query);
  const [items, total] = await Promise.all([
    Concours.find(filter).select('title shortDescription organizationName logoUrl category location openingDate closingDate selectionDate featured status applicationForm.published').sort({ featured: -1, closingDate: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Concours.countDocuments(filter),
  ]);
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

async function markExpiredPartnership(user) {
  if (user?.partnership?.status === 'active' && user.partnership.expires_at && new Date(user.partnership.expires_at) <= new Date()) {
    await User.updateOne({ _id: user._id }, { $set: { 'partnership.status': 'expired' } });
    return 'expired';
  }
  return user?.partnership?.status || null;
}

async function createApplication(concoursId, req) {
  const concours = await Concours.findOne({ _id: concoursId, status: 'published' });
  if (!concours) throw Object.assign(new Error('Concours is not available'), { statusCode: 404 });
  if (!concours.applicationForm?.published) throw Object.assign(new Error('This concours application form is not available'), { statusCode: 400 });
  if (new Date(concours.closingDate) < new Date()) throw Object.assign(new Error('Application deadline has passed'), { statusCode: 400 });
  const user = await User.findOne({ cand_id: req.user.cand_id }).lean();
  if (!user) throw Object.assign(new Error('Candidate not found'), { statusCode: 404 });
  const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  const snapshot = profileSnapshot(user);
  const fields = concours.applicationForm?.fields || [];
  for (const field of fields) {
    if (field.required && field.type !== 'section' && (answers[field.id] === undefined || answers[field.id] === null || answers[field.id] === '')) throw Object.assign(new Error(`Required field missing: ${field.label}`), { statusCode: 400 });
  }
  try {
    return await ConcoursApplication.create({ candidateId: user._id, candidateCandId: user.cand_id, concoursId, partnerId: concours.partnerId, status: 'submitted', answers, profileSnapshot: snapshot, submittedAt: new Date(), timeline: [{ status: 'submitted', actorId: user.cand_id }] });
  } catch (err) {
    if (err.code === 11000) throw Object.assign(new Error('You have already applied to this concours'), { statusCode: 409 });
    throw err;
  }
}

module.exports = { profileSnapshot, validateForm, buildVisibilityQuery, listPublicConcours, createApplication, markExpiredPartnership, canAccessPartner, isDeveloper };
