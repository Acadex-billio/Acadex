const DOMAIN_PATTERN = /^(?:localhost(?::\d+)?|(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?)(?:[/?#]|$)/i;

export const resolveAdCtaDestination = (value, currentOrigin) => {
  const raw = String(value || '').trim();
  if (!raw || /\s/.test(raw)) return null;

  const origin = currentOrigin || window.location.origin;
  let candidate = raw;
  if (raw.startsWith('//')) {
    candidate = `https:${raw}`;
  } else if (DOMAIN_PATTERN.test(raw)) {
    candidate = `https://${raw}`;
  } else if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) {
    candidate = raw.startsWith('/') ? raw : `/${raw}`;
  }

  try {
    const parsed = new URL(candidate, origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    if (parsed.origin === origin) {
      return {
        type: 'internal',
        path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
      };
    }

    if (!/^https?:\/\//i.test(candidate) && !raw.startsWith('//')) return null;
    return { type: 'external', url: parsed.href };
  } catch {
    return null;
  }
};
