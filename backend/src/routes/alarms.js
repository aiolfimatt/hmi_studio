const express = require('express');
const store = require('../store');
const { authMiddleware, requireLevel, requireAdmin } = require('../auth');
const { CATALOGUE_CODES, resolveText } = require('../i18n/languages');
const alarmWatcher = require('../services/alarmWatcher');

const router = express.Router();

// Multilingual description columns (one per catalogue language). Rows carry all
// 7 columns; we read/write them generically so adding a language never touches
// this file.
const DESC_COLS = CATALOGUE_CODES.map((c) => `description_${c}`);

// Composite-alarm fields stored on an alarm definition. A composite alarm's
// description is assembled at runtime from two shared text lists, each indexed
// by a number read live from the PLC (see services/alarmWatcher). Non-composite
// alarms simply ignore these.
//   composite          – on/off
//   composite_parts    – [ { list_id, address, data_type }, … ] (two, per spec)
//   composite_index_base – 0 or 1: what PLC value means "first entry" (default 1)
//   composite_separator  – glue between the parts (default " — ")
//   composite_include_base – prepend the alarm's own description_<lang> (default off)
function readCompositeFields(body) {
  const parts = Array.isArray(body.composite_parts)
    ? body.composite_parts.slice(0, 2).map((p) => ({
        list_id: p && p.list_id != null ? p.list_id : null,
        address: p && p.address != null ? String(p.address) : '',
        data_type: (p && p.data_type) || 'INT16',
      }))
    : [];
  return {
    composite: !!body.composite,
    composite_parts: parts,
    composite_index_base: Number(body.composite_index_base) === 0 ? 0 : 1,
    composite_separator: typeof body.composite_separator === 'string' ? body.composite_separator : ' — ',
    composite_include_base: !!body.composite_include_base,
  };
}

// Build a { code: text } description map from a definition row.
function descMap(def) {
  const m = {};
  for (const c of CATALOGUE_CODES) m[c] = def[`description_${c}`] ?? '';
  return m;
}

// Compose one composite part's text for `lang` from its list + latched index.
function partText(part, rawIndex, indexBase, lang) {
  if (!part || part.list_id == null || rawIndex == null) return '';
  const list = store.alarmLists.find((l) => String(l.id) === String(part.list_id));
  if (!list || !Array.isArray(list.entries)) return '';
  const idx = Number(rawIndex) - indexBase;
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.entries.length) return '';
  return resolveText(list.entries[idx], lang) || '';
}

// Compose the full composite description for `lang`. Falls back to '' when no
// part resolves (caller then keeps the generic description).
function composeComposite(def, indices, lang) {
  const sep = def.composite_separator || ' — ';
  const base = Number(def.composite_index_base) === 0 ? 0 : 1;
  const bits = [];
  if (def.composite_include_base) {
    const b = resolveText(descMap(def), lang);
    if (b) bits.push(b);
  }
  (def.composite_parts || []).forEach((part, i) => {
    const t = partText(part, indices ? indices[i] : null, base, lang);
    if (t) bits.push(t);
  });
  return bits.join(sep);
}

// Enrich an active alarm (from the in-memory watcher) with its definition's
// descriptions + severity, matching the legacy alarm_history ⋈ alarm_definitions
// shape the frontend consumes. There is no persisted history row, so id is the
// alarm_code and acknowledged_at/resolved_at are always null.
//
// For a composite alarm whose indices were latched at trigger time, the per-
// language descriptions are replaced with the text composed from the two lists;
// languages that compose to nothing keep the generic description as a fallback.
function enrichActive(a) {
  const def = store.alarmDefinitions.find((d) => Number(d.alarm_code) === Number(a.alarm_code));
  const out = {
    id: String(a.alarm_code),
    alarm_code: a.alarm_code,
    occurred_at: a.occurred_at, acknowledged_at: null, resolved_at: null,
    severity: def?.severity || 'warning',
  };
  for (const c of DESC_COLS) out[c] = def ? (def[c] ?? null) : null;
  if (def && def.composite && a.composite_indices) {
    for (const c of CATALOGUE_CODES) {
      const composed = composeComposite(def, a.composite_indices, c);
      if (composed) out[`description_${c}`] = composed;
    }
  }
  return out;
}

