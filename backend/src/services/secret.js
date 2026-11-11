/**
 * JWT signing secret — resolved once, securely.
 *
 * Secure-by-default (CRA): the application must NEVER sign tokens with a known or
 * shipped default key. Resolution order:
 *   1. HMI_JWT_SECRET environment variable (preferred for production / secret stores)
 *   2. config/conf.json `jwt_secret`, IF it is set and not the shipped placeholder
 *   3. otherwise: generate a strong RANDOM ephemeral secret at startup and warn.
 *
 * With (3) the app stays secure out of the box, but every restart invalidates
 * existing sessions — operators simply log in again. Set a persistent secret for
 * production so sessions survive restarts.
 */
const crypto = require('crypto');
const conf = require('../../../config/conf.json');

const PLACEHOLDER = 'change_this_secret_in_production';
let cached = null;

function jwtSecret() {
  if (cached) return cached;

  const fromEnv = (process.env.HMI_JWT_SECRET || '').trim();
  if (fromEnv) { cached = fromEnv; return cached; }

  const fromConf = (conf.jwt_secret || '').trim();
  if (fromConf && fromConf !== PLACEHOLDER) { cached = fromConf; return cached; }

  cached = crypto.randomBytes(48).toString('base64');
  console.warn(
    '[security] No jwt_secret configured (missing, empty, or still the shipped ' +
    'placeholder). Generated a random ephemeral secret so tokens are never signed ' +
    'with a known key. Set HMI_JWT_SECRET (env) or config/conf.json "jwt_secret" to ' +
    'a strong value for production — otherwise all sessions are invalidated on restart.'
  );
  return cached;
}

module.exports = { jwtSecret };
