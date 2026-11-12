/**
 * Trace routes — query the local audit log (data/audit_log.jsonl via eventLog).
 * Reading the audit trail requires the viewAudit capability (implied by editMode).
 */
const express = require('express');
const eventLog = require('../services/eventLog');
const { authMiddleware, requireCapability } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', requireCapability('viewAudit'), (req, res) => {
  const { event_type, from, to, username, q, limit = 200, offset = 0 } = req.query;
  try {
    const { rows, total } = eventLog.query({ event_type, from, to, username, q, limit, offset });
    res.json({ rows, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
