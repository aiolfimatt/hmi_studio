/**
 * JSON file store — replaces the former SQLite database for the application's
 * *config / design* data: pages, recipes, alarm definitions, app settings and
 * user accounts. Each collection is one file under `data/` holding
 * `{ nextId, rows: [...] }`; writes are synchronous and atomic (temp + rename).
 *
 * The audit trail is a separate append-only file (data/audit_log.jsonl via
 * services/eventLog), not a collection here. Fired-alarm history is not
 * persisted — active alarms are kept in memory by services/alarmWatcher.
 *
 * This is deliberately tiny: the app is single-process and low-volume, so an
 * in-memory array persisted on every mutation is more than enough and keeps the
 * data human-readable / git-diffable.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const groupsService = require('./services/groups');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/** Timestamp in the same "YYYY-MM-DD HH:MM:SS" shape the old datetime('now') used (UTC). */
function now() {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

class Collection {
  constructor(name, idField = 'id') {
    this.name = name;
    this.idField = idField;
    this.file = path.join(DATA_DIR, `${name}.json`);
    this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.rows = Array.isArray(raw) ? raw : (Array.isArray(raw.rows) ? raw.rows : []);
      this.nextId = (raw && raw.nextId) || this._maxId() + 1;
    } catch {
      this.rows = [];
      this.nextId = 1;
    }
  }

  _maxId() {
    return this.rows.reduce((m, r) => {
      const v = Number(r[this.idField]);
      return Number.isFinite(v) && v > m ? v : m;
    }, 0);
  }

  _save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ nextId: this.nextId, rows: this.rows }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  all() { return this.rows; }
  find(pred) { return this.rows.find(pred) || null; }
  filter(pred) { return this.rows.filter(pred); }
  count(pred) { return pred ? this.rows.filter(pred).length : this.rows.length; }

  /** Insert a row, assigning an auto-increment id when the id field is absent. */
  insert(row) {
    const r = { ...row };
    if (r[this.idField] == null) r[this.idField] = this.nextId++;
    else this.nextId = Math.max(this.nextId, Number(r[this.idField]) + 1);
    this.rows.push(r);
    this._save();
    return r;
  }

  /** Apply a patch (object or (row)=>patch) to every matching row. Returns count. */
  update(pred, patch) {
    let n = 0;
    for (const r of this.rows) {
      if (!pred(r)) continue;
      Object.assign(r, typeof patch === 'function' ? patch(r) : patch);
      n++;
    }
    if (n) this._save();
    return n;
  }

  remove(pred) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !pred(r));
    const n = before - this.rows.length;
    if (n) this._save();
    return n;
  }

  /** Overwrite the whole collection (used by CSV/bundle bulk imports & migration). */
  replaceAll(rows) {
    this.rows = rows.slice();
    this.nextId = this._maxId() + 1;
    this._save();
  }
}

/** Simple key/value document store (one JSON file), for app-global settings. */
class KeyValueStore {
  constructor(name) {
    this.file = path.join(DATA_DIR, `${name}.json`);
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; }
    catch { this.data = {}; }
  }
  get(key) { return key in this.data ? this.data[key] : null; }
  /** The whole settings object (used by full-project export). */
  all() { return this.data; }
  set(key, value) {
    this.data[key] = value;
    this._save();
  }
  /** Replace every setting at once (used by project import / new). */
  replaceAll(obj) {
    this.data = obj && typeof obj === 'object' ? { ...obj } : {};
    this._save();
  }
  _save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

// ── Collections ────────────────────────────────────────────────────────────────
const pages            = new Collection('pages', 'id');
const recipes          = new Collection('recipes', 'id');
const alarmDefinitions = new Collection('alarm_definitions', 'id');
// Shared, reusable text lists for composite alarms (e.g. a "motors" list and a
// "causes" list). Each row: { id, name, entries: [ { <lang>: text }, … ] }. A
// composite alarm references a list by id and indexes an entry with a number
// read live from the PLC — see services/alarmWatcher + routes/alarms.
const alarmLists       = new Collection('alarm_lists', 'id');
// Reusable widget library: saved, pre-configured widgets (a single widget like a
// "back" button, or a group saved together as one template). Placing a library
// item onto a page inserts an independent COPY — later edits to the library item
// do not affect already-placed widgets. Each row:
//   { id, name, category, kind: 'single'|'group', widgets: [ <widget>, … ],
//     created_by, created_at, updated_at }
// Stored widget positions are relative to the group's bounding-box origin (0,0);
// the editor offsets them to the drop point and assigns fresh ids on insert.
const widgetLibrary    = new Collection('widget_library', 'id');
const users            = new Collection('users', 'id');
const groups           = new Collection('groups', 'id');
const settings         = new KeyValueStore('app_settings');

