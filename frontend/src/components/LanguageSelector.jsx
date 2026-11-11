import React from 'react'
import { Dropdown, Button } from 'antd'
import { Globe, Check } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

/**
 * LanguageSelector — compact language switcher backed by LanguageContext.
 * Used in the runtime shell (operator) and the edit-mode header (preview).
 *
 * Props:
 *   size    — 'default' | 'small'
 *   variant — 'button' (bordered, for headers) | 'floating' (pill, for runtime)
 */
export default function LanguageSelector({ size = 'default', variant = 'button' }) {
  const { lang, setLang, languages } = useLanguage()
  const current = languages.find((l) => l.code === lang) || languages[0]
  if (!languages.length) return null

  const items = languages.map((l) => ({
    key: l.code,
    label: (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
        <span style={{ fontSize: 15 }}>{l.flag}</span>
        <span style={{ flex: 1 }}>{l.label}</span>
        {l.code === lang && <Check size={13} />}
      </span>
    ),
  }))

  const label = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Globe size={15} />
      <span style={{ fontSize: 15 }}>{current?.flag}</span>
      <span style={{ textTransform: 'uppercase', fontSize: 12, fontWeight: 600 }}>{current?.code}</span>
    </span>
  )

  return (
    <Dropdown
      trigger={['click']}
      menu={{ items, selectable: true, selectedKeys: [lang], onClick: ({ key }) => setLang(key) }}
      placement="bottomRight"
    >
      {variant === 'floating' ? (
        <button
          className="flex items-center gap-1.5 rounded-full bg-white/90 border border-gray-200 px-3 py-1.5 shadow-sm hover:bg-white transition-colors"
          title="Lingua / Language"
        >
          {label}
        </button>
      ) : (
        <Button size={size} icon={null}>{label}</Button>
      )}
    </Dropdown>
  )
}
