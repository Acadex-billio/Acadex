#!/usr/bin/env node
require('dotenv').config();
const connectDB = require('../config/database');
const PaymentTransaction = require('../models/PaymentTransaction');

const ids = [
  '8a96a53b-0b11-4c96-bb50-153185af53eb',
  '7eb23f96-a717-4468-8351-9207c9fbf3a9',
  '880e9919-8a8f-4c1e-b1e1-369469a28c9c'
];

(async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB — checking transactions');

    for (const id of ids) {
      const tx = await PaymentTransaction.findOne({
        $or: [
          { provider_reference: id },
          { external_reference: id },
          { 'provider_response.transaction_uuid': id },
          { 'provider_response.payment_id': id }
        ],
      }).lean();

      if (!tx) {
        console.log(`Not found: ${id}`);
        continue;
      }

      console.log('---');
      console.log(`Found for id: ${id}`);
      console.log(`_id: ${tx._id}`);
      console.log(`external_reference: ${tx.external_reference}`);
      console.log(`provider_reference: ${tx.provider_reference}`);
      console.log(`status: ${tx.status}`);
      console.log(`provider_response.transaction_uuid: ${tx.provider_response?.transaction_uuid}`);
      console.log(`provider_response.payment_id: ${tx.provider_response?.payment_id}`);
      console.log(`provider_response.status: ${tx.provider_response?.status}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Check failed', err);
    process.exit(2);
  }
})();
