import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PanelLeft } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { resolveText } from '../../i18n/resolve'
import { useSidebarConfig, DEFAULT_SIDEBAR } from './sidebarStore'
import { AntIcon, isAntIcon, antIconName } from './antIcons'

/**
 * SidebarWidget — a shared navigation sidebar. Its buttons and style come from a
 * single global config (sidebarStore / /api/sidebar), so every instance looks
 * the same on whatever page it is dropped on. Each button navigates to a page.
 *
 * Runtime: clicking a button routes to /monitor/<targetPage>; the button for the
 * current page is highlighted. Editor: buttons are inert preview (the canvas
 * already makes the widget non-interactive), and an empty config shows a hint.
 */

function ButtonIcon({ icon, size, color }) {
  if (!icon) return null
  if (isAntIcon(icon)) return <AntIcon name={antIconName(icon)} size={size} color={color} />
  return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} draggable={false} />
}

export default function SidebarWidget({ editor = false }) {
  const cfg = { ...DEFAULT_SIDEBAR, ...useSidebarConfig() }
  const { lang, defaultLang } = useLanguage()
  const navigate = useNavigate()
  const { pageName } = useParams()

  const {
    orientation = 'vertical', bgColor, textColor, activeColor, iconSize,
    showLabels, align, buttons,
  } = cfg
  // buttonSize is the extent along the bar's main axis; keep reading the legacy
  // `buttonHeight` key for configs saved before the rename.
  const buttonSize = cfg.buttonSize ?? cfg.buttonHeight ?? 56
  const horizontal = orientation === 'horizontal'
  const centered = align === 'center'

  const go = (b) => {
    if (editor || !b?.targetPage) return
    navigate(`/monitor/${b.targetPage}`)
  }

  const hasButtons = Array.isArray(buttons) && buttons.length > 0

  return (
    <div
      className={`w-full h-full flex select-none ${
        horizontal
          ? 'flex-row overflow-x-auto overflow-y-hidden'
          : 'flex-col overflow-y-auto overflow-x-hidden'
      }`}
      style={{ background: bgColor, color: textColor }}
    >
      <div className={`flex ${horizontal ? 'flex-row' : 'flex-col'} ${centered ? (horizontal ? 'mx-auto' : 'my-auto') : ''}`}>
        {!hasButtons ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 px-3 text-center opacity-60">
            <PanelLeft size={22} />
            {editor && <span className="text-[10px] leading-tight">Configure buttons in the properties panel →</span>}
          </div>
        ) : (
          buttons.map((b) => {
            const active = !!pageName && b.targetPage === pageName
            const label = resolveText(b.label, lang, defaultLang)
            return (
              <button
                key={b.id}
                onClick={() => go(b)}
                title={label || b.targetPage}
                className={`flex flex-col items-center justify-center gap-1 px-1 shrink-0 transition-colors hover:brightness-125 ${
                  horizontal ? 'h-full' : 'w-full'
                }`}
                style={{
                  [horizontal ? 'width' : 'height']: buttonSize,
                  background: active ? activeColor : 'transparent',
                  color: textColor,
                  cursor: editor ? 'default' : 'pointer',
                  // Accent on the leading edge: left rail for vertical, top for horizontal.
                  [horizontal ? 'borderTop' : 'borderLeft']: active ? `3px solid ${textColor}` : '3px solid transparent',
                }}
              >
                <ButtonIcon icon={b.icon} size={iconSize} color={textColor} />
                {showLabels && label && (
                  <span className="text-[11px] leading-tight text-center truncate max-w-full px-0.5">{label}</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
