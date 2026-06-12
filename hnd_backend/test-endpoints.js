'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

console.log('=== Environment ===');
console.log('OPENAI_API_KEY:', OPENAI_API_KEY ? 'set' : 'MISSING');
console.log('OPENAI_BASE_URL:', OPENAI_BASE_URL);
console.log('DEEPSEEK_API_KEY:', DEEPSEEK_API_KEY ? 'set' : 'MISSING');
console.log('DEEPSEEK_BASE_URL:', DEEPSEEK_BASE_URL);
console.log('GROQ_API_KEY:', GROQ_API_KEY ? 'set' : 'MISSING');
console.log('GROQ_BASE_URL:', GROQ_BASE_URL);

const testProvider = async (name, apiKey, baseUrl, model = 'gpt-4o') => {
  console.log(`\n=== Testing ${name} (model: ${model}) ===`);
  if (!apiKey) {
    console.log('❌ API key not set');
    return;
  }

  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
        max_tokens: 10,
      }),
      timeout: 15000,
    });

    const elapsed = Date.now() - startTime;
    const text = await response.text();
    
    if (response.ok) {
      console.log(`✅ SUCCESS (${elapsed}ms)`);
      console.log('Response (first 200 chars):', text.slice(0, 200));
    } else {
      console.log(`❌ HTTP ${response.status} (${elapsed}ms)`);
      console.log('Response (first 300 chars):', text.slice(0, 300));
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
  }
};

const run = async () => {
  await testProvider('OpenAI', OPENAI_API_KEY, OPENAI_BASE_URL, 'gpt-4o');
  await testProvider('Deepseek', DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, 'deepseek-chat');
  await testProvider('GROQ (llama-3.1-70b)', GROQ_API_KEY, GROQ_BASE_URL, 'llama-3.1-70b-versatile');
  await testProvider('GROQ (llama-3.1-8b)', GROQ_API_KEY, GROQ_BASE_URL, 'llama-3.1-8b-instant');
};

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
