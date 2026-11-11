import { Info, AlertTriangle, AlertOctagon, Siren } from 'lucide-react'

/**
 * Single source of truth for alarm severity graphics, shared by the cycling
 * banner widget and the runtime full-screen popup so both look identical.
 *
 * Each level has its own icon, colour scheme, label and animation intensity:
 *   info     — blue,   Info icon,          static
 *   warning  — amber,  AlertTriangle icon, static
 *   error    — orange, AlertOctagon icon,  pulsing
 *   critical — red,    Siren icon,         pulsing + flashing
 */
// `label` is an English fallback; runtime widgets resolve `key` via the i18n
// UI-string catalogue (uiStrings.js `t()`) so the label follows the active language.
export const ALARM_SEVERITY = {
  info: {
    rank: 0, Icon: Info, label: 'Info', key: 'sevInfo',
    fg: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6',
    overlay: 'rgba(30,58,138,0.92)', pulse: false, flash: false,
  },
  warning: {
    rank: 1, Icon: AlertTriangle, label: 'Warning', key: 'sevWarning',
    fg: '#a16207', bg: '#fefce8', border: '#fde68a', dot: '#eab308',
    overlay: 'rgba(120,53,15,0.93)', pulse: false, flash: false,
  },
  error: {
    rank: 2, Icon: AlertOctagon, label: 'Error', key: 'sevError',
    fg: '#c2410c', bg: '#fff7ed', border: '#fed7aa', dot: '#f97316',
    overlay: 'rgba(124,45,18,0.94)', pulse: true, flash: false,
  },
  critical: {
    rank: 3, Icon: Siren, label: 'Critical', key: 'sevCritical',
    fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444',
    overlay: 'rgba(127,29,29,0.95)', pulse: true, flash: true,
  },
}

/** Resolve a severity string to its metadata (unknown → warning). */
export const alarmSev = (s) => ALARM_SEVERITY[s] ?? ALARM_SEVERITY.warning

/** Build a { langCode: text } map from an alarm row's description_* columns. */
export function alarmDescMap(a) {
  const m = {}
  for (const k of Object.keys(a)) if (k.startsWith('description_')) m[k.slice(12)] = a[k]
  return m
}

/** Sort comparator: highest severity first, then most-recently occurred. */
export function byAlarmPriority(a, b) {
  return alarmSev(b.severity).rank - alarmSev(a.severity).rank
    || new Date(b.occurred_at || 0) - new Date(a.occurred_at || 0)
}
