/**
 * One-time migration: pull the *config/design* tables out of the legacy SQLite
 * database (data/hmi_studio.db) into the JSON file store used by src/store.js.
 *
 * Only config data is migrated — pages, recipes, alarm_definitions, users,
 * app_settings. Runtime/historical tables (batch/stat/trace/audit/alarm_history)
 * are NOT migrated: the audit trail is now a local file (data/audit_log.jsonl)
 * and alarm history is not persisted.
 *
 * Run once:  node --experimental-sqlite backend/scripts/migrate_sqlite_to_json.js
 * Safe to re-run (it overwrites the JSON files from the current .db).
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'hmi_studio.db');

if (!fs.existsSync(DB_FILE)) {
  console.error('No hmi_studio.db found at', DB_FILE, '— nothing to migrate.');
  process.exit(0);
}

const db = new DatabaseSync(DB_FILE);

function writeCollection(name, rows, idField = 'id') {
  const nextId = rows.reduce((m, r) => {
    const v = Number(r[idField]);
    return Number.isFinite(v) && v > m ? v : m;
  }, 0) + 1;
  const file = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ nextId, rows }, null, 2));
  console.log(`  ${name}.json  (${rows.length} rows, nextId=${nextId})`);
}

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function selectAll(name) {
  return tableExists(name) ? db.prepare(`SELECT * FROM ${name}`).all() : [];
}

console.log('Migrating config tables from', DB_FILE);

// pages — definition TEXT(JSON) → object
const pages = selectAll('pages').map((r) => {
  const out = { ...r };
  if (typeof out.definition === 'string') {
    try { out.definition = JSON.parse(out.definition); } catch { out.definition = { widgets: [] }; }
  }
  if (typeof out.id === 'bigint') out.id = Number(out.id);
  return out;
});
writeCollection('pages', pages, 'id');

// recipes — parameters TEXT(JSON) → object
const recipes = selectAll('recipes').map((r) => {
  const out = { ...r };
  if (typeof out.parameters === 'string') {
    try { out.parameters = JSON.parse(out.parameters); } catch { out.parameters = {}; }
  }
  if (typeof out.id === 'bigint') out.id = Number(out.id);
  return out;
});
writeCollection('recipes', recipes, 'id');

// alarm_definitions — straight copy
const alarmDefs = selectAll('alarm_definitions').map((r) => {
  const out = { ...r };
  if (typeof out.id === 'bigint') out.id = Number(out.id);
  return out;
});
writeCollection('alarm_definitions', alarmDefs, 'id');

// users — is_active INTEGER → boolean
const users = selectAll('users').map((r) => {
  const out = { ...r };
  if (typeof out.id === 'bigint') out.id = Number(out.id);
  out.is_active = out.is_active === 1 || out.is_active === true;
  return out;
});
writeCollection('users', users, 'id');

// app_settings — key/value rows → a single JSON object
const settingsRows = selectAll('app_settings');
const settings = {};
for (const row of settingsRows) settings[row.key] = row.value;
fs.writeFileSync(path.join(DATA_DIR, 'app_settings.json'), JSON.stringify(settings, null, 2));
console.log(`  app_settings.json  (${settingsRows.length} keys)`);

db.close();
console.log('Done.');
