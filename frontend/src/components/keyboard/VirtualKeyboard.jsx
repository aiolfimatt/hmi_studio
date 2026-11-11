import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Delete, ArrowBigUp, CornerDownLeft, ChevronDown, Keyboard } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { t } from '../../i18n/uiStrings'

// Shared helper: resolve a UI string for the active runtime language.
function useTt() {
  const { lang, defaultLang } = useLanguage()
  return useCallback((k, vars) => t(k, lang, defaultLang, vars), [lang, defaultLang])
}

/**
 * VirtualKeyboard — global on-screen keyboard for touch-only HMI panels.
 *
 * Replicates the legacy monitor keyboards (Tast_numerica / Tast_alfa_numerica):
 *  - a numeric keypad for number fields (decimal point hidden for integer types,
 *    sign hidden for unsigned types — via data-decimal / data-negative attrs),
 *  - a full QWERTY layout (with shift + symbol page) for text fields.
 *
 * Keys act on POINTERDOWN (not click) and preventDefault, so they work
 * identically with mouse, touch and pen, and the focused field never blurs.
 *
 * Opt out by adding `data-no-keyboard` to an input (or any ancestor).
 * Force a layout with `data-keyboard="numeric" | "text"`.
 */

const TEXT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'password', ''])

function isEditable(el) {
  if (!el || el.disabled || el.readOnly) return false
  if (el.closest?.('[data-no-keyboard]')) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  const type = (el.getAttribute('type') || 'text').toLowerCase()
  return type === 'number' || TEXT_TYPES.has(type)
}

function isTextLike(el) {
  if (el.tagName === 'TEXTAREA') return true
  const type = (el.getAttribute('type') || 'text').toLowerCase()
  return TEXT_TYPES.has(type)
}

function decideLayout(el) {
  const forced = el.getAttribute('data-keyboard')
  if (forced === 'numeric') return 'numeric'
  if (forced === 'text') return 'text'
  if (el.tagName === 'TEXTAREA') return 'text'
  const type = (el.getAttribute('type') || 'text').toLowerCase()
  if (type === 'number') return 'numeric'
  const im = (el.getAttribute('inputmode') || '').toLowerCase()
  if (im === 'numeric' || im === 'decimal' || im === 'tel') return 'numeric'
  return 'text'
}

