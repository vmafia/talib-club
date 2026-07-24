// Recovery from "stale bundle" runtime errors.
//
// When a new version is deployed, a browser tab (or an over-eager HTTP/PWA cache)
// can end up running an old index chunk against a mismatched lazy chunk. That
// surfaces as a runtime crash such as "Cannot access 'z' before initialization",
// "... is not a function", or a failure to load a dynamically imported module —
// and a plain refresh keeps hitting the same cached files, so the error looks
// permanent to the user.
//
// isStaleBundleError() recognises that class of error; attemptStaleBundleRecovery()
// clears the caches, drops the service worker, and hard-reloads exactly once
// (guarded by sessionStorage so we never loop).

const RECOVERY_FLAG = "talib_stale_bundle_recovery";

const STALE_PATTERNS = [
  /before initialization/i,          // TDZ from a mismatched chunk
  /is not defined/i,
  /is not a function/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /unexpected token/i,
  /import\(\) failed/i,
];

export function isStaleBundleError(error) {
  if (!error) return false;
  const msg = typeof error === "string" ? error : (error.message || String(error));
  return STALE_PATTERNS.some((re) => re.test(msg));
}

// Returns true if a recovery reload was triggered (caller should render a
// "reloading" state and stop), false if we already tried once this session.
export function attemptStaleBundleRecovery(error) {
  if (!isStaleBundleError(error)) return false;
  // In dev we want to see the real error, not silently reload.
  if (import.meta.env?.DEV) return false;
  try {
    if (sessionStorage.getItem(RECOVERY_FLAG)) return false; // already tried once
    sessionStorage.setItem(RECOVERY_FLAG, "1");
  } catch {
    return false; // no sessionStorage → don't risk a reload loop
  }

  const done = () => {
    try {
      // Bust the HTTP cache for the navigation so we fetch a fresh index.html.
      window.location.reload();
    } catch {
      /* ignore */
    }
  };

  const jobs = [];
  try {
    if (window.caches?.keys) {
      jobs.push(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
    }
  } catch { /* ignore */ }
  try {
    if (navigator.serviceWorker?.getRegistrations) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister())))
      );
    }
  } catch { /* ignore */ }

  // Reload once the cleanup settles (or after a short timeout, whichever first).
  Promise.race([Promise.allSettled(jobs), new Promise((res) => setTimeout(res, 1500))]).finally(done);
  return true;
}

// Call after a successful render to clear the guard, so a genuine future
// stale-bundle error can trigger recovery again.
export function clearStaleBundleRecoveryFlag() {
  try { sessionStorage.removeItem(RECOVERY_FLAG); } catch { /* ignore */ }
}
