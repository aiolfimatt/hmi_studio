/**
 * LDAP gateway client — optional external authentication fallback.
 *
 * The gateway is a separate C# service (../Ldap_gateway) that bridges HTTP to an
 * LDAP/AD server. It exposes `POST /login` with body { "User", "Password" } and
 * replies { "Success": bool, "Levels": int[5] }. `Levels` is pre-filled with -1
 * and populated — in match order — with the caller's authorization level for
 * each matched group; `Success` is true iff the bind succeeded AND at least one
 * group matched (so when Success is true, Levels[0] is a real value >= 1).
 *
 * Usage (routes/auth.js): internal accounts are checked FIRST; only a username
 * with no local record is forwarded here. We take the FIRST int of `Levels` as a
 * group INDEX and resolve it to one of hmi_studio's groups by position — the
 * group order here must mirror the gateway's GROUP_LEVEL_* order. Everything is
 * driven by conf.ldap_gateway; disabled by default.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');
const conf = require('../../../config/conf.json');
const features = require('./features');

function cfg() { return conf.ldap_gateway || {}; }

/** Is the LDAP fallback turned on? Resolved via the central feature switch
 *  (conf.features.ldap, falling back to conf.ldap_gateway.enabled). */
function isEnabled() { return features.isEnabled('ldap'); }

/**
 * POST credentials to the gateway. Never rejects: any transport/parse failure
 * resolves to { success: false, error } so the caller can simply deny the login.
 * On success resolves { success: true, levels: number[] }.
 */
function authenticate(username, password) {
  return new Promise((resolve) => {
    const c = cfg();
    let url;
    try { url = new URL(c.url); } catch { return resolve({ success: false, error: 'invalid ldap_gateway.url' }); }

    const payload = JSON.stringify({ User: username, Password: password });
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: c.timeout_ms || 8000,
    }, (resp) => {
      let data = '';
      resp.on('data', (d) => { data += d; });
      resp.on('end', () => {
        if (resp.statusCode !== 200) return resolve({ success: false, error: `gateway HTTP ${resp.statusCode}` });
        try {
          const j = JSON.parse(data);
          resolve({
            success: !!j.Success,
            levels: Array.isArray(j.Levels) ? j.Levels.map(Number) : [],
          });
        } catch { resolve({ success: false, error: 'malformed gateway response' }); }
      });
    });
    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'gateway timeout' }); });
    req.write(payload);
    req.end();
  });
}

/**
 * Map a gateway `Levels` array to an hmi_studio group id.
 *
 * The FIRST int is treated as the group index. Groups are taken in their stored
 * order (data/groups.json row order — the same order shown in the admin UI), so
 * the gateway's GROUP_LEVEL_* ordering must mirror the hmi_studio group order.
 * With the default index_base = 1: Levels[0]=1 → 1st group, 2 → 2nd, …
 * A non-positive / out-of-range index (e.g. the -1 padding) yields null = deny.
 */
function groupForLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) return null;
  const idx = Number(levels[0]);
  const base = cfg().index_base == null ? 1 : Number(cfg().index_base);
  if (!Number.isFinite(idx) || idx < base) return null;
  // Lazily require the store to avoid a load-time circular dependency.
  const ordered = require('../store').groups.all();
  const g = ordered[idx - base];
  return g ? Number(g.id) : null;
}

module.exports = { isEnabled, authenticate, groupForLevels };
