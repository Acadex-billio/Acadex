/**
 * Auth Controller - Login, Register, Reset Password
 */
const bcrypt = require('bcryptjs');
const { randomInt } = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const History = require('../models/History');
const Department = require('../models/Department');
const VerificationCode = require('../models/VerificationCode');
const { sendEmail } = require('../services/emailService');
const { generateAccessToken, generateRefreshToken, jwtAuthMiddleware } = require('../utils/jwtUtils');
const { buildSubscriptionResponse } = require('../utils/subscriptionUtils');

const isProduction = process.env.NODE_ENV === 'production';
const ACCESS_TOKEN_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_REMEMBER_ME_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_TOKEN_DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day

const getCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  maxAge,
  path: '/',
});

const clearAuthCookies = (res) => {
  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
  res.clearCookie('access_token', options);
  res.clearCookie('refresh_token', options);
};

const generateCandId = async () => {
  // Randomized candidate ID avoids count-based race conditions under concurrent registrations.
  for (let i = 0; i < 10; i += 1) {
    const suffix = randomInt(10000, 100000);
    const candId = `CAND${suffix}`;
    const exists = await User.exists({ cand_id: candId });
    if (!exists) return candId;
  }
  throw new Error('Unable to generate candidate ID');
};

exports.register = async (req, res) => {
  try {
    const { name, dpt_id, email, phone, password, program, preferred_language } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!['HND', 'BTS', 'LECTURER'].includes(normalizedProgram)) {
      return res.status(400).json({ message: 'Program must be HND, BTS, or LECTURER.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedPhone = String(phone).trim();
    const normalizedName = String(name).trim();

    // Additional password validation
    const { validatePasswordStrength } = require('../middlewares/inputValidation');
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    let dept = null;
    if (normalizedProgram !== 'LECTURER') {
      if (!mongoose.Types.ObjectId.isValid(String(dpt_id))) {
        return res.status(400).json({ message: 'Invalid department selected.' });
      }

      dept = await Department.findById(dpt_id);
      if (!dept) return res.status(404).json({ message: 'Invalid department selected.' });
      if (String(dept.program || 'HND').toUpperCase() !== normalizedProgram) {
        return res.status(400).json({ message: `Selected department does not belong to ${normalizedProgram}.` });
      }
    }

    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: normalizedPhone }, { name: normalizedName }],
    });
    if (existing) {
      return res.status(409).json({
        message: 'User already exists with this email, phone, or name.',
      });
    }

    const isLecturer = normalizedProgram === 'LECTURER';

    let user = null;
    for (let i = 0; i < 3; i += 1) {
      try {
        const cand_id = await generateCandId();
        user = new User({
          cand_id,
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
          dpt_id: dept?._id || null,
          role: isLecturer ? 'lecturer' : 'candidate',
          program: normalizedProgram,
          preferred_language: isLecturer
            ? (['en', 'fr'].includes(String(preferred_language).toLowerCase()) ? String(preferred_language).toLowerCase() : 'en')
            : (normalizedProgram === 'BTS' ? 'fr' : 'en'),
          account_status: isLecturer ? 'pending_approval' : 'active',
          subscription: {
            plan: 'basic',
            status: 'active',
            activated_at: new Date(),
            expires_at: null,
            last_payment_at: null,
            phone_number: normalizedPhone,
            source_transaction_id: null,
          },
        });
        await user.save();
        break;
      } catch (saveErr) {
        // Retry only if we collided on cand_id; throw all other validation/db errors.
        if (!(saveErr?.code === 11000 && saveErr?.keyPattern?.cand_id)) {
          throw saveErr;
        }
      }
    }

    if (!user?._id) {
      return res.status(500).json({ message: 'Unable to complete registration. Please try again.' });
    }

    try {
      await History.create({
        user_id: String(user.cand_id),
        user_name: String(user.name || '').trim() || null,
        content_type: 'account',
        content_title: 'User account registration',
        action: 'register',
      });
    } catch (_) {
      // Non-blocking
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        department: dept?.department_name || null,
        dpt_id: dept?._id || null,
        program: user.program,
        role: user.role,
        account_status: user.account_status,
        subscription: buildSubscriptionResponse(user.subscription),
      },
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const invalidCredentialsMessage = 'Invalid email or password.';
    
    console.log('[Auth Controller] Login attempt:', { email: email?.substring(0, 5) + '***' });

    // Input validation
    if (!email || !password) {
      console.log('[Auth Controller] ❌ Missing credentials');
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required.' 
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    console.log('[Auth Controller] User lookup:', { 
      found: !!user, 
      email: user?.email?.substring(0, 5) + '***',
      role: user?.role,
      cand_id: user?.cand_id,
      account_status: user?.account_status
    });

    if (!user) {
      console.log('[Auth Controller] ❌ User not found:', { email });
      return res.status(401).json({ 
        success: false,
        message: invalidCredentialsMessage
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('[Auth Controller] Password verification:', { 
      match: isMatch, 
      cand_id: user.cand_id 
    });

    if (!isMatch) {
      console.log('[Auth Controller] ❌ Invalid password:', { cand_id: user.cand_id });
      return res.status(401).json({ 
        success: false,
        message: invalidCredentialsMessage
      });
    }

    // Check account status
    const accountStatus = String(user.account_status || 'active').toLowerCase();
    if (accountStatus !== 'active') {
      console.log('[Auth Controller] ⚠ Account not active, issuing restricted session:', {
        cand_id: user.cand_id,
        status: accountStatus 
      });
    }

    // Check admin / superadmin emails from environment
    const adminEmails = process.env.ADMIN_EMAILS ? 
      process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [];
    const superAdminEmails = process.env.SUPERADMIN_EMAILS ?
      process.env.SUPERADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [];
    const emailLower = String(user.email || '').toLowerCase();

    const envSuperAdmin = superAdminEmails.length > 0 && superAdminEmails.includes(emailLower);
    const envAdmin = adminEmails.length > 0 && adminEmails.includes(emailLower);

    let role = user.role ? String(user.role).toLowerCase() : (envSuperAdmin ? 'superadmin' : envAdmin ? 'admin' : 'candidate');
    if (envSuperAdmin) role = 'superadmin';
    else if (envAdmin && role !== 'superadmin') role = 'admin';

    const isAdmin = role === 'admin' || role === 'developer' || role === 'superadmin';

    console.log('[Auth Controller] Role determination:', {
      databaseRole: user.role,
      finalRole: role,
      isAdmin: isAdmin,
      envAdmin,
      envSuperAdmin,
      cand_id: user.cand_id
    });

    // Ensure DB role is aligned with role derived from environment list
    const previousRole = String(user.role || '').toLowerCase();
    if (role !== previousRole) {
      user.role = role;
    }

    user.login_count = Number(user.login_count || 0) + 1;
    user.last_login_at = new Date();
    if (!user.first_login_at) user.first_login_at = user.last_login_at;
    await user.save();
    if (role !== previousRole) {
      console.log('[Auth Controller] ✅ User role updated to', role);
    }

    const rememberMe = String(req.body.rememberMe || '').toLowerCase() === 'true' || req.body.rememberMe === true;
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const refreshCookieAge = rememberMe ? REFRESH_TOKEN_REMEMBER_ME_MAX_AGE : REFRESH_TOKEN_DEFAULT_MAX_AGE;

    res.cookie('access_token', accessToken, getCookieOptions(ACCESS_TOKEN_COOKIE_MAX_AGE));
    res.cookie('refresh_token', refreshToken, getCookieOptions(refreshCookieAge));

    console.log('[Auth Controller] ✅ JWT cookies set for login:', { cand_id: user.cand_id, rememberMe });

    const userData = {
      cand_id: user.cand_id,
      email: user.email,
      name: user.name || 'Guest',
      dpt_id: user.dpt_id || null,
      role,
      is_admin: isAdmin,
      program: String(user.program || 'HND').toUpperCase(),
      preferred_language: String(user.preferred_language || (String(user.program || 'HND').toUpperCase() === 'BTS' ? 'fr' : 'en')).toLowerCase(),
      account_status: accountStatus,
      subscription: buildSubscriptionResponse(user.subscription),
    };

    console.log('[Auth Controller] ✅ Login successful:', {
      cand_id: user.cand_id,
      role: role,
      is_admin: isAdmin,
      account_status: accountStatus,
      rememberMe,
    });

    try {
      await History.create({
        user_id: String(user.cand_id),
        user_name: String(user.name || '').trim() || null,
        content_type: 'account',
        content_title: 'User session authentication',
        action: 'login',
      });
    } catch (_) {
      // Non-blocking
    }
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      user: userData
    });
  } catch (err) {
    console.error('[Auth Controller] ❌ Login error:', {
      message: err.message,
      stack: err.stack?.split('\n')[0]
    });
    res.status(500).json({ 
      success: false,
      message: 'Server error during login. Please try again.' 
    });
  }
};

