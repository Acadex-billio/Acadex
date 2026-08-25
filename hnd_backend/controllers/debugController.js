/**
 * Debug endpoint to check admin configuration
 */
const User = require('../models/User');

exports.debugAdmin = async (req, res) => {
  try {
    console.log('[Debug] Environment variables:', {
      ADMIN_EMAILS: process.env.ADMIN_EMAILS,
      NODE_ENV: process.env.NODE_ENV
    });

    const adminEmails = process.env.ADMIN_EMAILS ? 
      process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [];
    
    // Check all users
    const users = await User.find({}).select('email role is_admin');
    const adminUsers = users.filter(user => {
      const emailLower = user.email.toLowerCase();
      const envAdmin = adminEmails.includes(emailLower);
      const roleAdmin = user.role === 'admin' || user.role === 'developer';
      return envAdmin || roleAdmin;
    });

    res.json({
      environment: {
        ADMIN_EMAILS: process.env.ADMIN_EMAILS,
        adminEmailsArray: adminEmails
      },
      database: {
        totalUsers: users.length,
        adminUsers: adminUsers.map(u => ({
          email: u.email,
          role: u.role,
          is_admin: u.is_admin
        }))
      }
    });
  } catch (error) {
    console.error('[Debug] Error:', error);
    res.status(500).json({ error: error.message });
  }
};
