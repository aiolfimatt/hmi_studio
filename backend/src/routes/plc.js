const express = require('express');
const store = require('../store');
const ads = require('../plc/ads');
const opcua = require('../plc/opcua');
const { authMiddleware, optionalAuth } = require('../auth');
const scanner = require('../scanner');
const { checkWidgetAccess, levelsFromUser, checkGroupAccess, accessGroupsFromUser } = require('../services/access');
const { LEGACY_LEVEL_TO_GROUP } = require('../services/groups');
const eventLog = require('../services/eventLog');
const scriptRunner = require('../services/scriptRunner');
const { HMI_EVENT } = require('../services/constants');

const router = express.Router();

// Pick the symbol/node browsing driver for a machine's configured protocol.
// ADS browses the TwinCAT symbol table; OPC UA browses the server address space.
// Both expose listSymbols / listStructFields / isAvailable with the same shape.
function browseDriver(machine) {
  const proto = String(machine.protocol || '').toLowerCase();
  if (proto === 'ads') return { driver: ads, label: 'ADS (Beckhoff)', dep: 'ads-client' };
  if (proto === 'opcua') return { driver: opcua, label: 'OPC UA', dep: 'node-opcua' };
  return null;
}

// Short-lived cache of each ADS machine's symbol table so browsing the editor
// doesn't re-download thousands of symbols from the PLC every time the picker
// opens. `?refresh=1` forces a fresh read.
const symbolCache = new Map(); // machineId → { at, symbols }
const SYMBOL_TTL_MS = 30000;

// List available PLC symbols for an ADS (Beckhoff) machine — powers the widget
// editor's variable browser. Session-gated (editor only). Uses the machine's
// CONFIGURED protocol (not the effective one) so symbols can be browsed against
// the real PLC even while the app runs in global simulation for display.
router.get('/:machineId/symbols', authMiddleware, async (req, res) => {
  const machineId = Number(req.params.machineId);
  const machine = store.machines.find((m) => m.id === machineId);
  if (!machine) return res.status(404).json({ error: `machine ${machineId} not found` });
  const b = browseDriver(machine);
  if (!b) {
    return res.status(400).json({ error: 'Symbol browsing is only available for ADS (Beckhoff) and OPC UA machines' });
  }
  if (!b.driver.isAvailable()) {
    return res.status(501).json({ error: `${b.dep} is not installed on the server` });
  }

  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const cached = symbolCache.get(machineId);
  if (!refresh && cached && Date.now() - cached.at < SYMBOL_TTL_MS) {
    return res.json({ symbols: cached.symbols, count: cached.symbols.length, cached: true });
  }

  try {
    const symbols = await b.driver.listSymbols(machine);
    symbolCache.set(machineId, { at: Date.now(), symbols });
    res.json({ symbols, count: symbols.length, cached: false });
  } catch (e) {
    res.status(502).json({ error: `Cannot reach PLC: ${e.message}` });
  }
});

// Detect the scalar fields of an ADS array-of-struct symbol — powers the grid
// editor's "Detect fields" button so a struct array maps to columns without the
// designer typing each member by hand. Session-gated (editor only), ADS-only.
router.get('/:machineId/struct-fields', authMiddleware, async (req, res) => {
  const machineId = Number(req.params.machineId);
  const machine = store.machines.find((m) => m.id === machineId);
  if (!machine) return res.status(404).json({ error: `machine ${machineId} not found` });
  const b = browseDriver(machine);
  if (!b) {
    return res.status(400).json({ error: 'Struct field detection is only available for ADS (Beckhoff) and OPC UA machines' });
  }
  if (!b.driver.isAvailable()) {
    return res.status(501).json({ error: `${b.dep} is not installed on the server` });
  }
  const symbol = String(req.query.symbol || '').trim();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const fields = await b.driver.listStructFields(machine, symbol);
    res.json({ fields, count: fields.length });
  } catch (e) {
    res.status(502).json({ error: `Cannot read struct: ${e.message}` });
  }
});

// Read variable(s) — still session-gated (runtime uses the Socket.IO feed).
router.post('/read', authMiddleware, async (req, res) => {
  const { variables } = req.body; // [{machineId, address, dataType, widgetId}]
  if (!Array.isArray(variables)) return res.status(400).json({ error: 'variables array required' });
  const result = {};
  for (const v of variables) {
    try {
      result[v.widgetId || v.address] = await scanner.readVariable(undefined, v.address, v.dataType);
    } catch {
      result[v.widgetId || v.address] = null;
    }
  }
  res.json(result);
});

