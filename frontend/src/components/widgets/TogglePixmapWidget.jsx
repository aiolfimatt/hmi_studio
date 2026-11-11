import React from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useWidgetEvent } from './widgetEvents'

/**
 * TogglePixmapWidget — multistate image (legacy `to_pixmap`).
 * Shows one of up to 4 images depending on the PLC value.
 *
 * Props:
 *   widgetProps: {
 *     file1, file2, file3, file4,        // image URLs per state
 *     stateMode,                          // 'bool' (file1/file2) | 'multi' (file1..file4 by index)
 *     value2, value3, value4,             // values that map to file2/file3/file4 in 'multi' mode
 *     sensible,                           // if true, clickable (uses event model)
 *     onClick, targetPage, writeAddress, writeValue, widgetLevel
 *   }
 *   value: PLC value, onWrite, readOnly
 */
export default function TogglePixmapWidget({ widgetProps = {}, value, onWrite, onSession, runtimeApi, requestAccess, readOnly = false, session }) {
  const {
    file1     = '',
    file2     = '',
    file3     = '',
    file4     = '',
    stateMode = 'bool',
    value2    = 1,
    value3    = 2,
    value4    = 3,
    sensible  = false,
  } = widgetProps

  const handlers = useWidgetEvent({ widgetProps, onWrite, onSession, runtimeApi, requestAccess, readOnly, value, loggedIn: !!session?.username })

  // Resolve which image to show
  const src = (() => {
    if (stateMode === 'bool') {
      return Boolean(value) ? (file2 || file1) : file1
    }
    // multi: match value against the configured state values
    const v = Number(value)
    if (v === Number(value4) && file4) return file4
    if (v === Number(value3) && file3) return file3
    if (v === Number(value2) && file2) return file2
    return file1
  })()

  const clickable = sensible && !readOnly
  const Wrapper = clickable ? 'button' : 'div'

  if (!file1 && !file2 && !file3 && !file4) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded">
        <ImageIcon size={18} className="text-gray-400" />
        <span className="text-[9px] text-gray-400 font-mono">No images</span>
      </div>
    )
  }

  return (
    <Wrapper
      {...(clickable ? handlers : {})}
      className={[
        'w-full h-full overflow-hidden flex items-center justify-center bg-transparent border-0 p-0',
        clickable ? 'cursor-pointer active:scale-[0.97] transition-transform' : '',
      ].join(' ')}
    >
      {src
        ? <img src={src} alt="" className="w-full h-full object-contain" draggable={false} />
        : <div className="w-full h-full flex items-center justify-center">
            <span className="text-[9px] text-gray-400 font-mono">state {String(value)}</span>
          </div>
      }
    </Wrapper>
  )
}
