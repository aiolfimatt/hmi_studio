import React, { useState, useEffect } from 'react'

// Render the current date/time for a date-time label. Presets use the browser
// locale; 'custom' expands a token pattern (YYYY MM DD HH mm ss).
function pad(n) { return String(n).padStart(2, '0') }
function formatDateTime(now, format, custom) {
  switch (format) {
    case 'date':       return now.toLocaleDateString()
    case 'time':       return now.toLocaleTimeString()
    case 'time_short': return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case 'custom':
      return String(custom || '')
        .replace(/YYYY/g, now.getFullYear())
        .replace(/MM/g, pad(now.getMonth() + 1))
        .replace(/DD/g, pad(now.getDate()))
        .replace(/HH/g, pad(now.getHours()))
        .replace(/mm/g, pad(now.getMinutes()))
        .replace(/ss/g, pad(now.getSeconds()))
    case 'datetime':
    default:           return now.toLocaleString()
  }
}

// Format the logged operator for a 'session'-source label.
function sessionText(session, field) {
  const user = (session?.username || '').trim()
  const group = (session?.groupName || '').trim()
  switch (field) {
    case 'name':  return user
    case 'group': return group
    default:      return group ? (user ? `${user} (${group})` : group) : user
  }
}

/**
 * LabelWidget — static or dynamic text label
 * Props:
 *   widgetProps: { text, fontSize, color, bold, align, bgColor, border,
 *                  borderColor, borderWidth, plcAddress, source, sessionField }
 *   value:   optional PLC value to display instead of / alongside text
 *   session: { username, groupName } — current runtime operator (source='session')
 *   editor:  true on the designer canvas (shows a sample for 'session')
 */
export default function LabelWidget({ widgetProps = {}, value, session, editor = false }) {
  const {
    text = '',
    fontSize = 14,
    color = '#1f2937',
    bold = false,
    align = 'left',
    bgColor = '',
    border = false,
    borderColor = '#64748b',
    borderWidth = 1,
    unit = '',
    plcAddress,
    source,
    sessionField = 'name_group',
    datetime = false,
    datetimeFormat = 'datetime',
    datetimeCustom = '',
  } = widgetProps

  // Live clock — only ticks while this label is in date-time mode. The hooks run
  // unconditionally (the effect simply no-ops otherwise) to keep hook order stable.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!datetime) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [datetime])

  let displayText
  if (datetime) {
    // Date-time mode takes precedence over the static text and any live binding.
    displayText = formatDateTime(now, datetimeFormat, datetimeCustom)
  } else if (source === 'session') {
    // Designer canvas has no live session — show a representative sample so the
    // layout is visible. At runtime show the logged operator, falling back to the
    // static Text (use it as a "not logged in" placeholder) when none is held.
    displayText = editor
      ? sessionText({ username: 'User', groupName: 'Group' }, sessionField)
      : (sessionText(session, sessionField) || text)
  } else {
    // A bound label (PLC address) shows the live value once one has arrived;
    // otherwise it falls back to the static Text.
    displayText = value !== undefined && value !== null
      ? String(value)
      : text
  }

  // Optional static background colour (blank = transparent).
  const bg = bgColor || undefined

  return (
    <div
      className="w-full h-full flex items-center overflow-hidden select-none"
      style={{
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        background: bg,
        border: border ? `${borderWidth || 1}px solid ${borderColor || '#64748b'}` : undefined,
        borderRadius: border ? 3 : undefined,
      }}
    >
      <span
        style={{
          fontSize: `${fontSize}px`,
          color: color || '#1f2937',
          fontWeight: bold ? 700 : 400,
          textAlign: align,
          lineHeight: 1.2,
          letterSpacing: '0.01em',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {displayText}
        {/* Optional unit suffix — meaningful for value-bound labels; never shown
            for the operator-name 'session' source. */}
        {unit && source !== 'session' && !datetime && (
          <span style={{ opacity: 0.7, marginLeft: '0.25em', fontSize: '0.85em' }}>{unit}</span>
        )}
      </span>
    </div>
  )
}
