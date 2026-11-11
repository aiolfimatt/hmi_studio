import React, { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Pencil } from 'lucide-react'
import { NumericPad, AlphaPad } from '../keyboard/VirtualKeyboard'
import { useLanguage } from '../../contexts/LanguageContext'
import { t } from '../../i18n/uiStrings'

/**
 * ValueEntryDialog — centered popup for writing a PLC value from the runtime.
 *
 * Replaces the old inline-edit + docked-keyboard + separate-confirm flow with a
 * single overlay that does NOT resize the page underneath. It shows, together:
 *   - the current value,
 *   - the allowed limits (min … max unit),
 *   - a large readout of the value being entered,
 *   - an embedded numeric/alpha keypad (no OS keyboard, no bottom dock),
 *   - an optional comment ("reason for the change", stored in the audit trace).
 *
 * Rendered via a portal to <body> so it escapes the scaled/clipped widget canvas.
 *
 * Props:
 *   open        — boolean
 *   label       — field label shown in the header
 *   unit        — measurement unit (optional)
 *   dataType    — PLC type ('REAL' | 'INT16' | 'UINT16' | 'BOOL' | 'STRING' | …)
 *   currentValue — the live value (shown read-only for reference)
 *   min, max    — numeric limits (may be '', null or undefined when unbounded)
 *   validate(draft) → errorString | null — caller-owned validation (type + range)
 *   requireComment — when true the operator MUST enter a comment before the
 *     change is accepted (configured per widget by the designer)
 *   onCancel()  — dismiss without writing
 *   onConfirm({ value, comment }) — commit the (already validated) draft
 */
