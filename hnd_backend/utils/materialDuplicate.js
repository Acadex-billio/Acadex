const crypto = require('crypto');

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const normalizeSession = (value) => normalizeText(value).replace(/\s+/g, '');

const normalizeIds = (values) => {
  const list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map((value) => String(value || '').trim()).filter(Boolean))].sort().join('|');
};

const hashBuffer = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer)) return '';
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

const buildDuplicateKey = (parts) => parts.map((part) => normalizeText(part)).join('|');

const findMaterialDuplicate = async ({ model, duplicateKey, contentHash, excludeId }) => {
  const conditions = [];
  if (duplicateKey) conditions.push({ duplicate_key: duplicateKey });
  if (contentHash) conditions.push({ content_hash: contentHash });
  if (!conditions.length) return null;

  const query = conditions.length === 1 ? conditions[0] : { $or: conditions };
  if (excludeId) query._id = { $ne: excludeId };
  return model.findOne(query).select('_id title course_title paper_type is_guide').lean();
};

const duplicateResponse = (res, material) => res.status(409).json({
  success: false,
  code: 'DUPLICATE_MATERIAL',
  message: 'A material with the same title, author, academic session, or file already exists.',
  duplicate_id: material?._id || null,
});

module.exports = {
  normalizeText,
  normalizeSession,
  normalizeIds,
  hashBuffer,
  buildDuplicateKey,
  findMaterialDuplicate,
  duplicateResponse,
};