const express = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const router = express.Router();
const db = require('../Database/db'); // Adjust the path as necessary
const VerificationCode = require('../models/VerificationCode');

// Utility function to log errors
const logError = (error, context) => {
    console.error(`Error in ${context}:`, error);
};

// Utility function for database queries
const queryDatabase = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) {
                logError(err, 'Database Query');
                return reject(err);
            }
            resolve(results);
        });
    });
};

// Registration endpoint
router.post('/register', async (req, res) => {
    const { name, dpt_id, email, phone, password } = req.body;
  
    try {
      // 1. Validate input
      if (!name || !dpt_id || !email || !phone || !password) {
        return res.status(400).json({ message: 'All fields are required.' });
      }
  
      // 2. Validate department exists
      const deptSql = 'SELECT dpt_id, department_name FROM dpts WHERE dpt_id = ?';
      const deptResults = await queryDatabase(deptSql, [dpt_id]);
      if (!deptResults.length) {
        return res.status(404).json({ message: 'Invalid department selected.' });
      }
      const departmentName = deptResults[0].department_name;
  
      // 3. Check for existing user
      const userCheckSql = 'SELECT * FROM users WHERE email = ? OR phone = ? OR name = ?';
      const existingUsers = await queryDatabase(userCheckSql, [email, phone, name]);
      if (existingUsers.length) {
        return res.status(409).json({ message: 'User already exists with this email, phone, or name.' });
      }
  
      // 4. Hash password securely
      const hashedPassword = await bcrypt.hash(password, 12);
  
      // 5. Insert user into database
      const insertSql = `
        INSERT INTO users (name, dpt_id, email, phone, password)
        VALUES (?, ?, ?, ?, ?)
      `;
      await queryDatabase(insertSql, [name, dpt_id, email, phone, hashedPassword]);
  
      // 6. Respond with sanitized user info
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          name,
          email,
          phone,
          department: departmentName,
          dpt_id,
        }
      });
  
    } catch (error) {
      logError(error, 'Registration');
      res.status(500).json({ message: 'Server error during registration.' });
    }
  });
  
// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const sql = 'SELECT cand_id, name, email, password FROM users WHERE email = ?';
      const results = await queryDatabase(sql, [email]);
  
      if (results.length === 0) {
        return res.status(401).json({ message: 'User not found' });
      }
  
      const user = results[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
      const { cand_id, email: returnedEmail, name } = user;
  
      return res.json({
        message: 'Login successful',
        cand_id,
        email: returnedEmail,
        name: name || 'Guest',
      });
    } catch (error) {
      logError(error, 'Login');
      return res.status(500).json({ message: 'Database error during login' });
    }
  });
  
// Reset Password
router.post('/reset-password', async (req, res) => {
    const { email } = req.body;
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expirationTime = Date.now() + 5 * 60 * 1000; // 5 minutes

    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset Code',
        text: `Your password reset code is: ${verificationCode}`
    };

    try {
        await transporter.sendMail(mailOptions);
        await VerificationCode.findOneAndUpdate(
            { email },
            { code: verificationCode, expiresAt: new Date(expirationTime), used: false },
            { upsert: true, returnDocument: 'after' }
        );
        res.json({ message: 'Verification code sent to your email' });
    } catch (error) {
        logError(error, 'Sending reset password email');
        res.status(500).json({ message: 'Error sending verification code' });
    }
});

// Update Password
router.post('/update-password', async (req, res) => {
    const { email, code, newPassword } = req.body;

    try {
        const storedCode = await VerificationCode.findOne({ email, used: false });
        if (!storedCode || storedCode.code !== code || Date.now() > storedCode.expiresAt.getTime()) {
            return res.status(400).json({ message: 'Invalid or expired verification code' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const sql = 'UPDATE users SET password = ? WHERE email = ?';
        await queryDatabase(sql, [hashedPassword, email]);
        await VerificationCode.findOneAndUpdate({ email }, { used: true });
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        logError(error, 'Updating password');
        res.status(500).json({ message: 'Database error during password update' });
    }
});

module.exports = router;