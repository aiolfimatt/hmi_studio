/**
 * /api/client-log — operator-side (frontend) diagnostics sink.
 *
 * The runtime has no session, so this is unauthenticated BUT defensive: inputs
 * are length-clamped and a fixed-window rate limit drops floods (a crash loop
 * must not fill the disk). Reports are written to the shared diagnostic log via
 * the logger service, tagged `[client]`. This is for DIAGNOSTICS only — operator
 * actions still go through the audit trail (eventLog).
 */
const express = require('express');
const logger = require('../services/logger');

const router = express.Router();

const LIMIT = 120;        // max accepted reports per window
const WINDOW_MS = 60000;  // 1 minute
let windowStart = 0;
let count = 0;

function allow() {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) { windowStart = now; count = 0; }
  count += 1;
  return count <= LIMIT;
}

router.post('/', (req, res) => {
  // Always 204 — the client must never retry or surface a failure to the operator.
  if (!allow()) return res.status(204).end();

  const b = req.body || {};
  logger.client({
    level: typeof b.level === 'string' ? b.level : 'error',
    message: b.message,
    stack: b.stack,
    context: b.context,
    url: b.url,
    userAgent: b.userAgent || req.get('user-agent') || '',
  });
  res.status(204).end();
});

module.exports = router;
