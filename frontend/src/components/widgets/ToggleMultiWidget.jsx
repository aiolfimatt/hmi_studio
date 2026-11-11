import React from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { resolveText } from '../../i18n/resolve'

/**
 * ToggleMultiWidget — multi-state cycling toggle.
 *
 * A single button that steps through a configured list of options on each click,
 * writing that option's value to the linked variable (defaults 1, 2, 3, …). The
 * currently-shown option is the one whose value matches the live PLC value, so
 * the button always reflects the real machine state.
 *
 * Props:
 *   widgetProps: {
 *     label,                       // optional caption shown above the button
 *     options: [{ label, value, color }],   // ordered states to cycle through
 *     color,                       // default active colour (per-option color wins)
 *     fontSize,
 *   }
 *   value:   current PLC value (selects the active option)
 *   onWrite: (nextValue) => void
 *   readOnly
 */
export default function ToggleMultiWidget({ widgetProps = {}, value, onWrite, readOnly = false }) {
  const { lang, defaultLang } = useLanguage()
  const {
    label    = '',
    options  = [],
    color    = '#1677ff',
    fontSize = 13,
    readOnly: lockRead = false,   // designer-configured display-only mode
  } = widgetProps

  // Locked when either the permission layer or the widget config forbids writes.
  const locked = readOnly || lockRead

  // Keep only usable options and resolve each label for the active language.
  const opts = (Array.isArray(options) ? options : []).map((o, i) => ({
    label: resolveText(o?.label, lang, defaultLang),
    value: Number(o?.value ?? i + 1),
    color: o?.color || '',
  }))

  // Which option is active? The one whose value equals the current PLC value.
  const currentIndex = opts.findIndex((o) => o.value === Number(value))
  const active = currentIndex >= 0 ? opts[currentIndex] : null
  const activeColor = active?.color || color

  const handleClick = () => {
    if (locked || !opts.length) return
    // Advance to the next option (wrapping around); an unmatched value starts
    // the cycle at the first option.
    const next = currentIndex < 0 ? 0 : (currentIndex + 1) % opts.length
    onWrite?.(opts[next].value)
  }

  if (!opts.length) {
    return (
      <div className="w-full h-full flex items-center justify-center border border-dashed border-gray-300 rounded">
        <span className="text-[9px] text-gray-400 font-mono">No options</span>
      </div>
    )
  }

  const bgStyle = active
    ? { backgroundColor: `${activeColor}22`, borderColor: `${activeColor}80` }
    : { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 truncate leading-none select-none">
          {label}
        </span>
      )}

      <button
        onClick={handleClick}
        disabled={locked}
        title={locked ? (readOnly ? 'Insufficient permission level' : 'Read-only') : 'Click to switch state'}
        style={bgStyle}
        className={[
          'w-full flex-1 min-h-0 flex flex-col items-center justify-center gap-1 rounded border',
          'font-semibold tracking-wide transition-all duration-150 select-none overflow-hidden px-2',
          locked ? 'cursor-default' : 'cursor-pointer active:scale-[0.97]',
        ].join(' ')}
      >
        <span className="truncate max-w-full" style={{ color: activeColor, fontSize: `${fontSize}px` }}>
          {active ? active.label : (label || String(value ?? '—'))}
        </span>

        {/* Step indicators — one dot per option, the active one filled. */}
        {opts.length > 1 && (
          <span className="flex items-center gap-1 shrink-0">
            {opts.map((o, i) => (
              <span
                key={i}
                className="rounded-full transition-all duration-150"
                style={{
                  width: i === currentIndex ? 7 : 5,
                  height: i === currentIndex ? 7 : 5,
                  backgroundColor: i === currentIndex ? activeColor : '#cbd5e1',
                }}
              />
            ))}
          </span>
        )}
      </button>
    </div>
  )
}