// Write variable — per-widget access control (legacy verifica_password) + trace.
// Runtime is anonymous: unprotected widgets write with no session; protected
// widgets require a credential (supplied by the runtime password prompt).
router.post('/write', optionalAuth, async (req, res) => {
  const { address, dataType, value, pageName, widgetLabel, editGroup, widgetLevel, widgetLevels, comment } = req.body;
  if (!address) return res.status(400).json({ error: 'address required' });

  // Access control, in precedence order:
  //  1. editGroup (current group model): writable iff the group is in the
  //     caller's accessGroups closure. null/absent = unprotected.
  //  2. legacy widgetLevels[] (pass_word[5] exact/threshold semantics).
  //  3. legacy single widgetLevel number → mapped to a group id.
  // Anonymous callers have an empty closure, so only unprotected widgets pass.
  let allowed;
  if (editGroup !== undefined) {
    allowed = checkGroupAccess(accessGroupsFromUser(req.user), editGroup);
  } else if (Array.isArray(widgetLevels)) {
    allowed = checkWidgetAccess(levelsFromUser(req.user), widgetLevels);
  } else {
    const lvl = Number(widgetLevel) || 0;
    allowed = lvl === 0 || checkGroupAccess(accessGroupsFromUser(req.user), LEGACY_LEVEL_TO_GROUP[lvl] || 3);
  }
  if (!allowed) {
    return res.status(403).json({ error: 'Insufficient privileges for this parameter' });
  }

  try {
    // Build a human-readable address string for the audit trail.
    const auditAddress = address;

    // Read current value for audit
    const oldValue = await scanner.readVariable(undefined, address, dataType);

    const ok = await scanner.writeVariable(undefined, address, value, dataType);

    // Unified trace event (buffered, non-blocking) → local audit log
    // ("value modified"). Never blocks the write. The description carries the
    // PLC variable reference so the event viewer shows WHICH variable changed:
    // "<widget label> [<plc address>]" (or just the address when there's no
    // distinct label).
    const plcRef = (widgetLabel && widgetLabel !== auditAddress)
      ? `${widgetLabel} [${auditAddress}]`
      : auditAddress;
    eventLog.append({
      action: 'value_modified',
      event_type: HMI_EVENT.VALUE_MODIFIED,
      user_id: req.user?.id ?? null,
      username: req.user?.username || 'anonymous',
      page_name: pageName || null,
      widget_label: widgetLabel || auditAddress,
      plc_address: auditAddress,
      data_type: dataType || 'REAL',
      old_value: String(oldValue),
      new_value: String(value),
      reason: comment || '',           // operator note (legacy desc_agg)
      description: plcRef,
      ip_address: req.ip,
    });

    res.json({ ok });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Read one ADS BOOL for a widget-event "condition" gate. Runtime-safe
// (optionalAuth): the runtime streams values to anonymous clients already, so a
// single on-demand bool read carries no new exposure. Returns { value: bool };
// any read error yields value:false so the gated action simply doesn't run.
router.post('/cond-read', optionalAuth, async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address required' });
  try {
    const raw = await scanner.readVariable(undefined, address, 'BOOL');
    res.json({ value: !!raw && raw !== '0' && raw !== 0 });
  } catch {
    res.json({ value: false });
  }
});

// Execute a server-side script named by a button's "execute script" event. Same
// per-widget access model as /write (editGroup → widgetLevels → widgetLevel).
// The script runs sandboxed (services/scriptRunner); only files in data/scripts
// are runnable. Traced like a value change so the event viewer shows what ran.
router.post('/run-script', optionalAuth, async (req, res) => {
  const { name, params, runId, pageName, widgetLabel, editGroup, widgetLevel, widgetLevels } = req.body;
  if (!name) return res.status(400).json({ error: 'script name required' });

  let allowed;
  if (editGroup !== undefined) {
    allowed = checkGroupAccess(accessGroupsFromUser(req.user), editGroup);
  } else if (Array.isArray(widgetLevels)) {
    allowed = checkWidgetAccess(levelsFromUser(req.user), widgetLevels);
  } else {
    const lvl = Number(widgetLevel) || 0;
    allowed = lvl === 0 || checkGroupAccess(accessGroupsFromUser(req.user), LEGACY_LEVEL_TO_GROUP[lvl] || 3);
  }
  if (!allowed) return res.status(403).json({ error: 'Insufficient privileges for this action' });

  try {
    // Always resolves with a normalised outcome (ok / error / aborted / timeout)
    // so the runtime popup can report every result uniformly — a non-ok script is
    // a 200 carrying { ok:false, message }, not an HTTP error.
    const out = await scriptRunner.run(name, { params, runId });
    const outcome = out.aborted ? 'aborted' : out.timedOut ? 'timeout' : out.ok ? 'ok' : 'error';
    eventLog.append({
      action: 'run_script',
      event_type: HMI_EVENT.SCRIPT_RUN,
      user_id: req.user?.id ?? null,
      username: req.user?.username || 'anonymous',
      page_name: pageName || null,
      widget_label: widgetLabel || `script:${name}`,
      plc_address: `script:${name}`,
      data_type: 'SCRIPT',
      old_value: '',
      new_value: outcome,
      reason: out.message || '',
      description: widgetLabel || `Run script ${name}`,
      ip_address: req.ip,
    });
    res.json(out);
  } catch (e) {
    const status = e.code === 'NO_SCRIPT' ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
});

// Abort an in-flight script by the runId the client assigned when it started it.
// Unprotected like the condition/effect helpers: the operator who launched it is
// the one watching the waiting popup. No-op (ok:false) if it already finished.
router.post('/run-script/:runId/abort', optionalAuth, (req, res) => {
  const aborted = scriptRunner.abort(req.params.runId);
  res.json({ ok: aborted });
});

// List runnable scripts for the editor's script picker (session-gated, designer).
router.get('/scripts', authMiddleware, (_req, res) => {
  res.json({ scripts: scriptRunner.listScripts() });
});

module.exports = router;
