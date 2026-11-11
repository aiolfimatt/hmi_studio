import React, { useState, useEffect, useMemo } from 'react'
import { BellOff } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { resolveText } from '../../i18n/resolve'
import { t, isUiString } from '../../i18n/uiStrings'
import { alarmSev, alarmDescMap, byAlarmPriority } from './alarmSeverity'
import AlarmListPopup from './AlarmListPopup'

/**
 * CyclingAlarmsWidget — a single-row banner that cycles through the currently
 * active alarms, showing the alarm code + multilingual description. Alarms are
 * ordered by severity (critical → info) so the most important one is shown
 * first, and each severity gets its own icon, colour and animation (error
 * pulses, critical flashes) — see ./alarmSeverity.js.
 *
 * Data is supplied by the runtime (MonitorPage) via the `alarms` prop — active
 * alarm_history rows joined with their definition (description_* + severity).
 * In the editor `alarms` is undefined, so a static sample row is shown.
 */

const SAMPLE = [
  { id: '_s', alarm_code: 12, severity: 'critical', description_it: 'Sample alarm', occurred_at: null },
]

// Motion cue per severity: flash (critical) → pulse (error) → still.
function anim(meta) {
  if (meta.flash) return 'animate-alarm-flash'
  if (meta.pulse) return 'animate-pulse'
  return ''
}

export default function CyclingAlarmsWidget({ widgetProps = {}, alarms }) {
  const { lang, defaultLang } = useLanguage()
  const {
    cycleInterval = 3000,
    fontSize = 15,
    showCode = true,
    emptyText,
    popupTitle,
  } = widgetProps

  // Designer may override these; blank OR a leftover built-in default (in any
  // language) falls back to the localized UI string that follows the active language.
  const emptyLabel = (!emptyText || isUiString('noActiveAlarms', emptyText))
    ? t('noActiveAlarms', lang, defaultLang) : emptyText
  const popupLabel = (!popupTitle || isUiString('activeAlarms', popupTitle))
    ? t('activeAlarms', lang, defaultLang) : popupTitle
  const showAlarmsHint = t('showActiveAlarms', lang, defaultLang)

  const isPreview = alarms === undefined

  // Clicking the banner at runtime opens a popup listing all active messages.
  const [popupOpen, setPopupOpen] = useState(false)
  const openPopup = isPreview ? undefined : () => setPopupOpen(true)

  // Sort by severity (desc) and recency (desc).
  const list = useMemo(() => {
    const l = isPreview ? SAMPLE : (Array.isArray(alarms) ? alarms : [])
    return l.slice().sort(byAlarmPriority)
  }, [alarms, isPreview])

  const [idx, setIdx] = useState(0)

  // Reset the cursor whenever the set of alarms changes size.
  useEffect(() => { setIdx(0) }, [list.length])

  // Advance the cursor on the configured interval (only when >1 alarm). Paused
  // while the popup is open so the banner behind the modal stops cycling/flashing
  // through the overlay (avoids a flicker "glitch" while the operator reads it).
  useEffect(() => {
    if (list.length <= 1 || popupOpen) return
    const timer = setInterval(
      () => setIdx(i => (i + 1) % list.length),
      Math.max(800, Number(cycleInterval) || 3000)
    )
    return () => clearInterval(timer)
  }, [list.length, cycleInterval, popupOpen])

  if (!list.length) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center gap-2 rounded ${openPopup ? 'cursor-pointer' : ''}`}
        style={{ background: '#f8fafc', border: '1px solid #e5e7eb', color: '#94a3b8', fontSize }}
        onClick={openPopup}
        title={openPopup ? showAlarmsHint : undefined}
      >
        <BellOff size={Math.round(fontSize * 1.1)} />
        <span className="truncate">{emptyLabel}</span>
        <AlarmListPopup open={popupOpen} alarms={list} title={popupLabel} onClose={() => setPopupOpen(false)} />
      </div>
    )
  }

  const a = list[Math.min(idx, list.length - 1)]
  const meta = alarmSev(a.severity)
  const Icon = meta.Icon
  const desc = resolveText(alarmDescMap(a), lang, defaultLang) || a.description || `Alarm ${a.alarm_code}`

  return (
    <div
      key={a.id}
      className={`w-full h-full flex items-center gap-2 px-3 rounded overflow-hidden animate-fade-in ${openPopup ? 'cursor-pointer' : ''}`}
      style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.fg, fontSize }}
      title={openPopup ? showAlarmsHint : `${t(meta.key, lang, defaultLang)} — ${desc}`}
      onClick={openPopup}
    >
      <Icon size={Math.round(fontSize * 1.35)} className={`shrink-0 ${anim(meta)}`} />
      {showCode && (
        <span className="shrink-0 font-mono font-bold px-1.5 py-0.5 rounded"
          style={{ background: meta.fg, color: meta.bg, fontSize: Math.round(fontSize * 0.8) }}>
          {a.alarm_code}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate font-medium">{desc}</span>
      {list.length > 1 && (
        <span className="shrink-0 tabular-nums opacity-60" style={{ fontSize: Math.round(fontSize * 0.75) }}>
          {idx + 1}/{list.length}
        </span>
      )}
      <AlarmListPopup open={popupOpen} alarms={list} title={popupLabel} onClose={() => setPopupOpen(false)} />
    </div>
  )
}
