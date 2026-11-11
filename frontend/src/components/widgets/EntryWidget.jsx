import React, { useState } from 'react'
import { Pencil } from 'lucide-react'
import ValueEntryDialog from './ValueEntryDialog'
import { isGroupProtected } from '../../utils/access'

/**
 * EntryWidget — displays a PLC value, allows editing with validation
 * Props:
 *   widgetProps: { label, plcAddress, dataType, unit, decimals, limitMin, limitMax, widgetLevel, widgetLabel }
 *   (legacy min/max are still honoured as a fallback for pages saved before the unified variable model)
 *   value: current PLC value (number | string | null)
 *   onWrite(newValue): callback to write new value
 *   readOnly: boolean — disable editing when user level < widgetLevel
 *   requestAccess(need): optional async gate — resolves true once the operator
 *     holds a credential of level ≥ need (shows the login prompt first otherwise),
 *     false if they cancel. When omitted (e.g. editor preview) editing is open.
 */
export default function EntryWidget({ widgetProps = {}, value, onWrite, readOnly = false, requestAccess }) {
  const {
    label = '',
    unit = '',
    decimals = 0,
    dataType = 'REAL',
  } = widgetProps
  // Unified variable model uses limitMin/limitMax; fall back to legacy min/max.
  const min = widgetProps.limitMin ?? widgetProps.min
  const max = widgetProps.limitMax ?? widgetProps.max

  const [editing, setEditing] = useState(false)

  // Format displayed value
  const formatted = (() => {
    if (value === undefined || value === null) return '—'
    const num = parseFloat(value)
    if (!isNaN(num) && decimals >= 0) return num.toFixed(decimals)
    return String(value)
  })()

  // Gate BEFORE opening the editor: if this parameter is tagged with an edit
  // group the operator isn't in, show the login prompt first — don't let them
  // type a value they won't be allowed to commit.
  const startEdit = async () => {
    if (readOnly) return
    const need = widgetProps?.editGroup ?? null
    if (isGroupProtected(need) && requestAccess) {
      const ok = await requestAccess(need)
      if (!ok) return
    }
    setEditing(true)
  }

  const validate = (raw) => {
    const isBool = dataType === 'BOOL'
    const isStr  = dataType === 'STRING'

    if (isBool) {
      const v = raw.trim().toLowerCase()
      if (v !== '0' && v !== '1' && v !== 'true' && v !== 'false')
        return 'Enter 0, 1, true or false'
      return null
    }
    if (!isStr) {
      const num = Number(raw)
      if (isNaN(num)) return 'Must be a number'
      if (min !== '' && min !== undefined && min !== null && num < Number(min))
        return `Min: ${min}`
      if (max !== '' && max !== undefined && max !== null && num > Number(max))
        return `Max: ${max}`
    }
    return null
  }

  // Commit from the popup dialog: the draft is already validated by the dialog
  // (it ran `validate`), so here we only coerce to the PLC type and write,
  // forwarding the operator comment to the audit trace.
  const commit = ({ value: draft, comment }) => {
    const coerced = (() => {
      if (dataType === 'BOOL') {
        const v = draft.trim().toLowerCase()
        return v === '1' || v === 'true'
      }
      if (dataType === 'STRING') return draft
      return Number(draft)
    })()
    onWrite?.(coerced, undefined, { comment })
    setEditing(false)
  }

  const hasRange = (min !== '' && min !== undefined && min !== null)
                || (max !== '' && max !== undefined && max !== null)

  return (
    <div className="w-full h-full flex flex-col justify-center gap-0.5 px-0.5">
      {/* Label */}
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 truncate leading-none">
          {label}
        </span>
      )}

      {/* Value box — click opens a centered popup editor (no page resize) */}
      <button
        onClick={startEdit}
        disabled={readOnly}
        title={readOnly ? 'Insufficient permission level' : 'Click to edit'}
        className={[
          'flex items-center justify-between gap-1 w-full px-2 py-1 rounded',
          'bg-gray-50 border border-gray-300 text-left',
          'transition-colors duration-100',
          readOnly
            ? 'cursor-default opacity-75'
            : 'hover:border-[#1677ff] hover:bg-gray-100 cursor-text group'
        ].join(' ')}
      >
        <span className="font-mono text-sm text-gray-800 truncate leading-tight">
          {formatted}
        </span>
        {!readOnly && (
          <Pencil size={9} className="shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      <ValueEntryDialog
        open={editing}
        label={label}
        unit={unit}
        dataType={dataType}
        currentValue={value}
        min={min}
        max={max}
        validate={validate}
        requireComment={!!widgetProps.requireComment}
        onCancel={() => setEditing(false)}
        onConfirm={commit}
      />

      {/* Unit — shown just below the value box */}
      {unit && (
        <span className="text-[10px] text-gray-500 leading-none">{unit}</span>
      )}

      {/* Range hint */}
      {hasRange && (
        <span className="text-[9px] text-gray-400 leading-none">
          {min !== '' && min !== undefined ? `${min}` : ''}
          {min !== '' && min !== undefined && max !== '' && max !== undefined ? ' – ' : ''}
          {max !== '' && max !== undefined ? `${max}` : ''}
        </span>
      )}
    </div>
  )
}