// Write a value into a controlled input and notify React.
function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export default function VirtualKeyboard() {
  // The on-screen keyboard targets the touch-only operator panels (runtime). The
  // admin/designer area (/edit/*) is used with a physical keyboard, so suppress it
  // there entirely — no launcher, no auto-attach, no docking.
  const location = useLocation()
  const enabled = !location.pathname.startsWith('/edit')
  const tt = useTt()

  const targetRef = useRef(null)
  const panelRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [layout, setLayout] = useState('text')
  const [shift, setShift] = useState(false)
  const [symbols, setSymbols] = useState(false)
  const [opts, setOpts] = useState({ decimal: true, negative: true })
  const [range, setRange] = useState(null) // { min, max, unit } for the focused numeric field
  const [noTarget, setNoTarget] = useState(false)
  // Password fields: suppress the per-key press/hover feedback so an onlooker
  // can't read the typed characters off the animating keys (shoulder surfing).
  const [secure, setSecure] = useState(false)

  // ── attach the keyboard to an editable element ──────────────────────────
  const attach = useCallback((el) => {
    if (!isEditable(el)) return
    targetRef.current = el
    setLayout(decideLayout(el))
    setSecure((el.getAttribute('type') || '').toLowerCase() === 'password')
    setShift(false)
    setSymbols(false)
    setOpts({
      decimal: el.getAttribute('data-decimal') !== 'false',
      negative: el.getAttribute('data-negative') !== 'false',
    })
    const dMin = el.getAttribute('data-min')
    const dMax = el.getAttribute('data-max')
    setRange((dMin != null || dMax != null)
      ? { min: dMin, max: dMax, unit: el.getAttribute('data-unit') || '' }
      : null)
    // suppress the OS keyboard on touch devices
    if (!('_kbPrevIm' in el.dataset)) {
      el.dataset._kbPrevIm = el.getAttribute('inputmode') || ''
    }
    el.setAttribute('inputmode', 'none')
    setNoTarget(false)
    setVisible(true)
    // keep the focused field visible above the keyboard
    setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {} }, 50)
  }, [])

  // Manual open via the floating button: always show the keyboard. If a field is
  // focused (or one exists on the page) we attach to it; otherwise we show a hint.
  const openManually = useCallback((e) => {
    if (e) e.preventDefault()
    let el = document.activeElement
    if (!isEditable(el)) {
      el = document.querySelector(
        'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([disabled]), textarea'
      )
    }
    if (el) { el.focus(); attach(el) }
    else { setNoTarget(true); setLayout('text'); setRange(null); setSecure(false); setVisible(true) }
  }, [attach])

  // On edit routes the keyboard is off — make sure any lingering open state from a
  // previous (runtime) route is cleared so nothing is docked behind the editor.
  useEffect(() => {
    if (!enabled) { setVisible(false); setNoTarget(false); targetRef.current = null }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    // Use CAPTURE phase so focus-trapping overlays (e.g. antd Modal/rc-dialog,
    // which can stop propagation of focus events during bubbling) can't prevent
    // us from detecting the focused field.
    const onFocusIn = (e) => { if (isEditable(e.target)) attach(e.target) }
    const onPointerDown = (e) => {
      const el = e.target
      if (isEditable(el) && targetRef.current !== el) attach(el)
    }
    const onClick = (e) => {
      const el = e.target
      if (isEditable(el) && targetRef.current !== el) attach(el)
    }
    const onFocusOut = () => {
      setTimeout(() => {
        const a = document.activeElement
        if (!isEditable(a)) {
          const prev = targetRef.current
          if (prev && '_kbPrevIm' in prev.dataset) {
            if (prev.dataset._kbPrevIm) prev.setAttribute('inputmode', prev.dataset._kbPrevIm)
            else prev.removeAttribute('inputmode')
            delete prev.dataset._kbPrevIm
          }
          targetRef.current = null
          setVisible(false)
        }
      }, 0)
    }
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('focusout', onFocusOut, true)
    // if a field is already focused at mount (e.g. autoFocus), attach to it
    if (isEditable(document.activeElement)) attach(document.activeElement)
    return () => {
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('focusout', onFocusOut, true)
    }
  }, [attach, enabled])

  // ── editing primitives ──────────────────────────────────────────────────
  const insert = useCallback((ch) => {
    const el = targetRef.current
    if (!el) return
    if (isTextLike(el)) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      const nv = el.value.slice(0, start) + ch + el.value.slice(end)
      setNativeValue(el, nv)
      const pos = start + ch.length
      try { el.setSelectionRange(pos, pos) } catch { /* number inputs */ }
    } else {
      setNativeValue(el, el.value + ch)
    }
  }, [])

  const backspace = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    if (isTextLike(el)) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      if (start !== end) {
        const nv = el.value.slice(0, start) + el.value.slice(end)
        setNativeValue(el, nv)
        try { el.setSelectionRange(start, start) } catch {}
      } else if (start > 0) {
        const nv = el.value.slice(0, start - 1) + el.value.slice(start)
        setNativeValue(el, nv)
        try { el.setSelectionRange(start - 1, start - 1) } catch {}
      }
    } else {
      setNativeValue(el, el.value.slice(0, -1))
    }
  }, [])

  const toggleSign = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    const v = el.value
    setNativeValue(el, v.startsWith('-') ? v.slice(1) : '-' + v)
  }, [])

  const enter = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    for (const type of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
    }
    if (el.form && typeof el.form.requestSubmit === 'function') {
      try { el.form.requestSubmit() } catch {}
    }
  }, [])

  const close = useCallback(() => {
    const el = targetRef.current
    if (el) el.blur()
    setNoTarget(false)
    setVisible(false)
  }, [])

  // Dock: reserve space for the keyboard so fields/modals are never covered.
  useEffect(() => {
    if (visible && panelRef.current) {
      document.documentElement.style.setProperty('--kb-h', panelRef.current.offsetHeight + 'px')
      document.body.classList.add('kb-open')
    } else {
      document.body.classList.remove('kb-open')
      document.documentElement.style.removeProperty('--kb-h')
    }
    return () => {
      document.body.classList.remove('kb-open')
      document.documentElement.style.removeProperty('--kb-h')
    }
  })

  // Suppressed in the admin/designer area — render nothing at all.
  if (!enabled) return null

  // Always-visible launcher so the keyboard can be summoned on any device,
  // and as a visible marker that this (new) build is loaded.
  if (!visible) {
    return (
      <button
        type="button"
        title={tt('openKeyboard')}
        aria-label={tt('openKeyboard')}
        onPointerDown={openManually}
        className="fixed bottom-4 right-4 z-[1100] flex h-12 w-12 items-center justify-center rounded-full bg-[#1677ff] text-white shadow-lg hover:bg-[#4096ff] active:scale-95 touch-none"
      >
        <Keyboard size={20} />
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
      className="fixed inset-x-0 bottom-0 z-[1100] select-none border-t border-gray-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
      role="group"
      aria-label={tt('virtualKeyboard')}
    >
      <div className="mx-auto max-w-3xl px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-gray-400">
            {layout === 'numeric' ? tt('numericKeypad') : tt('keyboard')}
          </span>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); close() }}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <ChevronDown size={14} /> {tt('close')}
          </button>
        </div>
        {noTarget && (
          <div className="mb-2 rounded bg-blue-50 border border-blue-200 px-3 py-1.5 text-center text-xs text-[#1677ff]">
            {tt('tapFieldToType')}
          </div>
        )}
        {layout === 'numeric' && range && (
          <div className="mb-2 rounded bg-amber-50 border border-amber-200 px-3 py-1.5 text-center text-xs text-amber-700">
            {tt('allowedValue')}:{' '}
            <span className="font-mono font-semibold">
              {range.min != null ? range.min : '−∞'} … {range.max != null ? range.max : '+∞'}
            </span>
            {range.unit ? <span className="text-amber-600"> {range.unit}</span> : null}
          </div>
        )}
        {layout === 'numeric'
          ? <NumericPad insert={insert} backspace={backspace} toggleSign={toggleSign} enter={enter} opts={opts} secure={secure} />
          : <AlphaPad insert={insert} backspace={backspace} enter={enter}
              shift={shift} setShift={setShift} symbols={symbols} setSymbols={setSymbols} secure={secure} />}
      </div>
    </div>
  )
}

