'use strict';

const {
  streamChatCompletion: openaiStreamChatCompletion,
  getChatCompletion: openaiGetChatCompletion,
} = require('./openaiService');

const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const DEEPSEEK_API_KEY = String(process.env.DEEPSEEK_API_KEY || '').trim();
const DEEPSEEK_BASE_URL = String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.ai/v1').replace(/\/+$/, '');
const GROQ_API_KEY = String(process.env.GROQ_API_KEY || '').trim();
const GROQ_BASE_URL = String(process.env.GROQ_BASE_URL || 'https://api.groq.ai/v1').replace(/\/+$/, '');

const PROVIDER_LABELS = {
  auto: 'Auto (GPT → Deepseek → GROQ)',
  gpt: 'GPT-4 (OpenAI)',
  deepseek: 'Deepseek',
  groq: 'GROQ',
};

const PROVIDER_ORDER = ['gpt', 'deepseek', 'groq'];

const configuredProviders = () => {
  return PROVIDER_ORDER.filter((provider) => {
    if (provider === 'gpt') return Boolean(OPENAI_API_KEY);
    if (provider === 'deepseek') return Boolean(DEEPSEEK_API_KEY);
    if (provider === 'groq') return Boolean(GROQ_API_KEY);
    return false;
  });
};

const normalizeProviderSelection = (value) => {
  const candidate = String(value || 'auto').trim().toLowerCase();
  if (candidate === 'gpt' || candidate === 'deepseek' || candidate === 'groq') return candidate;
  return 'auto';
};

const getProviderSequence = (preferred) => {
  const selected = normalizeProviderSelection(preferred);
  if (selected === 'auto') {
    return configuredProviders();
  }

  const prioritized = [selected, ...PROVIDER_ORDER.filter((provider) => provider !== selected)];
  return prioritized.filter((provider) => configuredProviders().includes(provider));
};

const buildProviderResponse = async (provider, messages, options = {}) => {
  const { temperature = 0.7, maxTokens = 1200, topP = 1, model = undefined } = options;

  if (provider === 'gpt') {
    return openaiGetChatCompletion(messages, {
      model: model || 'gpt-4o',
      temperature,
      maxTokens,
      topP,
    });
  }

  const baseUrl = provider === 'deepseek' ? DEEPSEEK_BASE_URL : GROQ_BASE_URL;
  const apiKey = provider === 'deepseek' ? DEEPSEEK_API_KEY : GROQ_API_KEY;
  const targetModel = model || 'default';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: targetModel,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      stream: false,
    }),
    timeout: 120000,
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(`Provider ${provider} error (${response.status}): ${json.error?.message || json.message || response.statusText}`);
  }

  const json = await response.json();
  const choice = Array.isArray(json?.choices) ? json.choices[0] : null;
  if (!choice) {
    throw new Error(`Provider ${provider} returned an invalid response`);
  }

  const text = String(choice.message?.content || choice.text || '').trim();
  if (!text) {
    throw new Error(`Provider ${provider} returned an empty response`);
  }

  return {
    text,
    usage: {
      promptTokens: json.usage?.prompt_tokens || 0,
      completionTokens: json.usage?.completion_tokens || 0,
      totalTokens: json.usage?.total_tokens || 0,
    },
  };
};

const chunkText = (text, chunkSize = 120) => {
  if (!text) return [];
  const chunks = [];
  let index = 0;
  while (index < text.length) {
    chunks.push(text.slice(index, index + chunkSize));
    index += chunkSize;
  }
  return chunks;
};

const streamProviderResponse = async function* (provider, messages, options = {}) {
  const { temperature = 0.7, maxTokens = 1200, topP = 1, model = undefined } = options;

  if (provider === 'gpt') {
    for await (const chunk of openaiStreamChatCompletion(messages, {
      model: model || 'gpt-4o',
      temperature,
      maxTokens,
      topP,
    })) {
      yield chunk;
    }
    return;
  }

  const result = await buildProviderResponse(provider, messages, { temperature, maxTokens, topP, model });
  for (const chunk of chunkText(result.text, 120)) {
    yield chunk;
  }
};

const streamChatCompletion = async function* (messages, options = {}) {
  const providerSequence = getProviderSequence(options.preferredModel || 'auto');
  if (!providerSequence.length) {
    throw new Error('No configured AI provider is available');
  }

  let lastError = null;
  for (const provider of providerSequence) {
    try {
      yield* streamProviderResponse(provider, messages, options);
      return;
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error('All AI providers failed');
};

const getChatCompletion = async (messages, options = {}) => {
  const providerSequence = getProviderSequence(options.preferredModel || 'auto');
  if (!providerSequence.length) {
    throw new Error('No configured AI provider is available');
  }

  let lastError = null;

  for (const provider of providerSequence) {
    try {
      if (provider === 'gpt') {
        return await openaiGetChatCompletion(messages, {
          model: options.model || 'gpt-4o',
          temperature: options.temperature || 0.7,
          maxTokens: options.maxTokens || 1200,
          topP: options.topP || 1,
        });
      }
      return await buildProviderResponse(provider, messages, options);
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error('All AI providers failed');
};

const getHealthInfo = () => ({
  openaiConfigured: Boolean(OPENAI_API_KEY),
  deepseekConfigured: Boolean(DEEPSEEK_API_KEY),
  groqConfigured: Boolean(GROQ_API_KEY),
  availableProviders: configuredProviders(),
  defaultModel: 'auto',
});

module.exports = {
  normalizeProviderSelection,
  streamChatCompletion,
  getChatCompletion,
  getHealthInfo,
  PROVIDER_LABELS,
};
