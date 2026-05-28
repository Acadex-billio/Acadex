'use strict';

/**
 * OpenAI Integration Service
 * Handles embeddings and chat completions using OpenAI APIs
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const AI_FEATURES_ENABLED = String(process.env.AI_FEATURES_ENABLED || 'true').trim().toLowerCase() !== 'false';

if (AI_FEATURES_ENABLED && !OPENAI_API_KEY) {
  console.warn('[OpenAI] OPENAI_API_KEY not set in environment');
}

/**
 * Generate embeddings for text using OpenAI's text-embedding-3-small model
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
async function getEmbedding(text) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.trim(),
      }),
      timeout: 30000,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error (${response.status}): ${error.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    if (!data.data || !data.data[0]) {
      throw new Error('Invalid embedding response from OpenAI');
    }

    return data.data[0].embedding;
  } catch (err) {
    console.error('[OpenAI Embeddings] Error:', err.message);
    throw err;
  }
}

/**
 * Get chat completion from OpenAI's GPT-4 model with streaming support
 * @param {Array<{role: string, content: string}>} messages - Chat messages
 * @param {Object} options - Configuration options
 * @returns {Promise<{text: string, usage: Object}>} Chat response
 */
async function getChatCompletion(messages, options = {}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages must be a non-empty array');
  }

  const {
    model = 'gpt-4o',
    temperature = 0.7,
    maxTokens = 1000,
    topP = 1,
  } = options;

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
      }),
      timeout: 60000,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error (${response.status}): ${error.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid completion response from OpenAI');
    }

    return {
      text: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  } catch (err) {
    console.error('[OpenAI Chat] Error:', err.message);
    throw err;
  }
}

/**
 * Stream chat completion from OpenAI (yields text chunks via async iterator)
 * @param {Array<{role: string, content: string}>} messages - Chat messages
 * @param {Object} options - Configuration options
 * @returns {AsyncGenerator<string>} Stream of text chunks
 */
async function* streamChatCompletion(messages, options = {}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages must be a non-empty array');
  }

  const {
    model = 'gpt-4o',
    temperature = 0.7,
    maxTokens = 1000,
    topP = 1,
  } = options;

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        stream: true,
      }),
      timeout: 120000,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error (${response.status}): ${error.error?.message || response.statusText}`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                yield parsed.choices[0].delta.content;
              }
            } catch (_) {
              // Ignore parse errors on individual chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (err) {
    console.error('[OpenAI Stream] Error:', err.message);
    throw err;
  }
}

module.exports = {
  getEmbedding,
  getChatCompletion,
  streamChatCompletion,
};
