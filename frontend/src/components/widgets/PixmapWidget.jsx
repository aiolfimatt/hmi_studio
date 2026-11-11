import React from 'react'
import { Image as ImageIcon } from 'lucide-react'

/**
 * PixmapWidget — image display with optional conditional visibility
 * Props:
 *   widgetProps: { src, alt, showWhen, plcAddress }
 *   value: PLC boolean value (used when showWhen !== 'none')
 */
export default function PixmapWidget({ widgetProps = {}, value }) {
  const {
    src      = '',
    alt      = '',
    showWhen = 'none',
  } = widgetProps

  // Visibility logic
  const visible = (() => {
    if (showWhen === 'none') return true
    const boolVal = Boolean(value)
    if (showWhen === 'true')  return boolVal
    if (showWhen === 'false') return !boolVal
    return true
  })()

  if (!visible) return null

  if (!src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded">
        <ImageIcon size={18} className="text-gray-400" />
        <span className="text-[9px] text-gray-400 font-mono">No image</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-hidden flex items-center justify-center">
      <img
        src={src}
        alt={alt || ''}
        className="w-full h-full object-contain"
        draggable={false}
        onError={e => {
          e.currentTarget.style.display = 'none'
          if (e.currentTarget.parentElement) {
            e.currentTarget.parentElement.innerHTML =
              `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:1px dashed #d1d5db;border-radius:2px">
                <span style="font-size:9px;color:#9ca3af;font-family:monospace">Image error</span>
              </div>`
          }
        }}
      />
    </div>
  )
}
