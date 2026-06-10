'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const { getChatCompletion, getHealthInfo, PROVIDER_LABELS } = require('../services/aiProviderService');

const run = async () => {
  console.log('Health:', getHealthInfo());

  const message = [{ role: 'user', content: 'Hello, please say which provider answered and return a short greeting.' }];

  const selections = ['auto', 'gpt', 'deepseek', 'groq'];

  for (const sel of selections) {
    try {
      console.log('\n== Testing selection:', sel, PROVIDER_LABELS[sel] || '' );
      const res = await getChatCompletion(message, { preferredModel: sel, model: undefined });
      console.log('Response text:', res.text.slice(0, 400));
      console.log('Usage:', res.usage || {});
    } catch (err) {
      console.error('Error for', sel, err.message || err);
    }
  }
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
