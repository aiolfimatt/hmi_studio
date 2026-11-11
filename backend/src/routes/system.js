/**
 * System routes — runtime simulation switch and machine info.
 */
const express = require('express');
const conf = require('../../../config/conf.json');
const store = require('../store');
const pkg = require('../../package.json');
const { PROJECT_VERSION, getProgramVersion } = require('./project');
const { authMiddleware, requireLevel } = require('../auth');
const scanner = require('../scanner');

const router = express.Router();

// App version + program version tag — PUBLIC so the operator runtime (which
// has no login) can display both. Declared before authMiddleware on purpose.
//   { app, projectFormat, programVersion: <string> | null }
router.get('/version', (req, res) => {
  res.json({ app: pkg.version, projectFormat: PROJECT_VERSION, programVersion: getProgramVersion() });
});

router.use(authMiddleware);

// Current simulation state + machine protocol overview
router.get('/sim', (req, res) => {
  res.json({
    simulation: scanner.getSimulation(),
    machines: store.machines.all().map((m) => ({
      id: m.id, name: m.name, is_active: m.is_active,
      protocol: m.protocol || 'mock',
      effective: scanner.protocolOf(m),
    })),
  });
});

// Feature flags consumed by the frontend (idle logout, …).
router.get('/config', (req, res) => {
  res.json({
    // Inactivity auto-logout window. Configured in seconds (security.auto_logout_s,
    // 0 = disabled); converted to ms here since the client timers are ms-native.
    auto_logout_ms: (Number(conf.security && conf.security.auto_logout_s) || 0) * 1000,
  });
});

// Toggle simulation (INSTALLATORE+). When on, no PLC connection is needed.
router.post('/sim', requireLevel(2), (req, res) => {
  const enabled = !!req.body.enabled;
  const simulation = scanner.setSimulation(enabled);
  res.json({ simulation });
});

module.exports = router;
