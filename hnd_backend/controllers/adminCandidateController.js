const User = require('../models/User');
const PaymentTransaction = require('../models/PaymentTransaction');
const { sendEmail } = require('../services/emailService');
const { sendWebPushNotification, isWebPushConfigured } = require('../utils/webPush');

const normalizeCandId = (v) => String(v || '').trim();

exports.listCandidates = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(400, Math.max(1, parseInt(req.query.limit, 10) || 400));
    const skip = (page - 1) * limit;
    const query = { role: { $ne: 'admin' } };
    if (q) {
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ cand_id: { $regex: escapedQ, $options: 'i' } }, { name: { $regex: escapedQ, $options: 'i' } }, { email: { $regex: escapedQ, $options: 'i' } }];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('cand_id name dpt_id account_status')
        .populate('dpt_id', 'department_name abbreviation')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return res.json({
      success: true,
      candidates: users.map((u) => ({
        cand_id: u.cand_id,
        name: u.name,
        department_name: u.dpt_id?.department_name || null,
        department_abbreviation: u.dpt_id?.abbreviation || null,
        account_status: u.account_status || 'active',
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to list candidates' });
  }
};

exports.getCandidateDetails = async (req, res) => {
  try {
    const candId = normalizeCandId(req.params?.candId);
    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });

    const u = await User.findOne({ cand_id: candId })
      .select(
        'cand_id name email phone address profile_picture dpt_id role program academic_year allow_emails createdAt account_status suspension block complaints'
      )
      .populate('dpt_id', 'department_name abbreviation motto')
      .lean();

    if (!u) return res.status(404).json({ success: false, message: 'Candidate not found' });

    return res.json({
      success: true,
      candidate: {
        cand_id: u.cand_id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        address: u.address,
        profile_picture: u.profile_picture,
        role: u.role || 'candidate',
        program: String(u.program || 'HND').toUpperCase(),
        academic_year: u.academic_year,
        allow_emails: u.allow_emails,
        createdAt: u.createdAt,
        account_status: u.account_status || 'active',
        suspension: u.suspension || null,
        block: u.block || null,
        complaints: Array.isArray(u.complaints) ? u.complaints : [],
        department: u.dpt_id
          ? {
              department_name: u.dpt_id.department_name,
              abbreviation: u.dpt_id.abbreviation,
              motto: u.dpt_id.motto,
            }
          : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch candidate' });
  }
};

exports.listComplaints = async (req, res) => {
  try {
    const users = await User.find({ 'complaints.0': { $exists: true } })
      .select('cand_id name email complaints')
      .lean();

    const complaints = users.flatMap((u) =>
      (Array.isArray(u.complaints) ? u.complaints : []).map((c) => ({
        cand_id: u.cand_id,
        name: u.name,
        email: u.email,
        text: c.text,
        status: c.status || 'pending',
        createdAt: c.createdAt,
        reviewedAt: c.reviewedAt || null,
        reviewedBy: c.reviewedBy || null,
      }))
    );

    return res.json({ success: true, complaints });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load complaints' });
  }
};

exports.suspendCandidate = async (req, res) => {
  try {
    const adminCandId = normalizeCandId(req.user?.cand_id);
    const candId = normalizeCandId(req.params?.candId);
    const start_at = req.body?.start_at ? new Date(req.body.start_at) : null;
    const end_at = req.body?.end_at ? new Date(req.body.end_at) : null;
    const reason = String(req.body?.reason || '').trim();

    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });
    if (!start_at || Number.isNaN(start_at.getTime())) return res.status(400).json({ success: false, message: 'Valid start_at is required' });
    if (!end_at || Number.isNaN(end_at.getTime())) return res.status(400).json({ success: false, message: 'Valid end_at is required' });
    if (end_at <= start_at) return res.status(400).json({ success: false, message: 'end_at must be after start_at' });
    if (!reason) return res.status(400).json({ success: false, message: 'Reason is required' });

    const updated = await User.findOneAndUpdate(
      { cand_id: candId, role: { $ne: 'admin' } },
      {
        $set: {
          account_status: 'suspended',
          suspension: {
            start_at,
            end_at,
            reason,
            set_by: adminCandId || null,
            set_at: new Date(),
          },
          block: { reason: null, set_by: null, set_at: null },
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ success: false, message: 'Candidate not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to suspend candidate' });
  }
};

exports.blockCandidate = async (req, res) => {
  try {
    const adminCandId = normalizeCandId(req.user?.cand_id);
    const candId = normalizeCandId(req.params?.candId);
    const reason = String(req.body?.reason || '').trim();

    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });
    if (!reason) return res.status(400).json({ success: false, message: 'Reason is required' });

    const updated = await User.findOneAndUpdate(
      { cand_id: candId, role: { $ne: 'admin' } },
      {
        $set: {
          account_status: 'blocked',
          block: { reason, set_by: adminCandId || null, set_at: new Date() },
          suspension: { start_at: null, end_at: null, reason: null, set_by: null, set_at: null },
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ success: false, message: 'Candidate not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to block candidate' });
  }
};

exports.reactivateCandidate = async (req, res) => {
  try {
    const candId = normalizeCandId(req.params?.candId);
    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });

    const updated = await User.findOneAndUpdate(
      { cand_id: candId, role: { $ne: 'admin' } },
      {
        $set: {
          account_status: 'active',
          suspension: { start_at: null, end_at: null, reason: null, set_by: null, set_at: null },
          block: { reason: null, set_by: null, set_at: null },
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ success: false, message: 'Candidate not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to reactivate candidate' });
  }
};

exports.markComplaintsReviewed = async (req, res) => {
  try {
    const adminCandId = normalizeCandId(req.user?.cand_id);
    const candId = normalizeCandId(req.params?.candId);
    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });

    const user = await User.findOne({ cand_id: candId }).select('complaints').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Candidate not found' });

    const nextComplaints = (user.complaints || []).map((c) => {
      if (c.status === 'pending') {
        return { ...c, status: 'reviewed', reviewedAt: new Date(), reviewedBy: adminCandId || null };
      }
      return c;
    });

    await User.updateOne({ cand_id: candId }, { $set: { complaints: nextComplaints } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to mark complaints reviewed' });
  }
};

// Superadmin functions
exports.listAllUsers = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const skip = (page - 1) * limit;
    const program = String(req.query.program || '').trim().toUpperCase();
    const role = String(req.query.role || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim().toLowerCase();

    const query = {};
    if (['HND', 'BTS', 'LECTURER'].includes(program)) query.program = program;
    if (['candidate', 'lecturer', 'admin', 'developer', 'superadmin'].includes(role)) query.role = role;
    if (['active', 'pending_approval', 'suspended', 'blocked'].includes(status)) query.account_status = status;
    if (q) {
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { cand_id: { $regex: escapedQ, $options: 'i' } },
        { name: { $regex: escapedQ, $options: 'i' } },
        { email: { $regex: escapedQ, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('cand_id name email role program preferred_language push_subscription dpt_id account_status createdAt')
        .populate('dpt_id', 'department_name abbreviation')
        .sort({ role: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return res.json({
      success: true,
      users: users.map((u) => ({
        cand_id: u.cand_id,
        name: u.name,
        email: u.email,
        role: u.role,
        program: String(u.program || 'HND').toUpperCase(),
        preferred_language: String(u.preferred_language || (String(u.program || 'HND').toUpperCase() === 'BTS' ? 'fr' : 'en')).toLowerCase(),
        department_name: u.dpt_id?.department_name || null,
        department_abbreviation: u.dpt_id?.abbreviation || null,
        account_status: u.account_status || 'active',
        has_push_subscription: Boolean(u.push_subscription?.endpoint),
        createdAt: u.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to list users' });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const candId = normalizeCandId(req.params?.candId);
    const role = String(req.body?.role || '').toLowerCase();
    const actorRole = String(req.user?.role || '').toLowerCase();

    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });
    if (!['candidate', 'lecturer', 'admin', 'developer', 'superadmin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Must be candidate, lecturer, admin, developer, or superadmin' });
    }

    const canAssignPrivilegedRole = actorRole === 'superadmin';
    if (!canAssignPrivilegedRole && role !== 'candidate') {
      return res.status(403).json({ success: false, message: 'Only superadmin can assign admin, developer, or superadmin roles' });
    }
    if (actorRole === 'developer' && role === 'superadmin') {
      return res.status(403).json({ success: false, message: 'Developer cannot assign superadmin role' });
    }

    const user = await User.findOne({ cand_id: candId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Prevent demoting the last superadmin
    if (user.role === 'superadmin' && role !== 'superadmin') {
      const superadminCount = await User.countDocuments({ role: 'superadmin' });
      if (superadminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot demote the last superadmin' });
      }
    }

    const previousRole = String(user.role || 'candidate');
    user.role = role;
    await user.save();

    if (previousRole !== role) {
      const preferred = String(user.preferred_language || (String(user.program || 'HND').toUpperCase() === 'BTS' ? 'fr' : 'en')).toLowerCase();
      const isPromoted = role === 'admin' && previousRole === 'candidate';
      const emailSubject = preferred === 'fr'
        ? (isPromoted ? 'Votre role a ete mis a jour: administrateur' : 'Votre role a ete mis a jour: candidat')
        : (isPromoted ? 'Your role has been updated: admin' : 'Your role has been updated: candidate');
      const emailText = preferred === 'fr'
        ? (isPromoted
          ? `Bonjour ${user.name || ''},\n\nVotre role sur Acadex a ete mis a jour en tant qu'administrateur.\n\nConnectez-vous pour acceder aux fonctionnalites admin.\n\n- Equipe Acadex`
          : `Bonjour ${user.name || ''},\n\nVotre role sur Acadex a ete modifie en candidat.\n\nConnectez-vous pour continuer a utiliser la plateforme.\n\n- Equipe Acadex`)
        : (isPromoted
          ? `Hello ${user.name || ''},\n\nYour role on Acadex has been updated to admin.\n\nPlease log in to access admin features.\n\n- Acadex Team`
          : `Hello ${user.name || ''},\n\nYour role on Acadex has been updated to candidate.\n\nPlease log in to continue using the platform.\n\n- Acadex Team`);

      if (user.email) {
        try {
          await sendEmail({ to: user.email, subject: emailSubject, text: emailText });
        } catch (err) {
          console.warn('[AdminCandidate] Role update email failed:', err?.message || err);
        }
      }

      if (isWebPushConfigured && user.push_subscription?.endpoint) {
        const pushTitle = preferred === 'fr'
          ? (isPromoted ? 'Role mis a jour: administrateur' : 'Role mis a jour: candidat')
          : (isPromoted ? 'Role updated: admin' : 'Role updated: candidate');
        const pushBody = preferred === 'fr'
          ? (isPromoted
            ? 'Vous avez ete promu administrateur. Connectez-vous pour voir les nouveaux acces.'
            : 'Vous avez ete reaffecte comme candidat.')
          : (isPromoted
            ? 'You were promoted to admin. Log in to see your new access.'
            : 'You were reassigned to candidate.');
        try {
          await sendWebPushNotification(user.push_subscription, {
            title: pushTitle,
            body: pushBody,
            source: 'role_change',
            contentType: 'role_change',
            contentId: String(user.cand_id),
            url: isPromoted ? '/admin' : '/candidate',
            tag: `role-change-${user.cand_id}-${Date.now()}`,
          });
        } catch (err) {
          console.warn('[AdminCandidate] Role update push failed:', err?.message || err);
        }
      }
    }

    return res.json({ success: true, message: `User role updated to ${role}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to update user role' });
  }
};

exports.suspendUser = async (req, res) => {
  try {
    const candId = normalizeCandId(req.params?.candId);
    const { reason, duration_days } = req.body;

    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });
    if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Suspension reason is required' });

    const user = await User.findOne({ cand_id: candId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const startAt = new Date();
    const endAt = duration_days ? new Date(startAt.getTime() + duration_days * 24 * 60 * 60 * 1000) : null;

    user.account_status = 'suspended';
    user.suspension = {
      start_at: startAt,
      end_at: endAt,
      reason: reason.trim(),
      set_by: req.user.cand_id,
      set_at: startAt,
    };
    await user.save();

    return res.json({ success: true, message: 'User suspended successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to suspend user' });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const candId = normalizeCandId(req.params?.candId);
    const { reason } = req.body;

    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });
    if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Block reason is required' });

    const user = await User.findOne({ cand_id: candId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Prevent blocking the last superadmin
    if (user.role === 'superadmin') {
      const superadminCount = await User.countDocuments({ role: 'superadmin', account_status: 'active' });
      if (superadminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot block the last active superadmin' });
      }
    }

    user.account_status = 'blocked';
    user.block = {
      reason: reason.trim(),
      set_by: req.user.cand_id,
      set_at: new Date(),
    };
    await user.save();

    return res.json({ success: true, message: 'User blocked successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to block user' });
  }
};

exports.reactivateUser = async (req, res) => {
  try {
    const candId = normalizeCandId(req.params?.candId);

    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });

    const user = await User.findOne({ cand_id: candId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.account_status = 'active';
    user.suspension = null;
    user.block = null;
    await user.save();

    return res.json({ success: true, message: 'User reactivated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to reactivate user' });
  }
};

// ─── Billing / Subscription Management ───────────────────────────────────────

exports.listSubscriptions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const planFilter = String(req.query.plan || '').trim();
    const statusFilter = String(req.query.status || '').trim();
    const search = String(req.query.search || '').trim();

    const query = { role: 'candidate' };
    if (planFilter) query['subscription.plan'] = planFilter;
    if (statusFilter) query['subscription.status'] = statusFilter;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { cand_id: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('cand_id name email subscription account_status')
      .sort({ 'subscription.expires_at': -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      subscriptions: users.map((u) => ({
        cand_id: u.cand_id,
        name: u.name,
        email: u.email,
        account_status: u.account_status,
        plan: u.subscription?.plan || 'basic',
        status: u.subscription?.status || 'active',
        activated_at: u.subscription?.activated_at || null,
        expires_at: u.subscription?.expires_at || null,
        last_payment_at: u.subscription?.last_payment_at || null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to list subscriptions' });
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const candId = normalizeCandId(req.params?.candId);
    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });

    const { plan, status, expires_at } = req.body || {};
    const VALID_PLANS = ['basic', 'pro', 'paygo'];
    const VALID_STATUSES = ['active', 'expired'];

    const user = await User.findOne({ cand_id: candId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (plan !== undefined) {
      if (!VALID_PLANS.includes(plan)) {
        return res.status(400).json({ success: false, message: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` });
      }
      user.subscription.plan = plan;
    }
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      user.subscription.status = status;
    }
    if (expires_at !== undefined) {
      const d = expires_at ? new Date(expires_at) : null;
      if (expires_at && isNaN(d?.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid expires_at date' });
      }
      user.subscription.expires_at = d;
    }

    await user.save();
    return res.json({ success: true, message: 'Subscription updated', subscription: user.subscription });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to update subscription' });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const candId = normalizeCandId(req.params?.candId);
    if (!candId) return res.status(400).json({ success: false, message: 'candId is required' });

    const user = await User.findOne({ cand_id: candId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.subscription.plan = 'basic';
    user.subscription.status = 'expired';
    user.subscription.expires_at = new Date();
    await user.save();

    return res.json({ success: true, message: 'Subscription cancelled' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to cancel subscription' });
  }
};

exports.listManualPaymentVerifications = async (req, res) => {
  try {
    const statusFilter = String(req.query.status || 'pending').trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

    const query = {
      provider: 'manual_momo',
      purpose_type: 'subscription',
    };

    if (statusFilter === 'pending') query.status = 'pending';
    if (statusFilter === 'approved') query.status = 'successful';
    if (statusFilter === 'rejected') query.status = 'failed';

    const transactions = await PaymentTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const candidateIds = [...new Set(transactions.map((txn) => String(txn.user_cand_id || '').trim()).filter(Boolean))];
    const users = await User.find({ cand_id: { $in: candidateIds } })
      .select('cand_id name email phone subscription')
      .lean();
    const usersByCandId = new Map(users.map((user) => [String(user.cand_id), user]));

    const queue = transactions.map((txn) => {
      const user = usersByCandId.get(String(txn.user_cand_id || '')) || {};
      const manualSubmission = txn.metadata?.manual_submission || {};
      return {
        transaction_id: txn._id,
        cand_id: txn.user_cand_id,
        candidate_name: user.name || null,
        candidate_email: user.email || null,
        candidate_phone: user.phone || null,
        current_plan: user.subscription?.plan || 'basic',
        requested_plan: String(txn.metadata?.plan_code || txn.purpose_code || '').replace('plan_', '') || null,
        amount: txn.amount,
        currency: txn.currency,
        status: txn.status,
        proof_text: manualSubmission.payment_proof || null,
        recipient_number: manualSubmission.recipient_number || null,
        recipient_name: manualSubmission.recipient_name || null,
        submitted_at: manualSubmission.submitted_at || txn.createdAt,
        verified_at: manualSubmission.verified_at || null,
        verified_by: manualSubmission.verified_by || null,
        reviewer_note: manualSubmission.reviewer_note || null,
        createdAt: txn.createdAt,
      };
    });

    return res.json({ success: true, queue });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load manual payment verifications' });
  }
};

exports.approveManualPaymentVerification = async (req, res) => {
  try {
    const reviewerCandId = normalizeCandId(req.user?.cand_id) || null;
    const transactionId = String(req.params?.transactionId || '').trim();
    const reviewerNote = String(req.body?.note || '').trim().slice(0, 500);
    if (!transactionId) return res.status(400).json({ success: false, message: 'transactionId is required' });

    const transaction = await PaymentTransaction.findOne({
      _id: transactionId,
      provider: 'manual_momo',
      purpose_type: 'subscription',
    });

    if (!transaction) return res.status(404).json({ success: false, message: 'Manual payment transaction not found' });
    if (transaction.status === 'successful') {
      return res.json({ success: true, message: 'Payment already approved' });
    }

    const nextPlan = transaction.purpose_code === 'plan_pro' ? 'pro' : 'paygo';
    transaction.status = 'successful';
    transaction.completed_at = new Date();
    transaction.provider_reference = transaction.provider_reference || `MANUAL-${transaction._id}`;
    transaction.metadata = {
      ...(transaction.metadata || {}),
      manual_submission: {
        ...(transaction.metadata?.manual_submission || {}),
        verification_status: 'approved',
        verified_at: new Date(),
        verified_by: reviewerCandId,
        reviewer_note: reviewerNote || null,
      },
    };

    await transaction.save();

    await User.updateOne(
      { cand_id: transaction.user_cand_id },
      {
        $set: {
          subscription: {
            plan: nextPlan,
            status: 'active',
            activated_at: new Date(),
            expires_at: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)),
            last_payment_at: new Date(),
            phone_number: transaction.phone_number,
            source_transaction_id: transaction._id,
          },
        },
      }
    );

    return res.json({ success: true, message: 'Manual payment verified. Subscription activated.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to approve manual payment verification' });
  }
};

exports.rejectManualPaymentVerification = async (req, res) => {
  try {
    const reviewerCandId = normalizeCandId(req.user?.cand_id) || null;
    const transactionId = String(req.params?.transactionId || '').trim();
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!transactionId) return res.status(400).json({ success: false, message: 'transactionId is required' });
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });

    const transaction = await PaymentTransaction.findOne({
      _id: transactionId,
      provider: 'manual_momo',
      purpose_type: 'subscription',
    });

    if (!transaction) return res.status(404).json({ success: false, message: 'Manual payment transaction not found' });
    if (transaction.status === 'failed') {
      return res.json({ success: true, message: 'Payment already rejected' });
    }

    transaction.status = 'failed';
    transaction.completed_at = new Date();
    transaction.metadata = {
      ...(transaction.metadata || {}),
      manual_submission: {
        ...(transaction.metadata?.manual_submission || {}),
        verification_status: 'rejected',
        verified_at: new Date(),
        verified_by: reviewerCandId,
        rejection_reason: reason,
      },
    };
    await transaction.save();

    return res.json({ success: true, message: 'Manual payment rejected.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to reject manual payment verification' });
  }
};

