import React from 'react'

/**
 * ToggleButtonWidget — boolean toggle with configurable on/off appearance
 * Props:
 *   widgetProps: { label, labelOn, labelOff, colorOn, colorOff, widgetLevel }
 *   value: boolean | 0 | 1
 *   onWrite(newValue): callback
 *   readOnly: boolean
 */
export default function ToggleButtonWidget({ widgetProps = {}, value, onWrite, readOnly = false }) {
  const {
    label    = '',
    labelOn  = 'ON',
    labelOff = 'OFF',
    colorOn  = '#22c55e',
    colorOff = '#ef4444',
    readOnly: lockRead = false,   // designer-configured display-only mode
  } = widgetProps

  // Locked when either the permission layer or the widget config forbids writes.
  const locked = readOnly || lockRead
  const isOn = Boolean(value)

  const handleClick = () => {
    if (locked) return
    onWrite?.(!isOn)
  }

  const activeColor = isOn ? colorOn : colorOff
  // Derive a muted background from the active color by appending low-alpha hex
  const bgStyle = isOn
    ? { backgroundColor: `${colorOn}22`, borderColor: `${colorOn}80` }
    : { backgroundColor: `${colorOff}18`, borderColor: `${colorOff}50` }

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
        title={locked ? (readOnly ? 'Insufficient permission level' : 'Read-only') : (isOn ? 'Click to turn OFF' : 'Click to turn ON')}
        style={bgStyle}
        className={[
          'w-full flex-1 flex items-center justify-center gap-2 rounded border',
          'font-semibold text-sm tracking-wider uppercase transition-all duration-150 select-none',
          locked ? 'cursor-default' : 'cursor-pointer active:scale-[0.97]',
        ].join(' ')}
      >
        {/* Indicator dot */}
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-200"
          style={{
            backgroundColor: activeColor,
            boxShadow: isOn ? `0 0 8px 2px ${colorOn}60` : 'none',
          }}
        />
        <span style={{ color: activeColor }}>
          {isOn ? labelOn : labelOff}
        </span>
      </button>
    </div>
  )
}
