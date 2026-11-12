import React from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { resolveWidgetProps } from '../../i18n/resolve'
import ErrorBoundary from '../ErrorBoundary'
import LabelWidget       from './LabelWidget'
import EntryWidget       from './EntryWidget'
import ToggleButtonWidget from './ToggleButtonWidget'
import ToggleMultiWidget  from './ToggleMultiWidget'
import GraphWidget       from './GraphWidget'
import PixmapWidget      from './PixmapWidget'
import StlWidget         from './StlWidget'
import EventBoxWidget    from './EventBoxWidget'
import BoxWidget         from './BoxWidget'
import ButtonWidget      from './ButtonWidget'
import TogglePixmapWidget from './TogglePixmapWidget'
import GridWidget        from './GridWidget'
import UsersPanelWidget   from './UsersPanelWidget'
import AuditTrailWidget   from './AuditTrailWidget'
import CyclingAlarmsWidget from './CyclingAlarmsWidget'
import ProgressBarWidget   from './ProgressBarWidget'
import SidebarWidget       from './SidebarWidget'

/**
 * WidgetContent — resolves a widget type to its component, WITHOUT any
 * positioning wrapper. Shared by the runtime monitor (WidgetRenderer) and the
 * page editor's canvas so both render pixel-identical widgets (WYSIWYG).
 *
 * Props:
 *   widget    — full widget object: { id, type, props }
 *   values    — plc_values map from Socket.IO { [widgetId]: value }
 *   onWrite   — (value, address) => void  (already scoped to this widget)
 *   readOnly  — boolean
 */
export function WidgetContent({ widget, values = {}, onWrite, onSession, runtimeApi, session, readOnly = false, editor = false, alarms, requestAccess, userAdmin }) {
  const { lang, defaultLang } = useLanguage()
  const { id, type } = widget
  // Resolve translatable text props (label/text/…) for the active language.
  // Non-text props pass through untouched; widget components stay language-unaware.
  const wp = resolveWidgetProps(type, widget.props ?? {}, lang, defaultLang)

  // Primary value for this widget
  const primaryValue = values[id]

  const handleWrite = (newValue, address, meta) => {
    const addr = address || wp.plcAddress || wp.writeAddress
    onWrite?.(newValue, addr, meta)
  }

  const effectiveReadOnly = readOnly

  switch (type) {
      case 'label':
        return <LabelWidget widgetProps={wp} value={primaryValue} session={session} editor={editor} />

      case 'entry':
        return (
          <EntryWidget
            widgetProps={wp}
            value={primaryValue}
            onWrite={handleWrite}
            readOnly={effectiveReadOnly}
            requestAccess={requestAccess}
          />
        )

      case 'toggle_button':
        return (
          <ToggleButtonWidget
            widgetProps={wp}
            value={primaryValue}
            onWrite={handleWrite}
            readOnly={effectiveReadOnly}
          />
        )

      case 'toggle_multi':
        return (
          <ToggleMultiWidget
            widgetProps={wp}
            value={primaryValue}
            onWrite={handleWrite}
            readOnly={effectiveReadOnly}
          />
        )

      case 'graph':
        return <GraphWidget widgetProps={wp} value={primaryValue} />

      case 'progress_bar':
        return <ProgressBarWidget widgetProps={wp} value={primaryValue} />

      case 'pixmap':
        return <PixmapWidget widgetProps={wp} value={primaryValue} />

      case 'stl_viewer':
        return <StlWidget widgetProps={wp} />

      case 'box':
        return <BoxWidget widgetProps={wp} />

      case 'button':
        return (
          <ButtonWidget
            widgetProps={wp}
            value={primaryValue}
            onWrite={handleWrite}
            onSession={onSession}
            runtimeApi={runtimeApi}
            session={session}
            requestAccess={requestAccess}
            readOnly={effectiveReadOnly}
          />
        )

      case 'toggle_pixmap':
        return (
          <TogglePixmapWidget
            widgetProps={wp}
            value={primaryValue}
            onWrite={handleWrite}
            onSession={onSession}
            runtimeApi={runtimeApi}
            session={session}
            requestAccess={requestAccess}
            readOnly={effectiveReadOnly}
          />
        )

      case 'grid':
        return (
          <GridWidget
            widgetProps={wp}
            values={values}
            widgetId={id}
            onWrite={handleWrite}
            readOnly={effectiveReadOnly}
            requestAccess={requestAccess}
          />
        )

      case 'users_panel':
        return <UsersPanelWidget editor={editor} auth={userAdmin} onLogin={() => onSession?.('login')} />

      case 'audit_trail':
        return <AuditTrailWidget widgetProps={wp} editor={editor} auth={userAdmin} onLogin={() => onSession?.('login')} />

      case 'cycling_alarms':
        return <CyclingAlarmsWidget widgetProps={wp} alarms={alarms} />

      case 'sidebar':
        return <SidebarWidget editor={editor} />

      case 'event_box':
        return (
          <EventBoxWidget
            widgetProps={wp}
            value={primaryValue}
            onWrite={handleWrite}
            onSession={onSession}
            runtimeApi={runtimeApi}
            session={session}
            requestAccess={requestAccess}
            readOnly={effectiveReadOnly}
            editor={editor}
          />
        )

      default:
        return (
          <div className="w-full h-full flex items-center justify-center border border-dashed border-gray-300 rounded">
            <span className="text-[9px] text-gray-400 font-mono">{type}</span>
          </div>
        )
  }
}

/**
 * WidgetRenderer — resolves widget type and renders with absolute positioning.
 *
 * Props:
 *   widget    — full widget object: { id, type, x, y, width, height, props }
 *   values    — plc_values map from Socket.IO { [widgetId]: value }
 *   onWrite   — (widgetId, address, value, widgetProps, type) => void
 *   readOnly  — boolean
 *   isSelected — boolean (editor use)
 *   onSelect   — (widgetId) => void (editor use)
 */
export default function WidgetRenderer({
  widget,
  values = {},
  onWrite,
  onSession,
  runtimeApi,
  session,
  readOnly = false,
  isSelected = false,
  onSelect,
  alarms,
  requestAccess,
  userAdmin,
}) {
  const { lang, defaultLang } = useLanguage()
  const { id, type, x, y, width, height, props: rawWp = {} } = widget
  // Resolve translatable props so the write payload (trace label, confirm dialog)
  // carries the active-language string, not a { code: text } map.
  const wp = resolveWidgetProps(type, rawWp, lang, defaultLang)

  const handleWrite = (value, address, meta) => {
    const addr = address || wp.plcAddress || wp.writeAddress
    onWrite?.(id, addr, value, wp, type, meta)
  }

  return (
    <div
      data-widget-id={id}
      data-widget-type={type}
      onClick={onSelect ? () => onSelect(id) : undefined}
      style={{
        position : 'absolute',
        left     : x,
        top      : y,
        width    : width,
        height   : height,
        zIndex   : widget.zIndex ?? 1,
        boxSizing: 'border-box',
      }}
      className={[
        'overflow-hidden',
        isSelected ? 'widget-selected' : '',
        onSelect   ? 'cursor-pointer'  : '',
      ].join(' ').trim()}
    >
      <ErrorBoundary compact label={type}>
        <WidgetContent widget={widget} values={values} onWrite={handleWrite} onSession={onSession} runtimeApi={runtimeApi} session={session} readOnly={readOnly} alarms={alarms} requestAccess={requestAccess} userAdmin={userAdmin} />
      </ErrorBoundary>
    </div>
  )
}