export default function ValueEntryDialog({
  open, label, unit = '', dataType = 'REAL', currentValue,
  min, max, validate, requireComment = false, onCancel, onConfirm,
}) {
  const { lang, defaultLang } = useLanguage()
  const tt = useCallback((k, vars) => t(k, lang, defaultLang, vars), [lang, defaultLang])

  const isText = dataType === 'STRING'
  const opts = {
    decimal: /^(REAL|FLOAT|LREAL)/i.test(dataType),
    negative: !/^U/i.test(dataType),
  }

  const [draft, setDraft]     = useState('')
  const [comment, setComment] = useState('')
  const [err, setErr]         = useState(null)
  const [commentErr, setCommentErr] = useState(null)
  const [shift, setShift]     = useState(false)
  const [symbols, setSymbols] = useState(false)
  const [active, setActive]   = useState('value') // 'value' | 'comment'
  // While pristine, the draft still shows the current value fully "selected":
  // the first keypad entry replaces it instead of appending (as a real text
  // selection would). Any manual edit or backspace clears the flag.
  const [pristine, setPristine] = useState(true)
  const valueRef = useRef(null)

  // Reset the draft to the current value each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setDraft(currentValue !== undefined && currentValue !== null ? String(currentValue) : '')
    setComment('')
    setErr(null)
    setCommentErr(null)
    setShift(false)
    setSymbols(false)
    setActive('value')
    setPristine(true)
    setTimeout(() => { try { valueRef.current?.focus(); valueRef.current?.select() } catch {} }, 20)
  }, [open, currentValue])

  if (!open) return null

  const fmt = (v) => (v === undefined || v === null || v === '') ? '—' : String(v)
  const hasRange = (min !== '' && min != null) || (max !== '' && max != null)

  // Keypad drives whichever field is active; the value field uses the numeric pad
  // (unless the type is textual), the comment always uses the alpha pad.
  const padMode = (active === 'value' && !isText) ? 'numeric' : 'alpha'

  const insert = (ch) => {
    setErr(null)
    if (active === 'comment') { setCommentErr(null); setComment(c => (c + ch).slice(0, 200)); return }
    if (pristine) { setDraft(ch); setPristine(false) }  // first key replaces the selected value
    else setDraft(d => d + ch)
  }
  const backspace = () => {
    setErr(null)
    if (active === 'comment') { setCommentErr(null); setComment(c => c.slice(0, -1)); return }
    if (pristine) { setDraft(''); setPristine(false) }  // backspace clears the selected value
    else setDraft(d => d.slice(0, -1))
  }
  const toggleSign = () => {
    if (active !== 'value') return
    setErr(null)
    setPristine(false)
    setDraft(d => d.startsWith('-') ? d.slice(1) : '-' + d)
  }

  const confirm = () => {
    const e = validate ? validate(draft) : null
    if (e) { setErr(e); setActive('value'); return }
    // Designer-configured mandatory comment: block the write until a reason is
    // given, steering focus (and the keypad) to the comment field.
    if (requireComment && !comment.trim()) {
      setCommentErr(tt('commentRequiredError'))
      setActive('comment')
      return
    }
    onConfirm?.({ value: draft, comment: comment.trim() })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Dialog */}
      <div className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Pencil size={14} className="text-[#1677ff]" />
            {label || tt('setValue')}
          </span>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onCancel?.() }}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Current value + limits */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">
              {tt('currentValue')}:{' '}
              <span className="font-mono text-gray-600">{fmt(currentValue)}</span>
              {unit ? <span className="text-gray-400"> {unit}</span> : null}
            </span>
            {hasRange && (
              <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 font-mono text-amber-700">
                {min !== '' && min != null ? min : '−∞'} … {max !== '' && max != null ? max : '+∞'}
                {unit ? <span className="text-amber-600"> {unit}</span> : null}
              </span>
            )}
          </div>

          {/* Draft readout */}
          <div>
            <input
              ref={valueRef}
              type="text"
              inputMode="none"
              data-no-keyboard
              value={draft}
              onFocus={() => setActive('value')}
              onChange={(e) => { setDraft(e.target.value); setErr(null); setPristine(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onCancel?.() }}
              placeholder="—"
              className={[
                'w-full rounded-lg border bg-gray-50 px-3 py-2.5 text-right font-mono text-2xl text-gray-800',
                'focus:outline-none focus:ring-2',
                err ? 'border-red-400 focus:ring-red-200' : 'border-[#1677ff] focus:ring-[#1677ff]/30',
                active === 'value' ? '' : 'opacity-80',
              ].join(' ')}
            />
            <div className="mt-1 h-4 text-right">
              {err
                ? <span className="text-[11px] text-red-500">{err}</span>
                : unit ? <span className="text-[11px] text-gray-400">{unit}</span> : null}
            </div>
          </div>

          {/* Keypad */}
          <div>
            {padMode === 'numeric'
              ? <NumericPad insert={insert} backspace={backspace} toggleSign={toggleSign} enter={confirm} opts={opts} />
              : <AlphaPad insert={insert} backspace={backspace} enter={confirm}
                  shift={shift} setShift={setShift} symbols={symbols} setSymbols={setSymbols} />}
          </div>

          {/* Comment */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500">
              {requireComment ? tt('commentRequired') : tt('commentOptional')}
              {requireComment && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              rows={2}
              maxLength={200}
              inputMode="none"
              data-no-keyboard
              value={comment}
              onFocus={() => setActive('comment')}
              onChange={(e) => { setCommentErr(null); setComment(e.target.value) }}
              placeholder={tt('reasonForChange')}
              className={[
                'w-full resize-none rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700',
                'focus:outline-none focus:ring-2',
                commentErr
                  ? 'border-red-400 focus:ring-red-200'
                  : active === 'comment' ? 'border-[#1677ff] focus:ring-[#1677ff]/30' : 'border-gray-300 focus:ring-[#1677ff]/30',
              ].join(' ')}
            />
            {commentErr && <span className="mt-1 block text-[11px] text-red-500">{commentErr}</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-200 px-4 py-2.5">
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onCancel?.() }}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {tt('cancel')}
          </button>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); confirm() }}
            className="flex flex-[2] items-center justify-center gap-1.5 rounded-lg bg-[#1677ff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4096ff]"
          >
            <Check size={15} /> {tt('confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