// ── Key button — acts on pointerdown so touch + mouse behave identically ──────
function Key({ children, onPress, className = '', flex = 1, accent, disabled, secure }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => { e.preventDefault(); if (!disabled) onPress?.() }}
      style={{ flexGrow: flex, flexBasis: 0 }}
      className={[
        'h-12 min-w-0 rounded-md text-base font-medium touch-none',
        // In secure (password) mode drop every press/hover state change so the
        // key being pressed never stands out visually.
        secure ? '' : 'transition-colors active:scale-[0.97]',
        disabled ? 'opacity-30 pointer-events-none' : '',
        accent
          ? (secure ? 'bg-[#1677ff] text-white' : 'bg-[#1677ff] text-white hover:bg-[#4096ff]')
          : (secure ? 'bg-gray-100 text-gray-800 border border-gray-200'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300 border border-gray-200'),
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ── Numeric keypad (Tast_numerica) ────────────────────────────────────────────
export function NumericPad({ insert, backspace, toggleSign, enter, opts, secure }) {
  const tt = useTt()
  const Row = ({ children }) => <div className="flex gap-1.5">{children}</div>
  const K = (p) => <Key secure={secure} {...p} />
  return (
    <div className="mx-auto flex max-w-xs flex-col gap-1.5">
      <Row>{['7', '8', '9'].map((k) => <K key={k} onPress={() => insert(k)}>{k}</K>)}</Row>
      <Row>{['4', '5', '6'].map((k) => <K key={k} onPress={() => insert(k)}>{k}</K>)}</Row>
      <Row>{['1', '2', '3'].map((k) => <K key={k} onPress={() => insert(k)}>{k}</K>)}</Row>
      <Row>
        <K onPress={toggleSign} disabled={!opts.negative}>±</K>
        <K onPress={() => insert('0')}>0</K>
        <K onPress={() => insert('.')} disabled={!opts.decimal}>.</K>
      </Row>
      <Row>
        <K onPress={backspace} flex={1}><span className="inline-flex items-center justify-center"><Delete size={18} /></span></K>
        <K onPress={enter} accent flex={2}><span className="inline-flex items-center justify-center gap-1.5"><CornerDownLeft size={16} /> {tt('keyEnter')}</span></K>
      </Row>
    </div>
  )
}

// ── Alphanumeric keyboard (Tast_alfa_numerica) ────────────────────────────────
const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]
const SYMBOL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'],
  ['*', '"', "'", ':', ';', '!', '?', '=', '\\'],
]

export function AlphaPad({ insert, backspace, enter, shift, setShift, symbols, setSymbols, secure }) {
  const tt = useTt()
  const rows = symbols ? SYMBOL_ROWS : LETTER_ROWS
  const cap = (k) => (!symbols && shift ? k.toUpperCase() : k)
  const Row = ({ children, className = '' }) => <div className={`flex gap-1.5 ${className}`}>{children}</div>
  const K = (p) => <Key secure={secure} {...p} />

  return (
    <div className="flex flex-col gap-1.5">
      <Row>{rows[0].map((k) => <K key={k} onPress={() => insert(cap(k))}>{cap(k)}</K>)}</Row>
      <Row className="px-4">{rows[1].map((k) => <K key={k} onPress={() => insert(cap(k))}>{cap(k)}</K>)}</Row>
      <Row>
        <K onPress={() => setShift((s) => !s)} flex={1.5} accent={shift} disabled={symbols}>
          <span className="inline-flex items-center justify-center"><ArrowBigUp size={18} /></span>
        </K>
        {rows[2].map((k) => <K key={k} onPress={() => insert(cap(k))}>{cap(k)}</K>)}
        <K onPress={backspace} flex={1.5}><span className="inline-flex items-center justify-center"><Delete size={18} /></span></K>
      </Row>
      <Row>
        <K onPress={() => setSymbols((s) => !s)} flex={1.5}>{symbols ? 'ABC' : '?123'}</K>
        <K onPress={() => insert(' ')} flex={5}>{tt('keySpace')}</K>
        <K onPress={enter} accent flex={2}><span className="inline-flex items-center justify-center gap-1.5"><CornerDownLeft size={16} /> {tt('keyEnter')}</span></K>
      </Row>
    </div>
  )
}
