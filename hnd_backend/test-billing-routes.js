/**
 * Local billing routes test — run with: node test-billing-routes.js
 * Tests GET /api/admin/billing/subscriptions, PUT, and DELETE
 * Fetches a real user from DB to pass the auth middleware's DB lookup.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000;

function httpReq(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Origin': 'http://localhost:3000',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function run() {
  // Connect to DB to find a real developer account (auth middleware does a DB lookup)
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const User = require('./models/User');
  const adminUser = await User.findOne(
    { role: 'developer', account_status: 'active' },
    'cand_id email name role dpt_id account_status'
  ).lean();

  if (!adminUser) {
    console.error('No developer user found in DB.');
    process.exit(1);
  }
  console.log('Using DB user:', adminUser.email, '| role:', adminUser.role, '| cand_id:', adminUser.cand_id, '\n');

  const token = jwt.sign(
    {
      cand_id: adminUser.cand_id,
      email: adminUser.email,
      name: adminUser.name || 'Admin',
      dpt_id: adminUser.dpt_id || null,
      role: adminUser.role,
      is_admin: true,
      program: 'HND',
      preferred_language: 'en',
      account_status: 'active',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  await mongoose.disconnect();

  // --- TEST 1 ---
  console.log('=== TEST 1: GET /api/admin/billing/subscriptions?page=1&limit=5 ===');
  const list = await httpReq('GET', '/api/admin/billing/subscriptions?page=1&limit=5', token);
  console.log('Status:', list.status);
  if (list.status !== 200) {
    console.log('Body:', JSON.stringify(list.body, null, 2));
    console.error('FAIL: Expected 200.');
    process.exit(1);
  }
  const subs = list.body.subscriptions || [];
  console.log('OK — returned', subs.length, 'subscriptions. Pagination:', JSON.stringify(list.body.pagination));

  if (subs.length === 0) {
    console.log('\nNo candidates in DB — skipping PUT/DELETE tests.');
    console.log('\n=== ALL BILLING ROUTE TESTS PASSED (no candidates) ===');
    process.exit(0);
  }

  const target = subs.find((s) => s.cand_id !== adminUser.cand_id) || subs[0];
  console.log('Target candidate:', target.cand_id, target.email);

  // --- TEST 2 ---
  const newPlan = target.plan === 'pro' ? 'basic' : 'pro';
  console.log('\n=== TEST 2: PUT /api/admin/billing/subscriptions/' + target.cand_id + ' ===');
  const upd = await httpReq('PUT', '/api/admin/billing/subscriptions/' + target.cand_id, token, {
    plan: newPlan,
    status: 'active',
  });
  console.log('Status:', upd.status);
  if (upd.status !== 200) {
    console.log('Body:', JSON.stringify(upd.body, null, 2));
    console.error('FAIL: Expected 200 on PUT.');
    process.exit(1);
  }
  console.log('OK —', upd.body.message || 'updated');
  // Restore original plan
  await httpReq('PUT', '/api/admin/billing/subscriptions/' + target.cand_id, token, { plan: target.plan || 'basic' });

  // --- TEST 3 ---
  console.log('\n=== TEST 3: DELETE /api/admin/billing/subscriptions/' + target.cand_id + ' ===');
  const del = await httpReq('DELETE', '/api/admin/billing/subscriptions/' + target.cand_id, token);
  console.log('Status:', del.status);
  if (del.status !== 200) {
    console.log('Body:', JSON.stringify(del.body, null, 2));
    console.error('FAIL: Expected 200 on DELETE.');
    process.exit(1);
  }
  console.log('OK —', del.body.message || 'cancelled');

  console.log('\n=== ALL THREE BILLING ROUTE TESTS PASSED LOCALLY ===');
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
