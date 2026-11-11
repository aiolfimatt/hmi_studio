import React from 'react'
import { useWidgetEvent } from './widgetEvents'
import { isAntIcon, antIconName, AntIcon } from './antIcons'

/**
 * ButtonWidget — push button with optional background image, positioned icon
 * and click event (legacy `button`).
 * Props:
 *   widgetProps: {
 *     label, fontSize, color, bgColor, image,
 *     icon, iconPosition ('left'|'right'|'top'|'bottom'), iconSize,
 *     onClick, targetPage, url, urlMode, writeAddress, writeValue, widgetLevel
 *   }
 *   onWrite(value, address), readOnly, value
 */

// icon placement → flex layout: the icon sits on the given side of the text.
const ICON_LAYOUT = {
  left:   'flex-row',
  right:  'flex-row-reverse',
  top:    'flex-col',
  bottom: 'flex-col-reverse',
}

export default function ButtonWidget({ widgetProps = {}, value, onWrite, onSession, runtimeApi, requestAccess, readOnly = false, session }) {
  const {
    label         = 'Button',
    fontSize      = 13,
    color         = '#1f2937',
    bgColor       = '#ffffff',
    image         = '',
    icon          = '',
    iconPosition  = 'left',
    iconSize      = 20,
    onClick       = 'navigate',
    labelLoggedIn = '',
    iconLoggedIn  = '',
    bold          = false,
  } = widgetProps

  // An operator holds a runtime credential → logged in. (undefined in the editor
  // preview, so the login/logged-out appearance is shown there.)
  const loggedIn = !!session?.username

  // For the unified 'session' action, swap the label + icon to the logged-in
  // variant while an operator is authenticated — one button that reads e.g.
  // "Login" when logged out and "Logout" when logged in (each falling back to
  // the base label/icon when its variant is left blank).
  const isSession = onClick === 'session'
  const dispLabel = isSession && loggedIn ? (labelLoggedIn || label) : label
  const dispIcon  = isSession && loggedIn ? (iconLoggedIn  || icon)  : icon

  const handlers = useWidgetEvent({ widgetProps, onWrite, onSession, runtimeApi, requestAccess, readOnly, value, loggedIn })

  return (
    <button
      {...handlers}
      disabled={readOnly}
      style={{
        background: image ? `center/contain no-repeat url("${image}")` : bgColor,
        color,
        fontSize: `${fontSize}px`,
        fontWeight: bold ? 700 : 400,
      }}
      className={[
        'w-full h-full flex items-center justify-center gap-1.5 rounded border border-gray-300',
        ICON_LAYOUT[iconPosition] || ICON_LAYOUT.left,
        'tracking-wide transition-all duration-100 select-none overflow-hidden',
        readOnly
          ? 'cursor-default opacity-70'
          : 'cursor-pointer hover:brightness-125 active:scale-[0.97]',
      ].join(' ')}
      title={readOnly ? 'Livello permessi insufficiente' : undefined}
    >
      {dispIcon && (isAntIcon(dispIcon)
        ? (
          <AntIcon
            name={antIconName(dispIcon)}
            size={iconSize}
            color={color}
            className="shrink-0 pointer-events-none drop-shadow"
          />
        )
        : (
          <img
            src={dispIcon}
            alt=""
            draggable={false}
            style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
            className="object-contain shrink-0 pointer-events-none drop-shadow"
          />
        )
      )}
      {/* hide text label when a full-bleed image is set and label is empty */}
      {dispLabel && <span className="px-1 truncate drop-shadow">{dispLabel}</span>}
    </button>
  )
}
