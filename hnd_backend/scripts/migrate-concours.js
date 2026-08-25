const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
const connectDB = require('../config/database');
const PlatformPricing = require('../models/PlatformPricing');
const Concours = require('../models/Concours');
const ConcoursApplication = require('../models/ConcoursApplication');
const ConcoursAssignment = require('../models/ConcoursAssignment');
const ConcoursAuditLog = require('../models/ConcoursAuditLog');

(async () => {
  await connectDB();
  const pricing = await PlatformPricing.findOneAndUpdate(
    { singleton_key: 'global' },
    { $setOnInsert: { concours_partnership: { amount: 0, currency: 'XAF', duration_days: 365 } } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await Promise.all([Concours.init(), ConcoursApplication.init(), ConcoursAssignment.init(), ConcoursAuditLog.init()]);
  console.log(JSON.stringify({ success: true, pricingId: String(pricing._id), indexes: { concours: Concours.schema.indexes().length, applications: ConcoursApplication.schema.indexes().length, assignments: ConcoursAssignment.schema.indexes().length, audit: ConcoursAuditLog.schema.indexes().length } }));
  await mongoose.connection.close();
})().catch(async (err) => { console.error(err); await mongoose.connection.close().catch(() => {}); process.exitCode = 1; });
