const User = require('../models/User');
const Concours = require('../models/Concours');
const ConcoursAssignment = require('../models/ConcoursAssignment');

const role = (req) => String(req.user?.role || '').toLowerCase();
const isDeveloper = (req) => ['developer', 'superadmin'].includes(role(req));
const isPartner = (req) => role(req) === 'concour_partner';

const requireConcoursRole = (allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (!allowedRoles.includes(role(req))) return res.status(403).json({ success: false, message: 'Concours access required' });
  return next();
};

const requireActivePartnership = async (req, res, next) => {
  try {
    if (!isPartner(req)) return next();
    const user = await User.findOne({ cand_id: req.user.cand_id }).select('partnership').lean();
    const partnership = user?.partnership || {};
    if (partnership.status === 'active' && partnership.expires_at && new Date(partnership.expires_at) > new Date()) return next();
    if (partnership.status === 'active' && !partnership.expires_at) return next();
    const expired = partnership.status === 'active' || partnership.status === 'expired';
    return res.status(403).json({ success: false, code: 'PARTNERSHIP_INACTIVE', message: expired ? 'Partnership has expired' : 'Partnership activation is required', partnership_status: expired ? 'expired' : partnership.status || 'payment_required' });
  } catch (err) {
    return next(err);
  }
};

const canAccessPartner = async (req, partnerId) => {
  if (isDeveloper(req)) return true;
  if (isPartner(req)) {
    const user = await User.findOne({ cand_id: req.user.cand_id }).select('_id').lean();
    return Boolean(user && String(user._id) === String(partnerId));
  }
  if (role(req) === 'admin') {
    const assignment = await ConcoursAssignment.findOne({ adminId: req.user._id || req.user.id, partnerId, active: true }).lean();
    if (assignment) return true;
    const admin = await User.findOne({ cand_id: req.user.cand_id }).select('_id').lean();
    return Boolean(admin && await ConcoursAssignment.exists({ adminId: admin._id, partnerId, active: true }));
  }
  return false;
};

const authorizeConcours = async (req, res, next) => {
  try {
    const concours = await Concours.findById(req.params.concoursId || req.params.id).select('partnerId').lean();
    if (!concours) return res.status(404).json({ success: false, message: 'Concours not found' });
    if (!(await canAccessPartner(req, concours.partnerId))) return res.status(403).json({ success: false, message: 'You are not authorized for this partner' });
    req.concours = concours;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { role, isDeveloper, isPartner, requireConcoursRole, requireActivePartnership, canAccessPartner, authorizeConcours };
