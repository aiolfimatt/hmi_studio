import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, BellOff, Clock } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { resolveText } from '../../i18n/resolve'
import { t } from '../../i18n/uiStrings'
import { alarmSev, alarmDescMap, byAlarmPriority } from './alarmSeverity'
import AlarmPopup from './AlarmPopup'

/**
 * AlarmListPopup — a dynamic popup "page" listing every currently active alarm
 * (active message), opened when the cycling-alarms widget is clicked. Rows are
 * ordered by severity (critical → info) then recency, each carrying its own
 * severity icon/colour (see ./alarmSeverity.js) plus the machine, code,
 * multilingual description and how long it has been standing.
 *
 * Rendered through a portal on document.body so its full-screen overlay escapes
 * the scaled/transformed runtime form container (a position:fixed element is
 * otherwise clipped and scaled by a transformed ancestor).
 */

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' })
}

function elapsed(s) {
  if (!s) return ''
  const ms = Date.now() - new Date(s).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

export default function AlarmListPopup({ open, alarms = [], title = 'Active alarms', onClose }) {
  const { lang, defaultLang } = useLanguage()

  // A clicked row re-opens that alarm as the full-screen message, over the list.
  const [detail, setDetail] = useState(null)

  // Clear any open detail when the list itself closes, so it doesn't flash back
  // on the next open.
  useEffect(() => { if (!open) setDetail(null) }, [open])

  // Escape closes the detail first (if open), otherwise the whole list.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (detail) setDetail(null)
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, detail, onClose])

  if (!open) return null

  const list = (Array.isArray(alarms) ? alarms : []).slice().sort(byAlarmPriority)

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[80vh] rounded-lg bg-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
            {title}
            <span className="inline-flex items-center justify-center min-w-[1.5rem] px-2 h-6 rounded-full bg-gray-200 text-gray-700 text-xs font-bold tabular-nums">
              {list.length}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <BellOff size={36} className="text-gray-300" />
              <p className="text-sm text-emerald-600 font-medium">{t('noActiveAlarms', lang, defaultLang)}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map(a => {
                const meta = alarmSev(a.severity)
                const Icon = meta.Icon
                const desc = resolveText(alarmDescMap(a), lang, defaultLang)
                  || a.description || `Alarm ${a.alarm_code}`
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:brightness-95 transition-[filter]"
                    style={{ background: meta.bg }}
                    onClick={() => setDetail(a)}
                    title={t('showActiveAlarms', lang, defaultLang)}
                  >
                    <Icon size={22} className="shrink-0" style={{ color: meta.fg }} />
                    <span
                      className="shrink-0 font-mono font-bold px-2 py-0.5 rounded text-xs"
                      style={{ background: meta.fg, color: '#fff' }}
                    >
                      {a.alarm_code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate" title={desc}>{desc}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                        <span className="uppercase tracking-wide" style={{ color: meta.fg }}>{t(meta.key, lang, defaultLang)}</span>
                        {a.occurred_at && (
                          <span className="flex items-center gap-1">
                            <Clock size={10} />{fmtDate(a.occurred_at)}
                            <span className="opacity-70">({elapsed(a.occurred_at)})</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
    {/* Full-screen detail — re-opens a single alarm as the big message */}
    <AlarmPopup alarm={detail} lang={lang} defaultLang={defaultLang} onClose={() => setDetail(null)} />
    </>,
    document.body
  )
}
