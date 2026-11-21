import { isTableCode } from './tableCode.mjs';
export const LOGIN_INTENT_KEY = 'ks_post_login_mode';
export const LOGIN_INTENT_TTL = 30 * 60 * 1000;
const MODES = new Set(['host', 'host-return', 'profile']);

export function readLoginIntent(storage, now = Date.now()) {
  try {
    const intent = JSON.parse(storage.getItem(LOGIN_INTENT_KEY));
    if (intent && MODES.has(intent.mode) && Number.isFinite(intent.ts) &&
        now >= intent.ts && now - intent.ts < LOGIN_INTENT_TTL &&
        (intent.mode !== 'host-return' || isTableCode(intent.code))) return intent;
    storage.removeItem(LOGIN_INTENT_KEY);
  } catch { /* Storage can be unavailable in privacy-restricted browsers. */ }
  return null;
}

// Supabase may return to the site's root when the app callback isn't allowlisted.
// Keep the callback on the same origin and let the app's Supabase client consume it.
export function authReturnPath(url, hasIntent = false) {
  if (url.pathname !== '/') return null;
  const hash = new URLSearchParams(url.hash.slice(1));
  const isCallback = (hash.has('access_token') && hash.has('refresh_token')) ||
    hash.has('error') || hash.has('error_code') || url.searchParams.has('error') ||
    (hasIntent && url.searchParams.has('code'));
  return isCallback ? `/app/${url.search}${url.hash}` : null;
}

export function hasAuthError(url) {
  const hash = new URLSearchParams(url.hash.slice(1));
  return hash.has('error') || hash.has('error_code') || url.searchParams.has('error');
}
