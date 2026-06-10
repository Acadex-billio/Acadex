'use strict';

require('dotenv').config({ quiet: true });
const connectDB = require('../config/database');
const PaymentTransaction = require('../models/PaymentTransaction');

const YEAR = process.env.TARGET_YEAR ? Number(process.env.TARGET_YEAR) : new Date().getFullYear();

async function run() {
  await connectDB();

  const startApr = new Date(Number(YEAR), 3, 1); // April 1
  const startJun = new Date(Number(YEAR), 5, 1); // June 1 (exclusive end)

  console.log(`Zeroing payment amounts for transactions from ${startApr.toISOString()} to ${startJun.toISOString()}`);

  try {
    const result = await PaymentTransaction.updateMany(
      { createdAt: { $gte: startApr, $lt: startJun } },
      {
        $set: {
          amount: 0,
          'metadata.zeroedBy': 'migration-script',
          'metadata.zeroedAt': new Date(),
          'metadata.note': `Zeroed as test transactions for Apr/May/${YEAR}`,
        },
      }
    );

    console.log('Matched documents:', result.matchedCount || result.n || 0);
    console.log('Modified documents:', result.modifiedCount || result.nModified || 0);
  } catch (err) {
    console.error('Error while zeroing transactions:', err.message || err);
    process.exit(2);
  }

  process.exit(0);
}

run();
