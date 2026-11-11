import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { t } from '../../i18n/uiStrings'

/**
 * ScriptRunPopup — the waiting / result dialog for a button's "execute script"
 * action. Driven by MonitorPage's `scriptRun` state:
 *
 *   { runId, name, status: 'running'|'aborting'|'ok'|'error'|'aborted',
 *     message, logs }
 *
 * While the script runs it shows a spinner and an Abort button; when the backend
 * reports the outcome it switches to a success / error / aborted result with the
 * script's message and any collected log lines. Closing is only offered once the
 * run has finished (while running, the operator aborts or waits).
 *
 * Rendered through a portal on document.body so the full-screen overlay escapes
 * the scaled/transformed runtime form container.
 */

const VISUALS = {
  running:  { Icon: Loader2,      spin: true,  color: '#1677ff', ring: 'bg-blue-50',    titleKey: 'scriptRunningTitle' },
  aborting: { Icon: Loader2,      spin: true,  color: '#d97706', ring: 'bg-amber-50',   titleKey: 'scriptRunningTitle' },
  ok:       { Icon: CheckCircle2, spin: false, color: '#16a34a', ring: 'bg-emerald-50', titleKey: 'scriptOkTitle' },
  error:    { Icon: XCircle,      spin: false, color: '#dc2626', ring: 'bg-red-50',      titleKey: 'scriptErrorTitle' },
  aborted:  { Icon: Ban,         spin: false, color: '#d97706', ring: 'bg-amber-50',    titleKey: 'scriptAbortedTitle' },
}

// Default body text per terminal status when the script supplies no message.
const DEFAULT_MSG_KEY = { ok: 'scriptOkMsg', error: 'scriptErrorMsg', aborted: 'scriptAbortedMsg' }

export default function ScriptRunPopup({ run, onAbort, onClose }) {
  const { lang, defaultLang } = useLanguage()
  const tt = (k, vars) => t(k, lang, defaultLang, vars)

  const status = run?.status
  const busy = status === 'running' || status === 'aborting'

  // Escape closes only once finished (a running script must be aborted or awaited).
  useEffect(() => {
    if (!run || busy) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run, busy, onClose])

  if (!run) return null

  const v = VISUALS[status] || VISUALS.running
  const { Icon } = v
  const body = status === 'running' || status === 'aborting'
    ? tt('scriptRunningMsg', { name: run.name })
    : (run.message || tt(DEFAULT_MSG_KEY[status] || 'scriptOkMsg'))
  const logs = Array.isArray(run.logs) ? run.logs : []

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-md rounded-lg bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / status */}
        <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-5 text-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${v.ring}`}>
            <Icon size={30} style={{ color: v.color }} className={v.spin ? 'animate-spin' : ''} />
          </div>
          <h2 className="text-base font-semibold text-gray-800">{tt(v.titleKey)}</h2>
          <p className="max-w-full break-words text-sm text-gray-500">{body}</p>
          <p className="font-mono text-[11px] text-gray-400 truncate max-w-full">{run.name}</p>
        </div>

        {/* Collected log / progress lines */}
        {logs.length > 0 && (
          <div className="px-6 pb-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{tt('scriptLogs')}</div>
            <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-2 text-left text-[11px] leading-snug text-gray-600 whitespace-pre-wrap break-words">
              {logs.join('\n')}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
          {busy ? (
            <button
              onClick={() => onAbort?.(run.runId)}
              disabled={status === 'aborting'}
              className="rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60 disabled:cursor-default"
            >
              {status === 'aborting' ? tt('scriptAborting') : tt('scriptAbort')}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded bg-[#1677ff] px-4 py-1.5 text-sm font-medium text-white hover:brightness-110"
            >
              {tt('close')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
