/**
 * Minimal in-memory fixed-window rate limiter for authentication endpoints
 * (CRA Annex I 3g — brute-force / DoS mitigation). Deliberately dependency-free:
 * one Map keyed by client IP, pruned lazily, nothing persisted.
 *
 * Complements (does not replace) the per-account lockout in routes/auth.js:
 * lockout stops a password search against one known user; this throttles a
 * single source hammering the endpoint across many usernames.
 *
 * Knobs come from config/conf.json `security`:
 *   login_rate_window_s — window length (default 60, 0 disables)
 *   login_rate_max      — requests per window per IP (default 10)
 *
 * NOTE: the key is req.ip. Behind a reverse proxy every client shares the
 * proxy's IP unless Express `trust proxy` is configured — see docs/DEPLOYMENT.md.
 */
const conf = require('../../../config/conf.json');

const SEC = conf.security || {};

function windowMs() {
  const s = SEC.login_rate_window_s;
  return (s == null ? 60 : Number(s) || 0) * 1000;
}
function maxPerWindow() { return Number(SEC.login_rate_max) || 10; }

// ip → { count, resetAt }
const hits = new Map();

/** Drop expired windows so the map can't grow unbounded under IP churn. */
function prune(now) {
  for (const [ip, h] of hits) {
    if (now >= h.resetAt) hits.delete(ip);
  }
}

function loginRateLimiter(req, res, next) {
  const win = windowMs();
  if (!win) return next(); // disabled by config

  const now = Date.now();
  if (hits.size > 10000) prune(now);

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  let h = hits.get(ip);
  if (!h || now >= h.resetAt) {
    h = { count: 0, resetAt: now + win };
    hits.set(ip, h);
  }
  h.count += 1;
  if (h.count > maxPerWindow()) {
    const retryS = Math.max(1, Math.ceil((h.resetAt - now) / 1000));
    res.set('Retry-After', String(retryS));
    return res.status(429).json({
      error: 'Too many authentication attempts. Try again later.',
      code: 'RATE_LIMITED',
    });
  }
  next();
}

/** Test/ops hook: forget all counters. */
function reset() { hits.clear(); }

module.exports = { loginRateLimiter, reset };
