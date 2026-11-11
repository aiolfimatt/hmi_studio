import React, { useState } from 'react'
import { Table2, Pencil } from 'lucide-react'
import ValueEntryDialog from './ValueEntryDialog'
import { isGroupProtected } from '../../utils/access'

/**
 * GridWidget — multi-column data grid (legacy `grid`).
 *
 * Sources:
 *   - 'plc' (default): each column binds to a PLC base address; the grid shows
 *     `rowCount` rows, reading `${base}[i]`. Values keyed `${widgetId}_${col}_${row}`.
 *   - 'struct' (ADS only): the whole grid binds to ONE array-of-struct symbol
 *     (`structSymbol`, e.g. "GVL.aRecipes"); each column maps to a struct field.
 *     Cells reuse the `${widgetId}_${col}_${row}` keys. Columns flagged
 *     `editable` can be written (sub-path `${structSymbol}[row].${field}`); with
 *     `multiEdit` a checkbox per row lets one edit apply to every checked row.
 *
 * Props:
 *   widgetProps: {
 *     title, rowCount, showRowNumbers, source,
 *     columns: [{ label, plcAddress, dataType, unit, decimals, width }],   // plc
 *   }
 *   values: full plc_values map, widgetId
 */

export default function GridWidget({ widgetProps = {}, values = {}, widgetId, onWrite, readOnly = false, requestAccess }) {
  const {
    title          = '',
    rowCount       = 8,
    showRowNumbers = true,
    source         = 'plc',
    columns        = [],
  } = widgetProps

  // ── PLC array-of-struct (ADS, editable) ─────────────────────────────────────
  if (source === 'struct') {
    return (
      <StructGrid
        widgetProps={widgetProps}
        values={values}
        widgetId={widgetId}
        onWrite={onWrite}
        readOnly={readOnly}
        requestAccess={requestAccess}
      />
    )
  }

  // ── PLC columns (default) ───────────────────────────────────────────────────
  const fmt = (raw, col) => {
    if (raw === undefined || raw === null) return '—'
    if (typeof raw === 'number' && col.decimals != null) {
      return raw.toFixed(Number(col.decimals)) + (col.unit ? ` ${col.unit}` : '')
    }
    return String(raw) + (col.unit ? ` ${col.unit}` : '')
  }

  if (!columns.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded">
        <Table2 size={18} className="text-gray-400" />
        <span className="text-[9px] text-gray-400 font-mono">No columns</span>
      </div>
    )
  }

  const rows = Array.from({ length: Number(rowCount) || 0 })

  return (
    <div className="w-full h-full flex flex-col rounded border border-gray-200 bg-white overflow-hidden">
      {title && (
        <div className="px-2 py-1 bg-gray-100 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-widest text-gray-500 truncate shrink-0">
          {title}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {showRowNumbers && <th className="px-1.5 py-1 text-gray-400 font-medium text-right w-8">#</th>}
              {columns.map((c, ci) => (
                <th key={ci} className="px-2 py-1 text-left text-gray-500 font-semibold border-l border-gray-200"
                  style={c.width ? { width: c.width } : undefined}>
                  {c.label || `Col ${ci + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((_, ri) => (
              <tr key={ri} className={ri % 2 ? 'bg-gray-100' : ''}>
                {showRowNumbers && (
                  <td className="px-1.5 py-0.5 text-gray-400 text-right font-mono">{ri + 1}</td>
                )}
                {columns.map((c, ci) => (
                  <td key={ci} className="px-2 py-0.5 text-gray-700 font-mono border-l border-gray-200 truncate">
                    {fmt(values[`${widgetId}_${ci}_${ri}`], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── StructGrid — editable ADS array-of-struct grid ──────────────────────────────
// Kept a separate component so its edit/selection hooks never trip the rules of
// hooks when GridWidget early-returns for the plc source. Cells read the same
// `${widgetId}_${col}_${row}` keys the scanner emits for the struct array; writes
// address the struct sub-path `${structSymbol}[row].${field}` over the normal
// /plc/write path (an ADS symbol-name write, access-gated by the widget editGroup).
function coerceDraft(draft, dataType) {
  if (dataType === 'BOOL') { const v = String(draft).trim().toLowerCase(); return v === '1' || v === 'true' }
  if (dataType === 'STRING') return draft
  return Number(draft)
}

function StructGrid({ widgetProps = {}, values = {}, widgetId, onWrite, readOnly = false, requestAccess }) {
  const {
    title          = '',
    rowCount       = 8,
    showRowNumbers = true,
    columns        = [],
    structSymbol   = '',
    multiEdit      = false,
  } = widgetProps

  const [checked, setChecked] = useState(() => new Set())
  const [edit, setEdit]       = useState(null) // { ci, col, rows: number[], current }

  const rowN = Number(rowCount) || 0
  const rows = Array.from({ length: rowN })
  // Editing is a runtime-only affordance: only live when a write handler is wired
  // (the editor preview passes none, so cells stay display-only there).
  const canEdit = !readOnly && typeof onWrite === 'function' && !!structSymbol
  const anyEditable = canEdit && columns.some((c) => c.editable)
  const showChecks  = multiEdit && anyEditable

  const toggleRow = (ri) => setChecked((prev) => {
    const n = new Set(prev); n.has(ri) ? n.delete(ri) : n.add(ri); return n
  })
  const toggleAll = () => setChecked((prev) => (prev.size >= rowN ? new Set() : new Set(rows.map((_, i) => i))))

  const fmt = (raw, col) => {
    if (raw === undefined || raw === null) return '—'
    if (typeof raw === 'boolean') return raw ? 'true' : 'false'
    if (typeof raw === 'number' && col.decimals != null) {
      return raw.toFixed(Number(col.decimals)) + (col.unit ? ` ${col.unit}` : '')
    }
    return String(raw) + (col.unit ? ` ${col.unit}` : '')
  }

  // Gate access ONCE before opening the editor (mirrors EntryWidget), so every
  // resulting write — one per target row — flows straight through with the held
  // credential rather than re-prompting per row.
  const startEdit = async (ci, col, ri) => {
    if (!canEdit || !col.editable || !col.field) return
    const need = widgetProps?.editGroup ?? null
    if (isGroupProtected(need) && requestAccess) {
      const ok = await requestAccess(need)
      if (!ok) return
    }
    // With rows checked, the edit targets every checked row; otherwise just this one.
    const targetRows = (multiEdit && checked.size > 0) ? [...checked].sort((a, b) => a - b) : [ri]
    setEdit({ ci, col, rows: targetRows, current: values[`${widgetId}_${ci}_${ri}`] })
  }

  const validate = (raw) => {
    const dt = edit?.col?.dataType
    if (dt === 'BOOL') {
      const v = String(raw).trim().toLowerCase()
      return (v === '0' || v === '1' || v === 'true' || v === 'false') ? null : 'Enter 0, 1, true or false'
    }
    if (dt !== 'STRING') {
      if (Number.isNaN(Number(raw))) return 'Must be a number'
    }
    return null
  }

  const commit = ({ value: draft, comment }) => {
    if (!edit) return
    const { col, rows: targetRows } = edit
    const coerced = coerceDraft(draft, col.dataType)
    for (const r of targetRows) {
      onWrite?.(coerced, `${structSymbol}[${r}].${col.field}`, { comment, dataType: col.dataType })
    }
    setEdit(null)
  }

  if (!columns.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded">
        <Table2 size={18} className="text-gray-400" />
        <span className="text-[9px] text-gray-400 font-mono">No columns</span>
      </div>
    )
  }

  const colSpan = columns.length + (showRowNumbers ? 1 : 0) + (showChecks ? 1 : 0)

  return (
    <div className="w-full h-full flex flex-col rounded border border-gray-200 bg-white overflow-hidden">
      {title && (
        <div className="px-2 py-1 bg-gray-100 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-widest text-gray-500 truncate shrink-0">
          {title}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {showChecks && (
                <th className="px-1.5 py-1 w-7 text-center">
                  <input type="checkbox" className="accent-[#1677ff]"
                    checked={rowN > 0 && checked.size >= rowN}
                    ref={(el) => { if (el) el.indeterminate = checked.size > 0 && checked.size < rowN }}
                    onChange={toggleAll} title="Select all rows" />
                </th>
              )}
              {showRowNumbers && <th className="px-1.5 py-1 text-gray-400 font-medium text-right w-8">#</th>}
              {columns.map((c, ci) => (
                <th key={ci} className="px-2 py-1 text-left text-gray-500 font-semibold border-l border-gray-200"
                  style={c.width ? { width: c.width } : undefined}>
                  {c.label || c.field || `Col ${ci + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((_, ri) => {
              const isChecked = checked.has(ri)
              return (
                <tr key={ri} className={isChecked ? 'bg-blue-50' : (ri % 2 ? 'bg-gray-100' : '')}>
                  {showChecks && (
                    <td className="px-1.5 py-0.5 text-center">
                      <input type="checkbox" className="accent-[#1677ff]" checked={isChecked} onChange={() => toggleRow(ri)} />
                    </td>
                  )}
                  {showRowNumbers && (
                    <td className="px-1.5 py-0.5 text-gray-400 text-right font-mono">{ri + 1}</td>
                  )}
                  {columns.map((c, ci) => {
                    const raw = values[`${widgetId}_${ci}_${ri}`]
                    const editable = canEdit && c.editable && c.field
                    return (
                      <td key={ci}
                        onClick={editable ? () => startEdit(ci, c, ri) : undefined}
                        className={[
                          'px-2 py-0.5 font-mono border-l border-gray-200 truncate',
                          editable
                            ? 'text-gray-800 cursor-text hover:bg-[#1677ff]/10 group'
                            : 'text-gray-700',
                        ].join(' ')}
                        title={editable ? 'Click to edit' : undefined}>
                        <span className="inline-flex items-center gap-1">
                          {fmt(raw, c)}
                          {editable && <Pencil size={8} className="shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          {showChecks && checked.size > 0 && (
            <tfoot className="sticky bottom-0 bg-blue-50 border-t border-blue-200">
              <tr>
                <td colSpan={colSpan} className="px-2 py-0.5 text-[10px] text-[#1677ff]">
                  {checked.size} row{checked.size === 1 ? '' : 's'} selected — editing a cell applies to all selected
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <ValueEntryDialog
        open={!!edit}
        label={edit ? `${edit.col.label || edit.col.field}${edit.rows.length > 1 ? ` (${edit.rows.length} rows)` : ''}` : ''}
        unit={edit?.col?.unit || ''}
        dataType={edit?.col?.dataType || 'REAL'}
        currentValue={edit?.current}
        validate={validate}
        requireComment={!!widgetProps.requireComment}
        onCancel={() => setEdit(null)}
        onConfirm={commit}
      />
    </div>
  )
}
