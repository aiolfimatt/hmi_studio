/**
 * clientLog — forward operator-side (frontend) errors to the backend diagnostic
 * log via POST /api/client-log, so a kiosk crash the operator can't inspect
 * still lands in data/logs/app.log next to the server logs.
 *
 * Defensive by design: it never throws, caps how many reports a single page load
 * can send, and de-dupes identical messages within a short window so a render
 * loop can't flood the endpoint. Uses `fetch(..., { keepalive })` so the report
 * survives a page that is navigating away or tearing down.
 */
const MAX_REPORTS = 25      // per page load
const DEDUPE_MS = 10000     // drop identical message+context within this window

let sent = 0
const recent = new Map()

export function reportClientError(entry = {}) {
  try {
    if (sent >= MAX_REPORTS) return
    const message = String(entry.message || '').slice(0, 2000)
    const context = String(entry.context || '').slice(0, 500)

    const key = `${message}|${context}`
    const now = Date.now()
    const last = recent.get(key)
    if (last && now - last < DEDUPE_MS) return
    recent.set(key, now)
    sent += 1

    const body = JSON.stringify({
      level: entry.level || 'error',
      message,
      stack: String(entry.stack || '').slice(0, 8000),
      context,
      url: (typeof location !== 'undefined' ? location.href : '').slice(0, 500),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300),
    })

    fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* diagnostics are best-effort — never surface a failure */ })
  } catch {
    /* the reporter must never throw */
  }
}
