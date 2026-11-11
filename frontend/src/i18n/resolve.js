/**
 * Multilingual text resolution for HMI widget props.
 *
 * A translatable prop is stored as EITHER:
 *   - a plain string  → language-agnostic (legacy pages, and any text the
 *     designer never translated); shown identically in every language, or
 *   - an object { it: '…', en: '…', … } → per-language variants.
 *
 * resolveText() collapses both to a display string for the active language,
 * falling back to the default language, then the first non-empty translation.
 * This keeps every existing page working untouched.
 */
export function resolveText(value, lang, defaultLang = 'it') {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return (
      value[lang] ||
      value[defaultLang] ||
      Object.values(value).find((v) => v) ||
      ''
    )
  }
  return String(value)
}

// Which text props are translatable, per widget type. Everything else (colors,
// addresses, numbers) is language-agnostic and passes through unchanged.
export const TRANSLATABLE_PROPS = {
  label:         ['text'],
  entry:         ['label'],
  graph:         ['label'],
  progress_bar:  ['label'],
  io:            ['label'],
  button:        ['label', 'labelLoggedIn'],
  toggle_button: ['label', 'labelOn', 'labelOff'],
  // toggle_multi: the caption is resolved here; the per-option labels (an array)
  // are resolved inside ToggleMultiWidget, which the array-unaware resolver skips.
  toggle_multi:  ['label'],
  event_box:     ['label'],
}

// Return a shallow copy of `wp` with this widget type's translatable props
// resolved to plain strings for `lang`. Widget components stay language-unaware.
export function resolveWidgetProps(type, wp = {}, lang, defaultLang = 'it') {
  const keys = TRANSLATABLE_PROPS[type]
  if (!keys) return wp
  const out = { ...wp }
  for (const k of keys) {
    if (k in out) out[k] = resolveText(out[k], lang, defaultLang)
  }
  return out
}

// Editor helper: coerce a translatable prop value into a { code: text } map so
// per-language fields can bind to it. A legacy plain string seeds the default
// language slot; empty/undefined yields an empty map.
export function toLangMap(value, defaultLang = 'it') {
  if (value == null || value === '') return {}
  if (typeof value === 'object') return { ...value }
  return { [defaultLang]: String(value) }
}
