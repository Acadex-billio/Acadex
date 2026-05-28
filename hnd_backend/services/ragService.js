'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Flow 2 — RAG (Retrieval-Augmented Generation) Pipeline
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Now using OpenAI embeddings instead of local transformers.js
 *
 *  ┌──────────────────────┬──────────────────────────────────────────┐
 *  │ pdf-parse            │ Extract raw text from PDF buffers        │
 *  ├──────────────────────┼──────────────────────────────────────────┤
 *  │ LangChain splitter   │ Split extracted text into semantic chunks │
 *  ├──────────────────────┼──────────────────────────────────────────┤
 *  │ OpenAI API           │ Generate vector embeddings per chunk     │
 *  │ (text-embedding-3)   │ (model: text-embedding-3-small, 1536-dim)│
 *  ├──────────────────────┼──────────────────────────────────────────┤
 *  │ chromadb             │ Store & query vectors                    │
 *  │  ↳ in-memory fallback│ Auto-used when Chroma server unavailable │
 *  ├──────────────────────┼──────────────────────────────────────────┤
 *  │ MongoDB (KnowledgeDoc│ Persist document metadata & provenance   │
 *  └──────────────────────┴──────────────────────────────────────────┘
 *
 *  ⚠  REQUIRES: OPENAI_API_KEY environment variable
 *  ⚠  CHROMA SERVER OPTIONAL:
 *     Set env var  CHROMA_URL=http://your-chroma-server:8000
 *     Without it, an in-memory cosine-similarity store is used.
 */

const pdfParse = require('pdf-parse');
const KnowledgeDoc = require('../models/KnowledgeDoc');
const { getEmbedding } = require('./openaiService');

function resolvePdfParseFn() {
  if (typeof pdfParse === 'function') return pdfParse;
  if (pdfParse && typeof pdfParse.default === 'function') return pdfParse.default;
  if (pdfParse && typeof pdfParse.pdfParse === 'function') return pdfParse.pdfParse;
  return null;
}

async function parsePdfWithClass(pdfBuffer) {
  const PDFParseClass = pdfParse && pdfParse.PDFParse;
  if (typeof PDFParseClass !== 'function') return null;

  const parser = new PDFParseClass({ data: pdfBuffer });
  try {
    const result = await parser.getText({});
    return result;
  } finally {
    if (typeof parser.destroy === 'function') {
      await parser.destroy().catch(() => {});
    }
  }
}



// ─── LangChain: recursive character text splitter ─────────────────────────────
// Splits large documents into overlapping chunks that fit within the
// embedding model's context window and preserve sentence continuity.
let _splitter = null;

async function getSplitter() {
  if (_splitter) return _splitter;

  // Try the standalone @langchain/textsplitters package first,
  // then fall back to the bundled copy inside langchain itself.
  let Cls = null;
  const opts = { chunkSize: 500, chunkOverlap: 80, separators: ['\n\n', '\n', '. ', ' ', ''] };

  try {
    ({ RecursiveCharacterTextSplitter: Cls } = require('@langchain/textsplitters'));
  } catch (_) {
    try {
      ({ RecursiveCharacterTextSplitter: Cls } = require('langchain/text_splitter'));
    } catch (_2) {
      // Minimal built-in fallback — splits every 500 chars with 80-char overlap
      _splitter = {
        createDocuments: async (texts) =>
          texts.flatMap((t) => {
            const chunks = [];
            for (let i = 0; i < t.length; i += 420) {
              chunks.push({ pageContent: t.slice(i, i + 500) });
            }
            return chunks;
          }),
      };
      return _splitter;
    }
  }

  _splitter = new Cls(opts);
  return _splitter;
}

// ─── chromadb: vector store ────────────────────────────────────────────────────
// Connects to an external Chroma HTTP server.  Falls back to in-memory store.
let _chromaCollection = null;
let _chromaAvailable  = false;
let _chromaInitInFlight = false;
let _loggedChromaFallback = false;

function resolveChromaClientConfig() {
  const raw = String(process.env.CHROMA_URL || 'http://localhost:8000').trim();
  const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;

  try {
    const parsed = new URL(normalized);
    const ssl = parsed.protocol === 'https:';
    const fallbackPort = ssl ? 443 : 80;
    const port = Number(parsed.port || fallbackPort);

    return {
      host: parsed.hostname || 'localhost',
      port,
      ssl,
      displayUrl: `${ssl ? 'https' : 'http'}://${parsed.hostname || 'localhost'}:${port}`,
    };
  } catch (_err) {
    return {
      host: 'localhost',
      port: 8000,
      ssl: false,
      displayUrl: 'http://localhost:8000',
    };
  }
}

async function initChroma() {
  if (_chromaInitInFlight) return;
  _chromaInitInFlight = true;
  try {
    const { ChromaClient } = require('chromadb');
    const chromaConfig = resolveChromaClientConfig();
    const client = new ChromaClient({
      host: chromaConfig.host,
      port: chromaConfig.port,
      ssl: chromaConfig.ssl,
    });
    await client.heartbeat();
    _chromaCollection = await client.getOrCreateCollection({
      name:     'hnd_knowledge_base',
      metadata: { 'hnsw:space': 'cosine' },
    });
    const wasUnavailable = !_chromaAvailable;
    _chromaAvailable = true;
    _loggedChromaFallback = false;
    if (wasUnavailable) {
      console.log('[RAG] Chroma vector store connected at', chromaConfig.displayUrl);
    }
  } catch (err) {
    if (!_loggedChromaFallback) {
      console.warn('[RAG] Chroma unavailable —', err.message);
      console.warn('[RAG] Using in-memory cosine-similarity fallback (data resets on restart).');
      console.warn('[RAG] Set CHROMA_URL env var to enable persistent vector storage.');
      _loggedChromaFallback = true;
    }
    _chromaAvailable = false;
    _chromaCollection = null;
  } finally {
    _chromaInitInFlight = false;
  }
}

// Non-blocking startup check
initChroma();

// Periodic reconnect: if Chroma comes up after backend startup, auto-attach.
setInterval(() => {
  if (!_chromaAvailable) {
    initChroma().catch(() => {
      // handled by initChroma fallback logging
    });
  }
}, 15000);

// ─── In-memory cosine-similarity fallback ────────────────────────────────────
// Used automatically when the Chroma server is not reachable.
const _inMemoryStore = []; // [{ id, text, embedding, metadata }]

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function inMemorySearch(queryEmbedding, topK) {
  return _inMemoryStore
    .map((item) => ({ ...item, score: cosineSimilarity(queryEmbedding, item.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ─── pdf-parse: extract text from PDF ────────────────────────────────────────
async function extractTextFromPdf(pdfBuffer) {
  const parser = resolvePdfParseFn();
  if (parser) {
    const data = await parser(pdfBuffer);
    return String(data.text || '').replace(/\s+/g, ' ').trim();
  }

  const classResult = await parsePdfWithClass(pdfBuffer);
  if (classResult) {
    return String(classResult.text || '').replace(/\s+/g, ' ').trim();
  }

  throw new Error('pdf-parse parser is not available in the current module format');
}

// ─── PUBLIC: ingestDocument ───────────────────────────────────────────────────
/**
 * Ingest a document into the RAG knowledge base.
 *
 * Pipeline:
 *   pdf-parse → LangChain splitter → OpenAI embeddings → Chroma / in-memory → MongoDB
 *
 * @param {object}  opts
 * @param {string}  [opts.text]       - raw text content
 * @param {Buffer}  [opts.pdfBuffer]  - PDF file buffer
 * @param {string}  opts.source       - document name / filename
 * @param {string}  [opts.sourceType] - 'text' | 'pdf'
 * @returns {Promise<{docId, source, chunks_stored, store}>}
 */
async function ingestDocument({ text, pdfBuffer, source, sourceType = 'text' }) {
  // 1. pdf-parse — extract text from PDF if provided
  let rawText = String(text || '').trim();
  if (pdfBuffer) {
    rawText    = await extractTextFromPdf(pdfBuffer);
    sourceType = 'pdf';
  }
  if (!rawText) throw new Error('No text content to ingest');

  // 2. LangChain — split into overlapping semantic chunks
  const splitter = await getSplitter();
  const langDocs = await splitter.createDocuments([rawText]);
  const chunks   = langDocs.map((d) => String(d.pageContent || '').trim()).filter(Boolean);
  if (!chunks.length) throw new Error('Could not extract usable chunks from document');

  // 3. OpenAI — embed each chunk (text-embedding-3-small: 1536-dim)
  console.log(`[RAG] Embedding ${chunks.length} chunks with OpenAI...`);
  const embeddings = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const emb = await getEmbedding(chunks[i]);
      embeddings.push(emb);
    } catch (err) {
      console.error(`[RAG] Failed to embed chunk ${i}:`, err.message);
      throw new Error(`Embedding failed for chunk ${i}: ${err.message}`);
    }
  }

  const validPairs = chunks
    .map((c, i) => ({ chunk: c, embedding: embeddings[i] }))
    .filter((p) => p.embedding !== null);

  if (!validPairs.length) {
    throw new Error('Could not generate embeddings for document chunks');
  }

  // 4a. chromadb — store vectors + text
  const docId    = `doc_${Date.now()}`;
  const chunkIds = validPairs.map((_, i) => `${docId}_chunk${i}`);

  if (_chromaAvailable && _chromaCollection) {
    await _chromaCollection.add({
      ids:        chunkIds,
      embeddings: validPairs.map((p) => p.embedding),
      documents:  validPairs.map((p) => p.chunk),
      metadatas:  validPairs.map((_, i) => ({ source, docId, chunkIndex: i })),
    });
  } else {
    // 4b. in-memory fallback
    validPairs.forEach((p, i) => {
      _inMemoryStore.push({
        id:        chunkIds[i],
        text:      p.chunk,
        embedding: p.embedding,
        metadata:  { source, docId, chunkIndex: i },
      });
    });
  }

  // 5. MongoDB — persist document metadata
  await KnowledgeDoc.findOneAndUpdate(
    { docId },
    { docId, source, sourceType, chunkCount: validPairs.length, createdAt: new Date() },
    { upsert: true, new: true }
  );

  return {
    docId,
    source,
    chunks_stored: validPairs.length,
    store:         _chromaAvailable ? 'chroma' : 'in-memory',
  };
}

// ─── PUBLIC: queryKnowledge ───────────────────────────────────────────────────
/**
 * Query the RAG knowledge base with a natural-language question.
 *
 * Pipeline:
 *   OpenAI embeddings (query) → Chroma / in-memory similarity search
 *   → return top-K matching chunks as structured context answer
 *
 * @param {string} queryText
 * @param {number} [topK=5]
 * @returns {Promise<{answer, sources, chunksUsed, message?}>}
 */
async function queryKnowledge(queryText, topK = 5) {
  // Embed the query using OpenAI
  let queryEmbedding;
  try {
    queryEmbedding = await getEmbedding(queryText);
  } catch (err) {
    return {
      answer:  null,
      sources: [],
      message: `Embedding failed: ${err.message}`,
    };
  }

  if (!queryEmbedding) {
    return {
      answer:  null,
      sources: [],
      message: 'Failed to generate query embedding.',
    };
  }

  let results = [];

  if (_chromaAvailable && _chromaCollection) {
    const res  = await _chromaCollection.query({
      queryEmbeddings: [queryEmbedding],
      nResults:        Math.max(topK, 1),
    });
    const ids   = res.ids?.[0]        || [];
    const docs  = res.documents?.[0]  || [];
    const metas = res.metadatas?.[0]  || [];
    results = ids.map((id, i) => ({ id, text: docs[i], metadata: metas[i] }));
  } else {
    if (!_inMemoryStore.length) {
      return {
        answer:  null,
        sources: [],
        message: 'Knowledge base is empty. Ask an admin to ingest documents first.',
      };
    }
    results = inMemorySearch(queryEmbedding, topK);
  }

  if (!results.length) {
    return { answer: null, sources: [], message: 'No relevant documents found.' };
  }

  // Compose context from top chunks
  const topChunks = results.slice(0, 3);
  const context   = topChunks.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n');
  const sources   = [...new Set(results.map((r) => r.metadata?.source).filter(Boolean))];

  return {
    answer:     `Based on the knowledge base:\n\n${context}`,
    sources,
    chunksUsed: topChunks.length,
  };
}

// ─── PUBLIC: listDocuments ────────────────────────────────────────────────────
/**
 * List all ingested documents from MongoDB metadata.
 */
async function listDocuments() {
  return KnowledgeDoc.find({}).sort({ createdAt: -1 }).lean();
}

async function getRagStatus() {
  const docsCount = await KnowledgeDoc.countDocuments({});
  const storeMode = _chromaAvailable ? 'chroma' : 'in-memory';
  return {
    chromaAvailable: _chromaAvailable,
    chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
    storeMode,
    embeddingModel: 'text-embedding-3-small (OpenAI)',
    inMemoryChunks: _inMemoryStore.length,
    documentsCount: docsCount,
    readyForQuery: docsCount > 0 && (_chromaAvailable || _inMemoryStore.length > 0),
  };
}

module.exports = { ingestDocument, queryKnowledge, listDocuments, getRagStatus };
