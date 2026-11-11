import React, { useState } from 'react'
import { Globe } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { toLangMap } from '../../i18n/resolve'

/**
 * MultiLangInput — a translatable text field for the designer.
 *
 * Collapsed: a single input bound to the currently-selected editor language,
 * plus a globe toggle. The globe shows how many languages are filled.
 * Expanded: one input per active language (flag-prefixed).
 *
 * The value round-trips as a { code: text } map. A legacy plain string is
 * transparently upgraded to a map on first edit (seeded into the default
 * language slot), so old pages keep working and never lose their text.
 *
 * Props:
 *   value      — string | { code: text }
 *   onChange   — (newValue: { code: text }) => void
 *   placeholder
 */
export default function MultiLangInput({ value, onChange, placeholder }) {
  const { lang, defaultLang, languages } = useLanguage()
  const [expanded, setExpanded] = useState(false)

  const map = toLangMap(value, defaultLang)
  const filled = languages.filter((l) => (map[l.code] ?? '').trim() !== '').length

  const setFor = (code, text) => {
    const next = { ...toLangMap(value, defaultLang), [code]: text }
    onChange(next)
  }

  const inputCls = 'input-field text-xs py-1 flex-1 min-w-0'

  return (
    <div>
      <div className="flex gap-1.5 items-center">
        <input
          type="text"
          className={inputCls}
          value={map[lang] ?? ''}
          onChange={(e) => setFor(lang, e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={[
            'shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
            expanded ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 hover:bg-gray-100 text-gray-700',
          ].join(' ')}
          title="Traduzioni"
        >
          <Globe size={11} />
          <span className="tabular-nums">{filled}/{languages.length}</span>
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 space-y-1 rounded border border-gray-200 bg-gray-50 p-2">
          {languages.map((l) => (
            <div key={l.code} className="flex items-center gap-1.5">
              <span className="w-8 shrink-0 text-center" title={l.label}>{l.flag}</span>
              <input
                type="text"
                className="input-field text-xs py-1 flex-1 min-w-0"
                value={map[l.code] ?? ''}
                onChange={(e) => setFor(l.code, e.target.value)}
                placeholder={l.code === defaultLang ? placeholder : ''}
              />
              {l.code === lang && <span className="text-[9px] text-blue-500 shrink-0">attiva</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
