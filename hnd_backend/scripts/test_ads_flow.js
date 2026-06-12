/* Quick test script: upload a test file, attach to an Ad, and compute performance aggregates */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Ad = require('../models/Ad');
const AdDeliveryLog = require('../models/AdDeliveryLog');
const AdPerformance = require('../models/AdPerformance');
const User = require('../models/User');
const { uploadFile } = require('../utils/s3Uploader');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[test] Connected to MongoDB');

  let ad = await Ad.findOne().lean();
  if (!ad) {
    console.log('[test] No Ad found - creating a sample ad');
    const created = await Ad.create({ title: 'Test Ad - script', logoUrl: '', isPublished: false, targetAudience: ['all'] });
    ad = created.toObject();
  }

  console.log('[test] Using Ad id:', ad._id);

  // Upload a small test file via s3Uploader
  const content = Buffer.from('Test upload for AdsManager ' + new Date().toISOString());
  try {
    const up = await uploadFile(content, `ads-test-${Date.now()}.txt`, 'text/plain', 'ads/logo');
    console.log('[test] Upload succeeded:', up.url);

    // Update ad logoUrl and publish
    await Ad.findByIdAndUpdate(ad._id, { logoUrl: up.url, isPublished: true }, { returnDocument: 'after' });
    console.log('[test] Updated ad logoUrl and published');
  } catch (err) {
    console.error('[test] Upload failed:', err.message);
    // Fallback: write to uploads folder
    try {
      const uploadsDir = path.join(__dirname, '..', 'uploads', 'ads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const fname = `fallback-${Date.now()}.txt`;
      const dest = path.join(uploadsDir, fname);
      fs.writeFileSync(dest, content);
      const url = `http://localhost:${process.env.PORT || 5000}/uploads/ads/${fname}`;
      await Ad.findByIdAndUpdate(ad._id, { logoUrl: url, isPublished: true }, { returnDocument: 'after' });
      console.log('[test] Fallback saved and ad updated with URL:', url);
    } catch (fw) {
      console.error('[test] Fallback failed:', fw.message);
    }
  }

  // Compute performance aggregates (similar to controller)
  try {
    // create some synthetic delivery logs to simulate impressions/clicks
    const dayKey = new Date().toISOString().slice(0, 10);
    const logsToInsert = [
      { ad_id: ad._id, user_key: 'candidate:TEST1', impressions: 3, clicks: 1, day_key: dayKey },
      { ad_id: ad._id, user_key: 'candidate:TEST2', impressions: 5, clicks: 2, day_key: dayKey },
      { ad_id: ad._id, user_key: 'lecturer:LECT1', impressions: 2, clicks: 0, day_key: dayKey },
    ];
    try {
      await AdDeliveryLog.insertMany(logsToInsert, { ordered: false });
    } catch (e) {
      // ignore duplicate key errors from prior runs
      if (!String(e.message || '').toLowerCase().includes('duplicate key')) throw e;
    }

    const ObjectId = mongoose.Types.ObjectId;
    const uniqueAgg = await AdDeliveryLog.aggregate([
      { $match: { ad_id: new ObjectId(String(ad._id)) } },
      { $group: { _id: '$user_key' } },
      { $count: 'unique' },
    ]);
    const uniqueViewers = uniqueAgg?.[0]?.unique ?? 0;

    const daily = await AdDeliveryLog.aggregate([
      { $match: { ad_id: new ObjectId(String(ad._id)) } },
      { $group: { _id: '$day_key', impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' } } },
      { $sort: { _id: 1 } },
    ]);

    const overrides = await AdPerformance.findOne({ ad_id: ad._id }).lean();
    const impressions = Number(overrides?.impressions ?? ad.impressions ?? 0);
    const clicks = Number(overrides?.clicks ?? ad.clicks ?? 0);
    const registrations = Number(overrides?.registrations ?? 0);
    const amountPaid = Number(overrides?.amountPaid ?? ad.amountPaid ?? 0);

    console.log('[test] Performance: { impressions, clicks, registrs, amountPaid, uniqueViewers }');
    console.log({ impressions, clicks, registrations, amountPaid, uniqueViewers });
    console.log('[test] Daily series:', daily.slice(-10));
  } catch (err) {
    console.error('[test] Performance check failed:', err.message);
  }

  await mongoose.disconnect();
  console.log('[test] Done');
}

main().catch((e) => { console.error(e); process.exit(1); });