// Machine / PLC configuration. This describes WHAT the HMI connects to (protocol,
// ADS/OPC-UA endpoint, ads_data mapping, alarms), so it belongs to the
// PROJECT — it travels inside a .hmiproj bundle — NOT to the per-installation infra
// in config/conf.json (secrets, ports, features). Single-machine deployment: only
// the first entry is used. On first run, migrate any machines still declared in
// conf.json (older installs); otherwise seed one mock machine so a fresh install
// runs with no PLC attached.
const machines = new Collection('machines', 'id');
if (!machines.all().length) {
  let seed = [];
  try {
    const conf = require('../../config/conf.json');
    if (Array.isArray(conf.machines) && conf.machines.length) seed = conf.machines.slice(0, 1);
  } catch { /* conf.json is infra-only / optional */ }
  if (!seed.length) seed = [{ id: 1, name: 'Machine 1', protocol: 'mock', is_active: true }];
  machines.replaceAll(seed);
}

// ── Seed default groups (Operator / Maintenance / Installer / UserAdmin) ──────
groupsService.seedDefaults(groups);

// ── Seed default admin (password: admin123) ───────────────────────────────────
// Mirrors the former db.js bootstrap so a fresh install can always log in. The
// admin lands in the Installer group (editMode + manageUsers) and never expires,
// so the only bootstrap account cannot lock itself out of the designer.
if (!users.find((u) => u.username === 'admin')) {
  users.insert({
    username: 'admin',
    password_hash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    full_name: 'Administrator',
    email: '',
    group: 3,
    password_never_expires: true,
    is_active: true,
    failed_attempts: 0,
    locked: 0,
    password_expires_at: null,
    last_login_at: null,
    created_at: now(),
    updated_at: now(),
  });
}

// ── Secure-by-default: warn if the bootstrap admin keeps the shipped password ──
// A fresh install seeds admin/admin123 so the designer is reachable; leaving it in
// place is a security risk (CRA: secure configuration). Warn loudly at startup.
try {
  const admin = users.find((u) => u.username === 'admin');
  if (admin && bcrypt.compareSync('admin123', admin.password_hash)) {
    console.warn('[security] The default "admin" account still uses the shipped password (admin123). Change it immediately via the UI or /api/auth/change-password.');
  }
} catch { /* non-fatal */ }

// ── One-time migration: numeric levels → groups (idempotent) ──────────────────
// Maps existing users' password_level → group and widgets' widgetLevel →
// editGroup. Guarded by a settings flag so it never double-runs. Safe to leave
// in place permanently (a fresh install is already in the new shape, so the flag
// is set with nothing to migrate).
function migrateLegacyLevels() {
  if (settings.get('groups_migrated')) return;
  const L = groupsService.LEGACY_LEVEL_TO_GROUP;

  // Users: password_level → group; drop password_level; default never-expires.
  const needUsers = users.all().some((u) => u.password_level !== undefined || u.group === undefined);
  if (needUsers) {
    const mapped = users.all().map((u) => {
      const { password_level, ...rest } = u;
      const group = u.group != null ? u.group : (L[Number(password_level)] || 1);
      return { ...rest, group, password_never_expires: u.password_never_expires ?? false };
    });
    users.replaceAll(mapped);
  }

  // Pages: widget props widgetLevel → editGroup (0/absent = unprotected); page
  // required_level → editGroup (designer metadata, not runtime-enforced).
  const mappedPages = pages.all().map((p) => {
    const def = (p.definition && typeof p.definition === 'object') ? p.definition
              : (typeof p.definition === 'string' ? safeParse(p.definition) : { widgets: [] });
    const widgets = (def.widgets || []).map((w) => {
      if (!w || !w.props || !('widgetLevel' in w.props)) return w;
      const { widgetLevel, ...props } = w.props;
      const lvl = Number(widgetLevel) || 0;
      if (lvl > 0) props.editGroup = L[lvl] || 3;
      return { ...w, props };
    });
    const pageEditGroup = (Number(p.required_level) || 0) > 0 ? (L[Number(p.required_level)] || 3) : null;
    const nextDef = typeof p.definition === 'string' ? JSON.stringify({ ...def, widgets }) : { ...def, widgets };
    return { ...p, definition: nextDef, editGroup: pageEditGroup };
  });
  pages.replaceAll(mappedPages);

  settings.set('groups_migrated', true);
}

function safeParse(s) { try { return JSON.parse(s); } catch { return { widgets: [] }; } }

migrateLegacyLevels();

module.exports = {
  now,
  pages,
  recipes,
  alarmDefinitions,
  alarmLists,
  widgetLibrary,
  users,
  groups,
  settings,
  machines,
  DATA_DIR,
  Collection,
};
