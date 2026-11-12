import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { ScrollText, Lock, RefreshCw, Download, ChevronLeft, ChevronRight, Search, LogIn } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { t } from '../../i18n/uiStrings'

/**
 * AuditTrailWidget — runtime viewer for the local audit trail
 * (data/audit_log.jsonl, served by GET /api/trace).
 *
 * Runtime: queries as the RUNTIME operator credential (`auth`, the in-memory
 * cred from MonitorPage's login prompt), which must hold the `viewAudit`
 * capability (implied by editMode). Without it, a locked panel offers the login.
 *
 * Editor: static sample rows, so the canvas never calls the API while designing.
 *
 * Props (widgetProps):
 *   title          — header text ('' → translated "Audit trail")
 *   pageSize       — rows per page
 *   eventType      — '' = all events (operator may filter), or a fixed event code
 *   showFilters    — show the filter bar (event / user / text / date range)
 *   autoRefreshSec — re-query every N seconds (0 = off)
 *   allowExport    — show the CSV export button (exports every matching record)
 *   columns        — visible columns, subset of COLUMN_KEYS
 */

// event_type codes — mirror backend/src/services/constants.js HMI_EVENT.
export const AUDIT_EVENTS = [
  { code: 512, key: 'auditEvValueModified' },
  { code: 513, key: 'auditEvLogin' },
  { code: 514, key: 'auditEvLogout' },
  { code: 516, key: 'auditEvLoginLocked' },
  { code: 517, key: 'auditEvScriptRun' },
  { code: 612, key: 'auditEvUserCreated' },
  { code: 613, key: 'auditEvUserDeleted' },
  { code: 614, key: 'auditEvUserModified' },
  { code: 615, key: 'auditEvPasswordChanged' },
  { code: 616, key: 'auditEvUserDisabled' },
  { code: 617, key: 'auditEvUserEnabled' },
]
const EVENT_KEY = Object.fromEntries(AUDIT_EVENTS.map((e) => [e.code, e.key]))

export const COLUMN_KEYS = ['ts', 'user', 'event', 'object', 'address', 'change', 'reason']
const COLUMN_LABEL = {
  ts: 'auditColTime', user: 'auditColUser', event: 'auditColEvent', object: 'auditColObject',
  address: 'auditColAddress', change: 'auditColChange', reason: 'auditColReason',
}
const USER_EVENTS = new Set([612, 613, 614, 615, 616, 617])
const EXPORT_LIMIT = 20000 // the log is capped at ~20k records server-side

// Cell text for one record/column (plain strings, shared by the table and the CSV).
function cellText(r, col, tt) {
  switch (col) {
    case 'ts':      return r.ts || ''
    case 'user':    return r.username || ''
    case 'event':   return EVENT_KEY[r.event_type] ? tt(EVENT_KEY[r.event_type]) : (r.action || '')
    case 'object':
      if (USER_EVENTS.has(r.event_type)) return r.new_value || r.old_value || ''
      return [r.page_name, r.widget_label].filter(Boolean).join(' › ')
    case 'address': return r.plc_address || ''
    case 'change':
      if (r.event_type === 512) return `${r.old_value ?? ''} → ${r.new_value ?? ''}`
      if (r.event_type === 517) return r.new_value || ''
      return ''
    case 'reason':  return r.reason || ''
    default:        return ''
  }
}

function eventTone(code) {
  if (code === 512) return 'text-[#1677ff] bg-[#e6f0ff] border-blue-200'
  if (code === 516 || code === 613 || code === 616) return 'text-red-700 bg-red-50 border-red-200'
  if (code === 517) return 'text-violet-700 bg-violet-50 border-violet-200'
  if (USER_EVENTS.has(code)) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-gray-600 bg-gray-100 border-gray-200'
}