// --- Public runtime read (no auth) ---
// The runtime HMI (MonitorPage) has no session, so it needs an unauthenticated
// read of active alarms to drive the on-screen cycling banner widget and the
// full-screen popup. Read-only; every management route below stays admin-only.
router.get('/public/active', (req, res) => {
  try {
    res.json(alarmWatcher.getActive().map(enrichActive));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Alarms management is edit-mode only → admins only.
router.use(authMiddleware, requireAdmin);

// --- Alarm definitions ---

// GET /api/alarms/definitions
router.get('/definitions', (req, res) => {
  try {
    const rows = store.alarmDefinitions.all().slice()
      .sort((a, b) => (a.alarm_code || 0) - (b.alarm_code || 0));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/alarms/definitions
router.post('/definitions', requireLevel(2), (req, res) => {
  const { alarm_code, severity } = req.body;
  if (!alarm_code) return res.status(400).json({ error: 'alarm_code required' });
  try {
    if (store.alarmDefinitions.find((r) => r.alarm_code === alarm_code)) {
      return res.status(409).json({ error: 'Alarm definition already exists' });
    }
    const row = { alarm_code, severity: severity || 'warning', ...readCompositeFields(req.body) };
    for (const c of DESC_COLS) row[c] = req.body[c] || null;
    res.json(store.alarmDefinitions.insert(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/alarms/definitions/:id
router.put('/definitions/:id', requireLevel(2), (req, res) => {
  const { alarm_code, severity } = req.body;
  try {
    const existing = store.alarmDefinitions.find((r) => String(r.id) === String(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Alarm definition not found' });
    // Guard alarm_code uniqueness like the old UNIQUE constraint.
    const clash = store.alarmDefinitions.find(
      (r) => r.id !== existing.id && r.alarm_code === alarm_code
    );
    if (clash) return res.status(409).json({ error: 'Alarm definition already exists' });
    const patch = { alarm_code, severity: severity || 'warning', ...readCompositeFields(req.body) };
    for (const c of DESC_COLS) patch[c] = req.body[c] || null;
    store.alarmDefinitions.update((r) => r.id === existing.id, patch);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/alarms/definitions/:id
router.delete('/definitions/:id', requireLevel(3), (req, res) => {
  try {
    store.alarmDefinitions.remove((r) => String(r.id) === String(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Alarm text lists (shared, reusable; used by composite alarms) ---

// Normalise a posted entries array to clean { code: text } maps (catalogue codes
// only, blanks dropped). Order is significant: an entry's position is its row.
function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => {
    const m = {};
    if (e && typeof e === 'object') {
      for (const c of CATALOGUE_CODES) {
        const v = e[c];
        if (v != null && String(v) !== '') m[c] = String(v);
      }
    }
    return m;
  });
}

// GET /api/alarms/lists
router.get('/lists', (req, res) => {
  try {
    const rows = store.alarmLists.all().slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/alarms/lists
router.post('/lists', requireLevel(2), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'List name required' });
  try {
    if (store.alarmLists.find((l) => l.name === name)) {
      return res.status(409).json({ error: 'A list with this name already exists' });
    }
    res.json(store.alarmLists.insert({ name, entries: normalizeEntries(req.body?.entries) }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/alarms/lists/:id
router.put('/lists/:id', requireLevel(2), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'List name required' });
  try {
    const existing = store.alarmLists.find((l) => String(l.id) === String(req.params.id));
    if (!existing) return res.status(404).json({ error: 'List not found' });
    const clash = store.alarmLists.find((l) => l.id !== existing.id && l.name === name);
    if (clash) return res.status(409).json({ error: 'A list with this name already exists' });
    store.alarmLists.update((l) => l.id === existing.id, { name, entries: normalizeEntries(req.body?.entries) });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/alarms/lists/:id
router.delete('/lists/:id', requireLevel(3), (req, res) => {
  try {
    store.alarmLists.remove((l) => String(l.id) === String(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Alarm history (disabled) ---
// Fired-alarm history is not persisted — only the current active set is kept
// (in memory, by alarmWatcher). The GET returns an empty, well-formed payload so
// history views don't error; the mutating endpoints report 501 so callers know
// the feature is off.
const HISTORY_DISABLED = { error: 'Alarm history is disabled (only active alarms are tracked)', code: 'HISTORY_DISABLED' };

router.get('/history', (req, res) => res.json({ rows: [], total: 0 }));
router.post('/history', requireLevel(2), (req, res) => res.status(501).json(HISTORY_DISABLED));
router.put('/history/:id/acknowledge', (req, res) => res.status(501).json(HISTORY_DISABLED));
router.put('/history/:id/resolve', (req, res) => res.status(501).json(HISTORY_DISABLED));

// --- Active alarms shortcut (authenticated) ---
// GET /api/alarms/active
router.get('/active', (req, res) => {
  try {
    res.json(alarmWatcher.getActive().map(enrichActive));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
