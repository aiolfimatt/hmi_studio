/**
 * Shared navigation sidebar config — a single global object (buttons + style)
 * used by every SidebarWidget instance, so the sidebar looks and behaves the
 * same on whatever page it is placed on.
 *
 *   GET  /api/sidebar   — public (runtime has no session) → the config
 *   PUT  /api/sidebar   — admin, level ≥ 2 → replace the config
 *
 * Stored as one JSON value in the app_settings key/value store (key = 'sidebar_config').
 */
const express = require('express');
const store = require('../store');
const { authMiddleware, requireLevel } = require('../auth');

const router = express.Router();
const KEY = 'sidebar_config';

const DEFAULT_CONFIG = {
  orientation: 'vertical', // 'vertical' | 'horizontal'
  bgColor: '#1e293b',
  textColor: '#e2e8f0',
  activeColor: '#1677ff',
  iconSize: 22,
  buttonSize: 56,          // button extent along the bar's main axis (height if vertical, width if horizontal)
  showLabels: true,
  align: 'start',          // 'start' | 'center'
  buttons: [],             // [{ id, label(string|{code:text}), icon, targetPage }]
};

// Tolerate a legacy value stored as a JSON string (migrated from SQLite).
function readConfig() {
  let cfg = store.settings.get(KEY);
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = null; } }
  return cfg && typeof cfg === 'object' ? cfg : null;
}

// GET — public read for the runtime.
router.get('/', (req, res) => {
  try {
    const cfg = readConfig();
    res.json(cfg ? { ...DEFAULT_CONFIG, ...cfg } : DEFAULT_CONFIG);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT — admin only (installer level).
router.put('/', authMiddleware, requireLevel(2), (req, res) => {
  const incoming = req.body && typeof req.body === 'object' ? req.body : {};
  const cfg = { ...DEFAULT_CONFIG, ...incoming };
  if (!Array.isArray(cfg.buttons)) cfg.buttons = [];
  try {
    store.settings.set(KEY, cfg);
    res.json({ ok: true, config: cfg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
