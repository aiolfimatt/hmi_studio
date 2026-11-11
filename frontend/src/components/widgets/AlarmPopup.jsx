import React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { resolveText } from '../../i18n/resolve'
import { t } from '../../i18n/uiStrings'
import { alarmSev, alarmDescMap } from './alarmSeverity'

/**
 * AlarmPopup — full-screen alert for a single alarm. Each severity has its own
 * icon, colour, label and animation (see ./alarmSeverity.js): error pulses,
 * critical flashes with a pinging halo. Closable.
 *
 * Shown automatically by MonitorPage when an alarm triggers, and re-opened on
 * demand from AlarmListPopup when the operator clicks a row. Rendered through a
 * portal on document.body so its overlay escapes the scaled runtime container.
 */
export default function AlarmPopup({ alarm, lang, defaultLang, onClose }) {
  if (!alarm) return null
  const meta = alarmSev(alarm.severity)
  const Icon = meta.Icon
  const iconAnim = meta.flash ? 'animate-alarm-flash' : meta.pulse ? 'animate-pulse' : ''
  const desc = resolveText(alarmDescMap(alarm), lang, defaultLang) || alarm.description || `Alarm ${alarm.alarm_code}`
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center animate-fade-in"
      style={{ background: meta.overlay }}
      onClick={onClose}
    >
      <div className="relative flex flex-col items-center text-center px-8" onClick={e => e.stopPropagation()}>
        <div className="relative">
          {meta.flash && <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" />}
          <Icon size={104} color="#ffffff" strokeWidth={1.5} className={`relative drop-shadow ${iconAnim}`} />
        </div>
        <div className="mt-6 text-white/85 uppercase tracking-[0.35em] text-lg sm:text-2xl font-semibold">{t(meta.key, lang, defaultLang)}</div>
        <div className="mt-2 font-mono font-bold text-white text-5xl sm:text-7xl leading-none">{alarm.alarm_code}</div>
        <div className="mt-6 text-white text-xl sm:text-3xl font-medium max-w-3xl break-words">{desc}</div>
        <button
          onClick={onClose}
          className="mt-12 inline-flex items-center gap-2 px-10 py-3 rounded-full bg-white text-gray-900 text-lg font-semibold shadow-xl hover:bg-gray-100 transition-colors"
        >
          <X size={20} /> {t('close', lang, defaultLang)}
        </button>
      </div>
    </div>,
    document.body
  )
}
