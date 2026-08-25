require('dotenv').config();
const https = require('https');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const User = require('./models/User');
  const u = await User.findOne(
    { role: 'developer', account_status: 'active' },
    'cand_id email name role dpt_id account_status'
  ).lean();
  await mongoose.disconnect();

  const tok = jwt.sign(
    { cand_id: u.cand_id, email: u.email, name: u.name || 'Admin', dpt_id: u.dpt_id || null, role: u.role, is_admin: true, program: 'HND', preferred_language: 'en', account_status: 'active' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const opts = {
    hostname: 'hnd-platform-backend.onrender.com',
    path: '/api/admin/billing/subscriptions?page=1&limit=5',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + tok,
      'Origin': 'https://www.acadexe.com',
      'Content-Type': 'application/json'
    }
  };

  console.log('Probing live Render backend...');
  const r = https.request(opts, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      try { console.log('BODY:', JSON.stringify(JSON.parse(d), null, 2)); }
      catch { console.log('BODY:', d.substring(0, 500)); }
    });
  });
  r.on('error', e => console.error('ERR:', e.message));
  r.end();
}).catch(e => { console.error(e.message); process.exit(1); });
