'use strict';

const fs = require('fs/promises');
const path = require('path');

const DOC_FILES = [
  path.resolve(__dirname, '../../docs/frontend-navigation-knowledge-base.md'),
  path.resolve(__dirname, '../../docs/frontend-system-guide.md'),
];

const ROUTE_GUIDE = {
  '/candidate': 'Candidate dashboard overview, shortcuts to resources, profile, settings, and chat.',
  '/candidate/question-papers': 'Use filters by title/department/year, then preview or download question papers.',
  '/candidate/reports': 'Search reports, preview when possible, fallback to download if preview fails.',
  '/candidate/presentations': 'Search presentations and use preview/download options.',
  '/candidate/chat': 'Chat supports general, department, center groups, and DMs. Users can create centers and manage invites/blocks.',
  '/candidate/profile': 'Profile page supports edit of personal info, avatar updates, and password change.',
  '/candidate/settings': 'Settings supports theme/email preferences, left groups rejoin, blocked users, and account deletion.',
  '/candidate/account-status': 'Restricted account page shows reason/duration and allows complaint submission.',
  '/admin': 'Admin dashboard links to candidate management, department management, and academic uploads.',
  '/admin/manage-candidates': 'Admin can inspect candidates, suspend/block/reactivate accounts, and review complaints.',
  '/admin/departments': 'Departments CRUD operations are available from admin departments page.',
  '/admin/question-papers': 'Admin can upload and manage question papers with audience targeting.',
  '/admin/reports': 'Admin can upload and manage reports with audience targeting and optional notifications.',
  '/admin/presentations': 'Admin can upload and manage presentations, optionally linked to reports.',
  '/admin/profile': 'Admin profile management page for personal account details.',
  '/admin/settings': 'Admin settings include theme and preference management.',
  '/login': 'Login page supports role-based redirect after successful authentication.',
  '/register': 'Candidate registration flow includes department selection and redirects to login after success.',
  '/reset-password': 'Password reset flow sends verification code by email then updates password.',
};

let docsCache = null;

function normalizeRoute(routePath) {
  const raw = String(routePath || '').trim();
  if (!raw) return '/';
  return raw.split('?')[0].split('#')[0] || '/';
}

function getBestRouteMatch(routePath) {
  const normalized = normalizeRoute(routePath);
  const entries = Object.keys(ROUTE_GUIDE).sort((a, b) => b.length - a.length);
  for (const key of entries) {
    if (normalized === key || normalized.startsWith(`${key}/`)) {
      return key;
    }
  }
  return null;
}

function extractSnippets(content, routePath, maxSnippets = 3) {
  const normalized = normalizeRoute(routePath);
  if (!content || normalized === '/') return [];

  const snippets = [];
  let cursor = 0;

  while (snippets.length < maxSnippets) {
    const idx = content.indexOf(normalized, cursor);
    if (idx === -1) break;

    const start = Math.max(0, idx - 180);
    const end = Math.min(content.length, idx + 360);
    const snippet = content
      .slice(start, end)
      .replace(/\r/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim();

    if (snippet && !snippets.includes(snippet)) {
      snippets.push(snippet);
    }

    cursor = idx + normalized.length;
  }

  return snippets;
}

async function loadDocsContent() {
  if (docsCache) return docsCache;

  const chunks = [];
  for (const filePath of DOC_FILES) {
    try {
      const text = await fs.readFile(filePath, 'utf8');
      chunks.push({ filePath, text });
    } catch (err) {
      console.warn('[HND Context] Could not read doc:', path.basename(filePath), err.message);
    }
  }

  docsCache = chunks;
  return docsCache;
}

async function getRouteAwareContext({ routePath, strictMode }) {
  const normalizedRoute = normalizeRoute(routePath);
  const docs = await loadDocsContent();
  const matchKey = getBestRouteMatch(normalizedRoute);

  const routeGuideLine = matchKey ? ROUTE_GUIDE[matchKey] : null;
  const extracted = docs.flatMap((d) => extractSnippets(d.text, normalizedRoute, 2));

  const lines = [];

  if (strictMode) {
    lines.push('Strict HND knowledge-first mode is ON. Prioritize platform guidance from provided docs and route context before general advice.');
  }

  if (normalizedRoute && normalizedRoute !== '/') {
    lines.push(`Current user route: ${normalizedRoute}`);
  }

  if (routeGuideLine) {
    lines.push(`Route guide: ${routeGuideLine}`);
  }

  if (extracted.length) {
    lines.push('Relevant documentation excerpts:');
    extracted.slice(0, strictMode ? 4 : 2).forEach((snippet, idx) => {
      lines.push(`[Doc ${idx + 1}] ${snippet}`);
    });
  }

  return lines.join('\n').trim();
}

module.exports = {
  getRouteAwareContext,
};
