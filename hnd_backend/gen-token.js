require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const User = require('./models/User');
  const u = await User.findOne(
    { role: { $in: ['developer', 'superadmin'] }, account_status: 'active' },
    'cand_id email name role dpt_id account_status'
  ).lean();
  await mongoose.disconnect();
  const tok = jwt.sign(
    { cand_id: u.cand_id, email: u.email, name: u.name || 'Admin', dpt_id: u.dpt_id || null, role: u.role, is_admin: true, program: 'HND', preferred_language: 'en', account_status: 'active', token_type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  console.log('TOKEN:' + tok);
}).catch(e => { console.error(e.message); process.exit(1); });
