import React from 'react'
import { ArrowRight, Zap } from 'lucide-react'
import { useWidgetEvent } from './widgetEvents'

/**
 * EventBoxWidget — clickable area that runs a widget event (navigate / write /
 * script / …), using the shared useWidgetEvent model so it supports the same
 * events, condition gate and effect flag as the button.
 * Props:
 *   widgetProps: { label, plcAddress, onClick, targetPage, writeAddress, writeValue, … }
 *   value: optional — current PLC value for display / navigate-if
 *   onWrite / onSession / runtimeApi / requestAccess — event plumbing
 *   readOnly: boolean
 */
export default function EventBoxWidget({ widgetProps = {}, value, onWrite, onSession, runtimeApi, session, readOnly = false, editor = false, requestAccess }) {
  const {
    label        = '',
    onClick      = 'navigate',
    targetPage   = '',
    writeAddress = '',
    writeValue   = '',
  } = widgetProps

  const handlers = useWidgetEvent({ widgetProps, onWrite, onSession, runtimeApi, requestAccess, readOnly, value, loggedIn: !!session?.username })

  const isNav   = onClick === 'navigate' || onClick === 'return'
  const Icon    = isNav ? ArrowRight : Zap

  // Runtime: an event_box is an INVISIBLE click region (matches the legacy
  // monitor's eventbox — a transparent hotspot over a background image). Only
  // the editor canvas renders the visible box + arrow so designers can find it.
  if (!editor) {
    return (
      <button
        {...handlers}
        disabled={readOnly}
        title={
          readOnly
            ? 'Insufficient permission level'
            : isNav
              ? `Navigate to ${targetPage || '(not set)'}`
              : `Write ${writeValue} → ${writeAddress || '(not set)'}`
        }
        className={[
          'w-full h-full flex items-center justify-center gap-2',
          'bg-transparent border-0 select-none transition-colors duration-100',
          readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-black/5 active:bg-black/10',
        ].join(' ')}
      >
        {label && (
          <span className="font-medium text-sm tracking-wide text-[#1677ff]">{label}</span>
        )}
      </button>
    )
  }

  // Editor preview — the canvas wrapper is pointer-events-none, so this button is
  // non-interactive here (clicks select the widget instead); no onClick needed.
  return (
    <button
      disabled={readOnly}
      title={
        readOnly
          ? 'Insufficient permission level'
          : isNav
            ? `Navigate to ${targetPage || '(not set)'}`
            : `Write ${writeValue} → ${writeAddress || '(not set)'}`
      }
      className={[
        'w-full h-full flex items-center justify-center gap-2 rounded border border-dashed',
        'font-medium text-sm tracking-wide transition-all duration-100 select-none',
        'bg-gray-50/60 border-gray-300',
        readOnly
          ? 'cursor-default opacity-70'
          : isNav
            ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-300 active:scale-[0.98] group'
            : 'cursor-pointer hover:bg-amber-50 hover:border-amber-300 active:scale-[0.98] group',
      ].join(' ')}
    >
      <Icon
        size={13}
        className={[
          'shrink-0 transition-transform duration-150',
          readOnly ? 'text-gray-400' : isNav ? 'text-[#1677ff] group-hover:translate-x-0.5' : 'text-amber-500',
        ].join(' ')}
      />
      {label && (
        <span className={readOnly ? 'text-gray-500' : isNav ? 'text-[#1677ff]' : 'text-amber-600'}>
          {label}
        </span>
      )}
    </button>
  )
}
