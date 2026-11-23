/**
 * Sanitizes and resolves the configured VITE_API_BASE_URL for Sentinel API & WebSocket calls.
 *
 * Safeguards against:
 * 1. Malformed values (e.g. pasted Markdown links like "[https://example.app](https://example.app)",
 *    quoted strings, relative paths, or invalid protocols) which previously caused fetch() to resolve
 *    as a broken relative path hitting Vite's SPA HTML fallback instead of `/api/*`.
 * 2. Cross-origin hijacking when running on a full-stack co-hosted origin (localhost, 127.0.0.1,
 *    or AI Studio Cloud Run *.run.app) where Express + WebSockets already serve `/api/*` and `/ws/*`
 *    directly on the same origin.
 */
export function resolveApiBaseUrl(
  rawValue: string | undefined | null,
  currentHostname?: string,
): string {
  const cleaned = (rawValue ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();
  if (!cleaned) return '';

  // Reject markdown links, whitespace, angle brackets, or non-http(s) prefixes
  if (/[\s[\]()<>]/.test(cleaned) || !/^https?:\/\//i.test(cleaned)) {
    return '';
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return '';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return '';
  }

  const host = (currentHostname ?? '').toLowerCase();
  const isCoHostedFullStack =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.run.app');

  // On co-hosted full-stack origins (local Node/Express or AI Studio Cloud Run),
  // always use same-origin `/api/*` and `/ws/*` so external env URLs never trigger CORS/404s.
  if (isCoHostedFullStack && parsed.hostname.toLowerCase() !== host) {
    return '';
  }

  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/**
 * Resolves a WebSocket URL for Sentinel (`/ws/notifications`, `/ws/live`) safely without throwing.
 */
export function resolveSentinelWsUrl(
  path: string,
  apiBaseUrl: string,
  locationLike: { protocol: string; host: string; origin: string },
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (apiBaseUrl) {
    try {
      const parsed = new URL(apiBaseUrl, locationLike.origin);
      const proto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${parsed.host}${normalizedPath}`;
    } catch {
      // Fall through to same-origin WebSocket URL
    }
  }
  const proto = locationLike.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${locationLike.host}${normalizedPath}`;
}
