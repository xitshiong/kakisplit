import { authReturnPath, readLoginIntent } from './lib/authFlow.mjs';

let hasIntent = false;
try { hasIntent = !!readLoginIntent(window.localStorage); } catch { /* No storage. */ }
const callback = authReturnPath(new URL(window.location.href), hasIntent);
if (callback) {
  window.location.replace(callback);
} else {
  import('./info.jsx');
}
