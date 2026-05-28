/**
 * Create Superadmin User Script
 * Run this once to create the initial superadmin user
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

async function createSuperadmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hnd_platform');

    console.log('Connected to MongoDB');

    // Check if superadmin already exists
    const existingSuperadmin = await User.findOne({ role: 'superadmin' });
    if (existingSuperadmin) {
      console.log('Superadmin already exists:', existingSuperadmin.email);
      return;
    }

    // Get the first department for the superadmin
    const Department = require('./models/Department');
    const dept = await Department.findOne().select('_id').lean();
    if (!dept) {
      console.error('No departments found. Please create a department first.');
      return;
    }

    // Create superadmin user
    const superadminData = {
      cand_id: 'SUPER001',
      name: 'Super Administrator',
      email: 'superadmin@hndplatform.com',
      password: await bcrypt.hash('SuperAdmin123!', 12), // Change this password!
      phone: '+1234567890',
      address: 'System Administration',
      dpt_id: dept._id,
      role: 'superadmin',
      academic_year: '2024',
      allow_emails: true,
      account_status: 'active',
    };

    const superadmin = new User(superadminData);
    await superadmin.save();

    console.log('Superadmin user created successfully!');
    console.log('Email: superadmin@hndplatform.com');
    console.log('Password: SuperAdmin123! (CHANGE THIS IMMEDIATELY)');
    console.log('Cand ID: SUPER001');

  } catch (error) {
    console.error('Error creating superadmin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createSuperadmin();