exports.me = async (req, res) => {
  // JWT middleware will set req.user if token is valid
  if (!req.user) {
    return res.status(200).json({ authenticated: false, user: null });
  }
  
  try {
    const candId = req.user.cand_id;
    if (candId) {
      const u = await User.findOne({ cand_id: candId }).select('account_status program preferred_language name role is_admin dpt_id subscription').lean();
      if (u?.account_status) req.user.account_status = u.account_status;
      if (u?.program) req.user.program = String(u.program).toUpperCase();
      if (u?.preferred_language) req.user.preferred_language = String(u.preferred_language).toLowerCase();
      if (u?.name) req.user.name = u.name;
      if (u?.role) req.user.role = u.role;
      if (u?.dpt_id) req.user.dpt_id = u.dpt_id;
      if (u?.subscription) req.user.subscription = buildSubscriptionResponse(u.subscription);
    }
  } catch (_) {
    // Ignore database errors, just return the token data
  }
  
  return res.status(200).json({ authenticated: true, user: req.user });
};

exports.logout = async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    let tokenUser = null;
    if (token) {
      try {
        tokenUser = await jwtAuthMiddleware(req);
      } catch (_) {
        tokenUser = null;
      }

      // Blacklist the token
      const { blacklistToken } = require('../utils/jwtUtils');
      blacklistToken(token);
      console.log('[JWT Auth] Token blacklisted on logout');
    }

    if (tokenUser?.cand_id) {
      try {
        await History.create({
          user_id: String(tokenUser.cand_id),
          user_name: String(tokenUser.name || '').trim() || null,
          content_type: 'account',
          content_title: 'User session authentication',
          action: 'logout',
        });
      } catch (_) {
        // Non-blocking
      }
    }

    console.log('[JWT Auth] Logout successful');
    res.status(200).json({ success: true, message: 'Logout successful' });
  } catch (error) {
    console.error('[JWT Auth] Logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

exports.resetPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('_id').lean();
    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Use cryptographically secure random integer (100000-999999)
    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await sendEmail({
      to: normalizedEmail,
      subject: 'Password Reset Code',
      text: `Your password reset code is: ${code}. This code expires in 5 minutes.`,
    });

    await VerificationCode.findOneAndUpdate(
      { email: normalizedEmail },
      { code, expiresAt, used: false },
      { upsert: true, new: true }
    );

    res.json({ message: 'Verification code sent to your email' });
  } catch (err) {
    console.error('[Auth] Reset request error:', err);
    res.status(500).json({ message: 'Error sending verification code' });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code, and password are required' });
    }

    // Validate password strength
    const { validatePasswordStrength } = require('../middlewares/inputValidation');
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const storedCode = await VerificationCode.findOne({ email: email.toLowerCase(), used: false });
    if (!storedCode || storedCode.code !== code || Date.now() > storedCode.expiresAt.getTime()) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password = newPassword;
    await user.save();
    await VerificationCode.findOneAndUpdate({ email: email.toLowerCase() }, { used: true });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[Auth] Update password error:', err);
    res.status(500).json({ message: 'Database error during password update' });
  }
};
