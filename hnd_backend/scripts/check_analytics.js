require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const mongoose = require('mongoose');
const getAdAnalytics = require('../services/adAnalyticsService').getAdAnalytics;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[check] Connected to Mongo');
  const adId = process.argv[2] || null;
  if (!adId) {
    console.error('Usage: node check_analytics.js <adId>');
    process.exit(1);
  }
  try {
    const analytics = await getAdAnalytics(adId);
    console.log('Analytics:', JSON.stringify(analytics, null, 2));
  } catch (e) {
    console.error('Error running analytics:', e);
  } finally {
    await mongoose.disconnect();
  }
}

main();
