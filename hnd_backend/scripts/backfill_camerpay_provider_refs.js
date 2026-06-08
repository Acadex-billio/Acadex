#!/usr/bin/env node
require('dotenv').config();
const connectDB = require('../config/database');
const PaymentTransaction = require('../models/PaymentTransaction');

(async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB — starting CamerPay provider_reference backfill');

    const cursor = PaymentTransaction.find({ provider: 'camerpay', provider_response: { $exists: true, $ne: null } }).cursor();
    let updated = 0;

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      try {
        const resp = doc.provider_response || {};
        const txUuid = resp.transaction_uuid || resp.payment_id || resp.transaction_id || null;
        if (txUuid && String(doc.provider_reference || '') !== String(txUuid)) {
          doc.provider_reference = String(txUuid);
          await doc.save();
          updated += 1;
          console.log(`Updated ${doc._id} -> provider_reference=${txUuid}`);
        }
      } catch (e) {
        console.warn('Backfill error for doc', doc._id, e.message);
      }
    }

    console.log(`Backfill complete. Updated ${updated} transactions.`);
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed', err);
    process.exit(2);
  }
})();
