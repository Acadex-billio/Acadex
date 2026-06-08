#!/usr/bin/env node
require('dotenv').config();
const connectDB = require('../config/database');
const PaymentTransaction = require('../models/PaymentTransaction');
const { refreshCampayPaymentStatus } = require('../services/paymentOrchestrationService');

const updates = [
  {
    external_reference: '8a96a53b-0b11-4c96-bb50-153185af53eb',
    new_provider_reference: '7eb23f96-a717-4468-8351-9207c9fbf3a9',
  },
  {
    external_reference: '880e9919-8a8f-4c1e-b1e1-369469a28c9c',
    new_provider_reference: null, // unknown, will report
  },
];

(async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB — repairing CamerPay transactions');

    for (const u of updates) {
      const tx = await PaymentTransaction.findOne({ external_reference: u.external_reference });
      if (!tx) {
        console.log(`Transaction not found for external_reference=${u.external_reference}`);
        continue;
      }

      console.log('---');
      console.log(`Found transaction: _id=${tx._id} status=${tx.status} provider_reference=${tx.provider_reference}`);

      if (u.new_provider_reference) {
        tx.provider_reference = u.new_provider_reference;
        await tx.save();
        console.log(`Updated provider_reference -> ${u.new_provider_reference}`);

        // attempt refresh using orchestration service
        try {
          const refreshed = await refreshCampayPaymentStatus(tx, async (t) => {
            // no-op on successful hook
            console.log(`onSuccessfulPayment callback for tx ${t._id}`);
          });
          console.log(`After refresh: status=${refreshed.status} provider_reference=${refreshed.provider_reference}`);
        } catch (e) {
          console.warn('Refresh failed', e.message);
        }
      } else {
        console.log(`No provider id provided for ${u.external_reference}. Checking provider_response for embedded ids...`);
        const resp = tx.provider_response || {};
        const candidate = resp.transaction_uuid || resp.payment_id || resp.transaction_id || null;
        if (candidate) {
          tx.provider_reference = candidate;
          await tx.save();
          console.log(`Set provider_reference from provider_response -> ${candidate}`);
          try {
            const refreshed = await refreshCampayPaymentStatus(tx, async () => {});
            console.log(`After refresh: status=${refreshed.status}`);
          } catch (e) {
            console.warn('Refresh failed', e.message);
          }
        } else {
          console.log(`No embedded provider id found for ${u.external_reference}. Please provide CamerPay transaction_uuid for this transaction.`);
        }
      }
    }

    console.log('Repair script complete');
    process.exit(0);
  } catch (err) {
    console.error('Repair script error', err);
    process.exit(2);
  }
})();
