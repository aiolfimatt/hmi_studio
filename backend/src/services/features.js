/**
 * features — single arbiter for the optional-subsystem master switches.
 *
 * Each toggleable subsystem (alarm watcher, local audit trail, LDAP auth
 * fallback) can be turned on/off from ONE place: the top-level `features` block
 * in conf.json. `isEnabled(key)` is the only thing the rest of the backend
 * consults — index.js gates every service init() with it, and demand-driven
 * paths (eventLog.append, ldap login) call it too, so a flipped switch takes
 * full effect.
 *
 * When a key is ABSENT from conf.features (or the block is missing), isEnabled()
 * falls back to the feature's own nested config flag. When the key IS present,
 * its boolean is authoritative (a master kill-switch).
 */
const conf = require('../../../config/conf.json');
const store = require('../store');

function machine0() { return store.machines.all()[0] || {}; }
function anyMachine(pred) { return store.machines.all().some(pred); }

// Enabled-state for each feature when conf.features doesn't pin the key. This
// list is the canonical registry of toggleable features.
const FALLBACKS = {
  alarms:    () => anyMachine((m) => m.alarms?.enabled),
  ldap:      () => !!conf.ldap_gateway?.enabled,
  event_log: () => true,   // local audit trail (data/audit_log.jsonl) — on by default
};

/** Master on/off for a feature. conf.features[key] wins; else the nested flag. */
function isEnabled(key) {
  const f = conf.features;
  if (f && Object.prototype.hasOwnProperty.call(f, key)) return !!f[key];
  const fb = FALLBACKS[key];
  return fb ? fb() : false;
}

/** Resolved {feature: bool} map — for a startup summary / status endpoint. */
function all() {
  return Object.keys(FALLBACKS).reduce((o, k) => { o[k] = isEnabled(k); return o; }, {});
}

/** Log the resolved switches once at startup so the active set is visible. */
function logSummary() {
  const m = all();
  const on = Object.keys(m).filter((k) => m[k]);
  const off = Object.keys(m).filter((k) => !m[k]);
  console.log(`[features] enabled: ${on.join(', ') || '(none)'}`);
  if (off.length) console.log(`[features] disabled: ${off.join(', ')}`);
}

module.exports = { isEnabled, all, logSummary, FEATURES: Object.keys(FALLBACKS) };
