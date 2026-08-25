const USER_ROLES = Object.freeze({
  CANDIDATE: 'candidate',
  LECTURER: 'lecturer',
  ADMIN: 'admin',
  DEVELOPER: 'developer',
  SUPERADMIN: 'superadmin',
  CONCOUR_PARTNER: 'concour_partner',
});

const ACCOUNT_STATUSES = Object.freeze({
  ACTIVE: 'active',
  PENDING_APPROVAL: 'pending_approval',
  SUSPENDED: 'suspended',
  BLOCKED: 'blocked',
});

const SUBSCRIPTION_PLANS = Object.freeze({
  BASIC: 'basic',
  PRO: 'pro',
  PAYGO: 'paygo',
  FULL_PACKAGE: 'full-package',
});

const SUBSCRIPTION_STATUSES = Object.freeze({
  ACTIVE: 'active',
  EXPIRED: 'expired',
});

const COMPLAINT_STATUSES = Object.freeze({
  PENDING: 'pending',
  REVIEWED: 'reviewed',
});

const USER_PROGRAMS = Object.freeze({
  HND: 'HND',
  BTS: 'BTS',
  LECTURER: 'LECTURER',
  BACHELOR: 'BACHELOR',
  MASTERS: 'MASTERS',
  LICENCE: 'LICENCE',
  MASTER: 'MASTER',
});

module.exports = {
  USER_ROLES,
  ACCOUNT_STATUSES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  COMPLAINT_STATUSES,
  USER_PROGRAMS,
};
