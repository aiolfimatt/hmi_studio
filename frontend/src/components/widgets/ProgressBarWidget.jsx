import React from 'react'

/**
 * ProgressBarWidget — a horizontal/vertical progress ("loading") bar whose fill
 * tracks a PLC value scaled between `min` and `max`. Handy for levels, cycle
 * progress, tank fill, batch completion, etc.
 *
 * Props (widgetProps):
 *   label        — optional caption shown above the bar (translatable)
 *   plcAddress   — bound PLC value (via the scanner; K/decimals already applied)
 *   min, max     — value range mapped to 0…100 % of the bar
 *   unit         — suffix for the numeric readout (e.g. '%', 'mm', 'l')
 *   decimals     — readout rounding
 *   orientation  — 'horizontal' (fills left→right) | 'vertical' (fills bottom→up)
 *   color        — fill colour; bgColor — track colour
 *   showValue    — show the numeric/percent readout
 *   showPercent  — readout as % of range instead of the raw value
 *   fontSize     — readout / label size
 */
export default function ProgressBarWidget({ widgetProps = {}, value }) {
  const {
    label = '',
    min = 0,
    max = 100,
    unit = '',
    decimals = 0,
    orientation = 'horizontal',
    color = '#1677ff',
    bgColor = '#e5e7eb',
    showValue = true,
    showPercent = true,
    fontSize = 12,
  } = widgetProps

  const num = Number(value)
  const hasVal = value !== undefined && value !== null && value !== '' && !Number.isNaN(num)
  const lo = Number(min)
  const span = Number(max) - lo
  const pct = hasVal && span !== 0
    ? Math.min(100, Math.max(0, ((num - lo) / span) * 100))
    : 0
  const vertical = orientation === 'vertical'

  const valueText = !hasVal
    ? '—'
    : showPercent
      ? `${pct.toFixed(decimals)}%`
      : `${num.toFixed(decimals)}${unit ? ` ${unit}` : ''}`

  const fill = (
    <div
      className="rounded transition-all duration-300 ease-out"
      style={vertical
        ? { width: '100%', height: `${pct}%`, background: color }
        : { height: '100%', width: `${pct}%`, background: color }}
    />
  )

  return (
    <div className="w-full h-full flex flex-col gap-1 overflow-hidden select-none">
      {(label || (showValue && !vertical)) && (
        <div className="flex justify-between items-baseline gap-2" style={{ fontSize }}>
          <span className="text-gray-600 truncate">{label}</span>
          {showValue && !vertical && (
            <span className="text-gray-800 font-medium tabular-nums shrink-0">{valueText}</span>
          )}
        </div>
      )}
      <div
        className={`relative flex-1 min-h-0 rounded overflow-hidden ${vertical ? 'flex items-end' : ''}`}
        style={{ background: bgColor }}
      >
        {fill}
        {showValue && vertical && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize }}>
            <span
              className="font-medium tabular-nums"
              style={{ color: '#374151', textShadow: '0 0 3px rgba(255,255,255,0.9)' }}
            >
              {valueText}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
