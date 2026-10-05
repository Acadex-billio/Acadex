'use strict';

const Program = require('../models/Program');
const { ensureDefaultPrograms, listPrograms, normalizeProgramCode } = require('../services/programCatalogService');

const normalizeAliases = (aliases, code) => [...new Set((Array.isArray(aliases) ? aliases : [])
  .map(normalizeProgramCode)
  .filter((alias) => alias && alias !== code))];

const validatePayload = async (payload, { creating = false, currentCode = '' } = {}) => {
  const code = creating ? normalizeProgramCode(payload.code) : currentCode;
  const name = String(payload.name || '').trim();
  const abbreviation = String(payload.abbreviation || '').trim().toUpperCase();
  const language = String(payload.language || '').trim().toLowerCase();
  const departmentTrack = payload.department_track === '' ? null : (payload.department_track ?? null);
  const visibilityGroup = String(payload.visibility_group || '').trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)) return { error: 'Program code must be 2-32 uppercase letters, digits, or underscores.' };
  if (!name || name.length > 100) return { error: 'Program name is required and must be 100 characters or fewer.' };
  if (!abbreviation || abbreviation.length > 20) return { error: 'Program abbreviation is required and must be 20 characters or fewer.' };
  if (!['en', 'fr'].includes(language)) return { error: 'Program language must be en or fr.' };
  if (departmentTrack !== null && !['HND', 'BTS'].includes(departmentTrack)) return { error: 'Department track must be HND, BTS, or empty.' };
  if (!visibilityGroup || visibilityGroup.length > 40) return { error: 'Visibility group is required and must be 40 characters or fewer.' };

  const targetCode = normalizeProgramCode(payload.candidate_project_target_code);
  const projectEnabled = Boolean(payload.candidate_project_enabled);
  if (projectEnabled && !targetCode) return { error: 'Select a target program for candidate-project submissions.' };
  if (targetCode && targetCode !== code) {
    const target = await Program.findOne({ code: targetCode, is_active: true }).select('code').lean();
    if (!target) return { error: 'Candidate-project target program must be active.' };
  }

  const aliases = normalizeAliases(payload.aliases, code);
  const possibleCodes = [code, ...aliases];
  const conflict = await Program.findOne({
    code: { $ne: currentCode || code },
    $or: [
      { code: { $in: possibleCodes } },
      { aliases: { $in: possibleCodes } },
    ],
  }).select('code').lean();
  if (conflict) return { error: `Program code or alias conflicts with ${conflict.code}.` };

  return {
    value: {
      name,
      abbreviation,
      language,
      department_track: departmentTrack,
      visibility_group: visibilityGroup,
      candidate_project_enabled: projectEnabled,
      candidate_project_target_code: projectEnabled ? targetCode : null,
      aliases,
      display_order: Number.isFinite(Number(payload.display_order)) ? Number(payload.display_order) : 0,
    },
  };
};

exports.listActive = async (_req, res) => {
  try {
    const programs = await listPrograms();
    return res.json({ success: true, programs });
  } catch (error) {
    console.error('[Programs] Public list failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load programs.' });
  }
};

exports.listManaged = async (_req, res) => {
  try {
    const programs = await listPrograms({ includeInactive: true });
    return res.json({ success: true, programs });
  } catch (error) {
    console.error('[Programs] Managed list failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load program catalog.' });
  }
};

exports.create = async (req, res) => {
  try {
    await ensureDefaultPrograms();
    const code = normalizeProgramCode(req.body?.code);
    const { error, value } = await validatePayload(req.body || {}, { creating: true });
    if (error) return res.status(400).json({ success: false, message: error });
    const program = await Program.create({
      code,
      ...value,
      is_active: true,
      created_by: req.user?.cand_id || null,
      updated_by: req.user?.cand_id || null,
    });
    return res.status(201).json({ success: true, program });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: 'Program code already exists.' });
    console.error('[Programs] Create failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to create program.' });
  }
};

exports.update = async (req, res) => {
  try {
    const code = normalizeProgramCode(req.params.code);
    const { error, value } = await validatePayload(req.body || {}, { currentCode: code });
    if (error) return res.status(400).json({ success: false, message: error });
    const program = await Program.findOneAndUpdate(
      { code },
      { $set: { ...value, updated_by: req.user?.cand_id || null } },
      { new: true, runValidators: true }
    );
    if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });
    return res.json({ success: true, program });
  } catch (error) {
    console.error('[Programs] Update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to update program.' });
  }
};

exports.deactivate = async (req, res) => {
  try {
    const code = normalizeProgramCode(req.params.code);
    const program = await Program.findOneAndUpdate(
      { code },
      { $set: { is_active: false, updated_by: req.user?.cand_id || null } },
      { new: true }
    );
    if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });
    return res.json({ success: true, program });
  } catch (error) {
    console.error('[Programs] Deactivation failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to deactivate program.' });
  }
};

exports.activate = async (req, res) => {
  try {
    const code = normalizeProgramCode(req.params.code);
    const program = await Program.findOneAndUpdate(
      { code },
      { $set: { is_active: true, updated_by: req.user?.cand_id || null } },
      { new: true }
    );
    if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });
    return res.json({ success: true, program });
  } catch (error) {
    console.error('[Programs] Reactivation failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to reactivate program.' });
  }
};