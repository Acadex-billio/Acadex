require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const candId = 'CI_TEST_USER';
  const data = {
    cand_id: candId,
    email: 'ci-test@example.com',
    name: 'CI Test User',
    role: 'candidate',
    program: 'HND',
    account_status: 'active',
  };
  await User.findOneAndUpdate({ cand_id: candId }, { $set: data }, { upsert: true, returnDocument: 'after' });
  console.log('[create_ci_user] Upserted CI test user');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
