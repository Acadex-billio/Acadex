#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const connectDB = require('../config/database');
const PaymentTransaction = require('../models/PaymentTransaction');

(async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB — dumping recent CamerPay transactions');

    const txs = await PaymentTransaction.find({ provider: 'camerpay' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    if (!txs || txs.length === 0) {
      console.log('No CamerPay transactions found.');
      process.exit(0);
    }

    for (const tx of txs) {
      console.log('---');
      console.log(`_id: ${tx._id}`);
      console.log(`external_reference: ${tx.external_reference}`);
      console.log(`provider_reference: ${tx.provider_reference}`);
      console.log(`status: ${tx.status}`);
      console.log(`amount: ${tx.amount} ${tx.currency}`);
      console.log(`createdAt: ${tx.createdAt}`);
      console.log('provider_response keys:', tx.provider_response ? Object.keys(tx.provider_response) : 'null');
      console.log('provider_response:', JSON.stringify(tx.provider_response, null, 2));
    }

    process.exit(0);
  } catch (err) {
    console.error('Dump failed', err);
    process.exit(2);
  }
})();