function csvEscape(s) {
  const v = String(s ?? '')
  return /[",;\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function normColumns(columns) {
  const list = Array.isArray(columns) ? columns.filter((c) => COLUMN_KEYS.includes(c)) : []
  return list.length ? COLUMN_KEYS.filter((c) => list.includes(c)) : COLUMN_KEYS
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function Frame({ title, actions, children }) {
  return (
    <div className="w-full h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 truncate">
          <ScrollText size={16} className="text-[#1677ff] shrink-0" /> {title}
        </span>
        <div className="flex items-center gap-1 shrink-0">{actions}</div>
      </div>
      {children}
    </div>
  )
}

function Table({ rows, cols, tt }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-gray-50 z-[1]">
        <tr className="border-b border-gray-200">
          {cols.map((c) => (
            <th key={c} className="text-left px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">
              {tt(COLUMN_LABEL[c])}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 align-top">
            {cols.map((c) => {
              const text = cellText(r, c, tt)
              if (c === 'event') {
                return (
                  <td key={c} className="px-2.5 py-1.5 whitespace-nowrap">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${eventTone(r.event_type)}`}>{text}</span>
                  </td>
                )
              }
              const mono = c === 'ts' || c === 'address' || c === 'change'
              return (
                <td key={c} title={text}
                  className={`px-2.5 py-1.5 text-gray-700 max-w-[260px] truncate ${mono ? 'font-mono text-[11px]' : ''} ${c === 'ts' || c === 'user' ? 'whitespace-nowrap' : ''} ${c === 'user' ? 'font-semibold text-gray-800' : ''}`}>
                  {text}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Editor preview ──────────────────────────────────────────────────────────────
const SAMPLE_ROWS = [
  { ts: '2026-11-12 14:02:11', username: 'operator', event_type: 512, page_name: 'Main', widget_label: 'Speed setpoint', plc_address: 'ns=1;s=MAIN.fSpeed', old_value: '1500', new_value: '1650', reason: 'Batch change' },
  { ts: '2026-11-12 13:58:40', username: 'operator', event_type: 513 },
  { ts: '2026-11-12 11:20:05', username: 'admin',    event_type: 615, new_value: 'operator' },
  { ts: '2026-11-12 09:41:17', username: 'service',  event_type: 517, page_name: 'Service', widget_label: 'Reset counters', plc_address: 'script:reset', new_value: 'ok' },
]

function EditorPreview({ title, cols, tt, showFilters, allowExport }) {
  return (
    <Frame
      title={title}
      actions={<>
        {allowExport && <span className="p-1 text-gray-400"><Download size={13} /></span>}
        <span className="p-1 text-gray-400"><RefreshCw size={13} /></span>
      </>}>
      {showFilters && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 shrink-0">
          {[tt('auditAllEvents'), tt('auditColUser'), tt('auditSearch')].map((ph) => (
            <span key={ph} className="flex-1 rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-400 truncate">{ph}</span>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden select-none">
        <Table rows={SAMPLE_ROWS} cols={cols} tt={tt} />
      </div>
    </Frame>
  )
}

// ── Locked state ────────────────────────────────────────────────────────────────
function LockedPanel({ title, loggedIn, onLogin, tt }) {
  return (
    <Frame title={title}>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Lock size={28} className="text-gray-400" />
        <p className="text-sm text-gray-500 max-w-xs">{tt(loggedIn ? 'auditNoPermission' : 'auditLoginRequired')}</p>
        {onLogin && (
          <button onClick={onLogin} className="btn-primary flex items-center gap-2 text-sm">
            <LogIn size={14} /> {tt('login')}
          </button>
        )}
      </div>
    </Frame>
  )
}

// ── Runtime viewer ──────────────────────────────────────────────────────────────
function AuditViewer({ token, title, cols, tt, pageSize, fixedEvent, showFilters, autoRefreshSec, allowExport }) {
  const [filters, setFilters] = useState({ event_type: '', username: '', q: '', from: '', to: '' })
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState({ rows: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const reqId = useRef(0)

  // Text filters are applied after a short pause so typing doesn't spam the API.
  const [debounced, setDebounced] = useState(filters)
  useEffect(() => {
    const h = setTimeout(() => setDebounced(filters), 350)
    return () => clearTimeout(h)
  }, [filters])
  useEffect(() => { setOffset(0) }, [debounced])

  const params = useMemo(() => {
    const p = {}
    const ev = fixedEvent !== '' && fixedEvent != null ? fixedEvent : debounced.event_type
    if (ev !== '' && ev != null) p.event_type = ev
    if (debounced.username.trim()) p.username = debounced.username.trim()
    if (debounced.q.trim()) p.q = debounced.q.trim()
    if (debounced.from) p.from = `${debounced.from} 00:00:00`
    if (debounced.to) p.to = `${debounced.to} 23:59:59`
    return p
  }, [debounced, fixedEvent])

  const fetchPage = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      // Raw axios with the runtime credential: the shared client would send the
      // /edit session token and redirect to the login page on a 401.
      const { data: d } = await axios.get('/api/trace', {
        params: { ...params, limit: pageSize, offset },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (id !== reqId.current) return
      setData({ rows: d?.rows ?? [], total: d?.total ?? 0 })
      setError('')
    } catch (e) {
      if (id !== reqId.current) return
      const st = e.response?.status
      setError(st === 401 || st === 403 ? tt('auditNoPermission') : (e.response?.data?.error ?? e.message))
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [params, pageSize, offset, token, tt])

  useEffect(() => { fetchPage() }, [fetchPage])

  useEffect(() => {
    const sec = Number(autoRefreshSec) || 0
    if (sec <= 0) return undefined
    const h = setInterval(fetchPage, Math.max(2, sec) * 1000)
    return () => clearInterval(h)
  }, [autoRefreshSec, fetchPage])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const { data: d } = await axios.get('/api/trace', {
        params: { ...params, limit: EXPORT_LIMIT, offset: 0 },
        headers: { Authorization: `Bearer ${token}` },
      })
      const lines = [cols.map((c) => csvEscape(tt(COLUMN_LABEL[c]))).join(';')]
      for (const r of d?.rows ?? []) lines.push(cols.map((c) => csvEscape(cellText(r, c, tt))).join(';'))
      // BOM so Excel opens UTF-8 correctly; ';' separator for European locales.
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      a.href = url; a.download = `audit-trail-${stamp}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(e.response?.data?.error ?? e.message)
    } finally {
      setExporting(false)
    }
  }

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const { rows, total } = data
  const first = total ? offset + 1 : 0
  const last = Math.min(offset + rows.length, total)
  const input = 'rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-700 bg-white focus:outline-none focus:border-[#1677ff] min-w-0'

  return (
    <Frame
      title={title}
      actions={<>
        {allowExport && (
          <button onClick={exportCsv} disabled={exporting || !total} title={tt('auditExport')} aria-label={tt('auditExport')}
            className="p-1 rounded text-gray-500 hover:text-[#1677ff] hover:bg-gray-100 disabled:opacity-40">
            <Download size={14} className={exporting ? 'animate-pulse' : ''} />
          </button>
        )}
        <button onClick={fetchPage} title={tt('auditRefresh')} aria-label={tt('auditRefresh')}
          className="p-1 rounded text-gray-500 hover:text-[#1677ff] hover:bg-gray-100">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </>}>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 shrink-0">
          {(fixedEvent === '' || fixedEvent == null) && (
            <select value={filters.event_type} onChange={set('event_type')} className={`${input} flex-1 basis-28`}>
              <option value="">{tt('auditAllEvents')}</option>
              {AUDIT_EVENTS.map((e) => <option key={e.code} value={e.code}>{tt(e.key)}</option>)}
            </select>
          )}
          <input value={filters.username} onChange={set('username')} placeholder={tt('auditColUser')} className={`${input} flex-1 basis-24`} />
          <div className="relative flex-[2] basis-32 min-w-0">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filters.q} onChange={set('q')} placeholder={tt('auditSearch')} className={`${input} w-full pl-6`} />
          </div>
          <label className="flex items-center gap-1 text-[10px] text-gray-400">
            {tt('auditFrom')}<input type="date" value={filters.from} onChange={set('from')} className={input} />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-gray-400">
            {tt('auditTo')}<input type="date" value={filters.to} onChange={set('to')} className={input} />
          </label>
        </div>
      )}
      {error && <div className="px-3 py-1.5 text-[11px] text-red-600 bg-red-50 border-b border-red-100 shrink-0">{error}</div>}
      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length
          ? <Table rows={rows} cols={cols} tt={tt} />
          : !loading && <div className="h-full flex items-center justify-center text-xs text-gray-400">{tt('auditEmpty')}</div>}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-500 shrink-0">
        <span>{tt('auditRange', { first, last, total })}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset((o) => Math.max(0, o - pageSize))} disabled={offset === 0} aria-label={tt('auditPrev')} title={tt('auditPrev')}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={14} /></button>
          <button onClick={() => setOffset((o) => o + pageSize)} disabled={offset + pageSize >= total} aria-label={tt('auditNext')} title={tt('auditNext')}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      </div>
    </Frame>
  )
}

export default function AuditTrailWidget({ widgetProps = {}, editor = false, auth = null, onLogin }) {
  const { lang, defaultLang } = useLanguage()
  const tt = useCallback((k, vars) => t(k, lang, defaultLang, vars), [lang, defaultLang])
  const {
    title = '', pageSize = 25, eventType = '', showFilters = true,
    autoRefreshSec = 0, allowExport = true, columns,
  } = widgetProps
  const cols = normColumns(columns)
  const heading = title || tt('auditTrail')
  const size = Math.min(500, Math.max(5, Number(pageSize) || 25))

  if (editor) return <EditorPreview title={heading} cols={cols} tt={tt} showFilters={showFilters} allowExport={allowExport} />
  if (!auth?.token || !auth?.canViewAudit) {
    return <LockedPanel title={heading} loggedIn={!!auth?.token} onLogin={onLogin} tt={tt} />
  }
  return (
    <AuditViewer
      key={auth.token /* reset filters/paging when the operator changes */}
      token={auth.token} title={heading} cols={cols} tt={tt} pageSize={size}
      fixedEvent={eventType === '' || eventType == null ? '' : Number(eventType)}
      showFilters={showFilters} autoRefreshSec={autoRefreshSec} allowExport={allowExport}
    />
  )
}
