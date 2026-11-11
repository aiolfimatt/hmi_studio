import React from 'react'

/**
 * BoxWidget — rectangle / frame (legacy `box`).
 * Props:
 *   widgetProps: { borderColor, fillColor, borderWidth, borderRadius }
 */
export default function BoxWidget({ widgetProps = {} }) {
  const {
    borderColor  = '#475569',
    fillColor    = 'transparent',
    borderWidth  = 1,
    borderRadius = 4,
  } = widgetProps

  return (
    <div
      className="w-full h-full"
      style={{
        border:       `${borderWidth}px solid ${borderColor}`,
        background:    fillColor || 'transparent',
        borderRadius:  `${borderRadius}px`,
        boxSizing:     'border-box',
      }}
    />
  )
}
