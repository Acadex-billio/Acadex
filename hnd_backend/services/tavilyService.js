'use strict';

/**
 * Tavily web search service.
 * Used as a real-time fallback when KB retrieval has no strong context.
 */

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

function toText(value) {
  return String(value || '').trim();
}

function sanitizeResult(item) {
  const title = toText(item?.title);
  const url = toText(item?.url);
  const content = toText(item?.content);
  const score = Number(item?.score || 0);

  return {
    title,
    url,
    content,
    score: Number.isFinite(score) ? score : 0,
  };
}

function buildContext(answer, results) {
  const lines = [];

  const shortAnswer = toText(answer);
  if (shortAnswer) {
    lines.push(`Web answer: ${shortAnswer}`);
  }

  const top = results.slice(0, 5);
  if (top.length) {
    lines.push('Web findings:');
    top.forEach((r, idx) => {
      const snippet = toText(r.content).replace(/\s+/g, ' ').slice(0, 400);
      lines.push(`${idx + 1}. ${r.title || 'Untitled'} - ${snippet}`);
    });
  }

  return lines.join('\n').trim();
}

async function searchTavily(query, options = {}) {
  const apiKey = toText(process.env.TAVILY_API_KEY);
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  const cleanQuery = toText(query);
  if (!cleanQuery) {
    return { context: '', sources: [] };
  }

  const maxResults = Math.max(1, Math.min(10, Number(options.maxResults || 5)));

  const payload = {
    api_key: apiKey,
    query: cleanQuery,
    search_depth: 'basic',
    max_results: maxResults,
    include_answer: true,
    include_raw_content: false,
  };

  const response = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let json = null;
  try {
    json = await response.json();
  } catch (_) {
    json = null;
  }

  if (!response.ok) {
    const msg = toText(json?.detail || json?.message || `Tavily request failed with status ${response.status}`);
    throw new Error(msg);
  }

  const rawResults = Array.isArray(json?.results) ? json.results : [];
  const results = rawResults.map(sanitizeResult).filter((r) => r.url || r.content || r.title);
  const answer = toText(json?.answer);

  return {
    answer,
    context: buildContext(json?.answer, results),
    sources: results.map((r) => ({ title: r.title || r.url, link: r.url, snippet: r.content, score: r.score })),
  };
}

module.exports = { searchTavily };
