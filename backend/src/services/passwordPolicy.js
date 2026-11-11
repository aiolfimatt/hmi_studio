/**
 * Password policy helpers — single source of truth for expiry / lockout knobs,
 * replacing the duplicated expiresAt()/fmt()/pad() that lived in routes/auth.js
 * and routes/users.js. Knobs come from config/conf.json `security`.
 */
const conf = require('../../../config/conf.json');

const SEC = conf.security || {};

function pad(n) { return String(n).padStart(2, '0'); }

/** "YYYY-MM-DD HH:MM:SS" (local), the shape the user store already uses. */
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function lifetimeMonths() { return Number(SEC.password_lifetime_months) || 0; }
function minChars() { return Number(SEC.min_password_chars) || 4; }
function maxFailedAttempts() { return Number(SEC.max_failed_attempts) || 10; }

/**
 * Expiry date `months` ahead (default = configured lifetime), or null when
 * expiry is disabled (months <= 0).
 */
function expiresAt(months) {
  const m = months == null ? lifetimeMonths() : Number(months);
  if (!m || m <= 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return fmt(d);
}

/** Has this user's password expired? never-expires accounts never do. */
function isExpired(user) {
  if (!user || user.password_never_expires) return false;
  if (!user.password_expires_at) return false;
  return new Date(user.password_expires_at) < new Date();
}

module.exports = { pad, fmt, lifetimeMonths, minChars, maxFailedAttempts, expiresAt, isExpired };
