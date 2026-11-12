import React, {
  useState, useRef, useCallback, useEffect
} from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext, useDraggable, DragOverlay, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  Type, Hash, TrendingUp, ToggleLeft,
  Image, MousePointer2, Box, Plus, Save, Eye, ChevronLeft,
  Trash2, Copy, ArrowUp, ArrowDown, BringToFront, SendToBack, Settings, X,
  ChevronDown, ChevronUp, Layers, Upload, FolderOpen, Check,
  FilePlus,
  Square, RectangleHorizontal, Images, LayoutGrid, Package, Bell, Users,
  Grid2X2, Magnet, Download, FileText, PanelLeft, Search, RefreshCw, Gauge,
  Repeat, Tag, ScrollText,
  Bookmark, Library, Pencil,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter
} from 'lucide-react'
import { pages as pagesApi, assets as assetsApi, textio as textioApi, system as systemApi, plc as plcApi, project as projectApi, groups as groupsApi, library as libraryApi } from '../api/client'
import { EVENT_OPTIONS } from '../components/widgets/widgetEvents'
import { editGroupList } from '../utils/access'
import { WidgetContent } from '../components/widgets/WidgetRenderer'
import { AUDIT_EVENTS, COLUMN_KEYS as AUDIT_COLUMNS } from '../components/widgets/AuditTrailWidget'
import ErrorBoundary from '../components/ErrorBoundary'
import MultiLangInput from '../components/i18n/MultiLangInput'
import AntIconPicker from '../components/AntIconPicker'
import { ensureSidebarLoaded, getSidebarConfig, setLocalConfig, saveSidebarConfig, DEFAULT_SIDEBAR } from '../components/widgets/sidebarStore'
import { isAntIcon, antIconName, AntIcon } from '../components/widgets/antIcons'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GRID = 10

const PALETTE_ITEMS = [
  { type: 'label',         icon: Type,          label: 'Label',       color: 'bg-sky-900/60 border-sky-700/60',      category: 'widget' },
  { type: 'entry',         icon: Hash,          label: 'Entry',       color: 'bg-violet-900/60 border-violet-700/60', category: 'widget' },
  { type: 'graph',         icon: TrendingUp,    label: 'Graph',       color: 'bg-emerald-900/60 border-emerald-700/60', category: 'widget' },
  { type: 'progress_bar',  icon: Gauge,         label: 'Progress Bar', color: 'bg-blue-900/60 border-blue-700/60',   category: 'widget' },
  { type: 'toggle_button', icon: ToggleLeft,    label: 'Toggle Btn',  color: 'bg-amber-900/60 border-amber-700/60',  category: 'widget' },
  { type: 'toggle_multi',  icon: Repeat,        label: 'Multi Toggle', color: 'bg-teal-900/60 border-teal-700/60',   category: 'widget' },
  { type: 'button',        icon: RectangleHorizontal, label: 'Button', color: 'bg-indigo-900/60 border-indigo-700/60', category: 'widget' },
  { type: 'grid',          icon: LayoutGrid,    label: 'Grid',        color: 'bg-fuchsia-900/60 border-fuchsia-700/60', category: 'widget' },
  { type: 'pixmap',        icon: Image,         label: 'Pixmap',      color: 'bg-orange-900/60 border-orange-700/60', category: 'widget' },
  { type: 'toggle_pixmap', icon: Images,        label: 'Toggle Pix',  color: 'bg-yellow-900/60 border-yellow-700/60', category: 'widget' },
  { type: 'box',           icon: Square,        label: 'Box',         color: 'bg-slate-800/60 border-slate-600/60',  category: 'widget' },
  { type: 'stl_viewer',   icon: Box,           label: '3D STL',      color: 'bg-cyan-900/60 border-cyan-700/60',    category: 'widget' },
  { type: 'event_box',     icon: MousePointer2, label: 'Event Box',   color: 'bg-pink-900/60 border-pink-700/60',    category: 'widget' },
  { type: 'users_panel',   icon: Users,         label: 'User Mgmt',   color: 'bg-cyan-900/60 border-cyan-700/60',    category: 'special' },
  { type: 'cycling_alarms', icon: Bell,         label: 'Alarms',      color: 'bg-red-900/60 border-red-700/60',      category: 'special' },
  { type: 'audit_trail',   icon: ScrollText,    label: 'Audit Trail', color: 'bg-blue-900/60 border-blue-700/60',    category: 'special' },
  { type: 'sidebar',       icon: PanelLeft,     label: 'Sidebar',     color: 'bg-slate-700/60 border-slate-500/60',  category: 'special' },
]

// Palette categories, rendered as separate labelled groups in the editor's left panel.
// "Special" gathers full-page / panel widgets (user management, alarms, navigation)
// that behave like standalone pages rather than simple building-block widgets.
const PALETTE_CATEGORIES = [
  { key: 'widget',  label: 'Widgets' },
  { key: 'special', label: 'Special Pages' },
]

const DEFAULT_PROPS = {
  label:         { text: 'Label', fontSize: 14, color: '#e2e8f0', bold: false, align: 'left', bgColor: '', border: false, borderColor: '#64748b', borderWidth: 1, unit: '', datetime: false, datetimeFormat: 'datetime', datetimeCustom: '' },
  entry:         { label: '', source: 'plc', plcAddress: '', dataType: 'INT16', unit: '', k: '', decimals: 0, limitMin: '', limitMax: '', trace: false, requireComment: false, editGroup: null },
  graph:         { label: '', source: 'plc', plcAddress: '', dataType: 'REAL', k: '', decimals: 0, color: '#3b82f6', yMin: 0, yMax: 100, timeWindowSec: 60 },
  progress_bar:  { label: '', source: 'plc', plcAddress: '', dataType: 'REAL', k: '', decimals: 0, min: 0, max: 100, unit: '%', orientation: 'horizontal', color: '#1677ff', bgColor: '#e5e7eb', showValue: true, showPercent: true, fontSize: 12 },
  toggle_button: { label: '', source: 'plc', plcAddress: '', labelOn: 'ON', labelOff: 'OFF', colorOn: '#22c55e', colorOff: '#ef4444', readOnly: false, trace: false, editGroup: null },
  toggle_multi:  { label: '', source: 'plc', plcAddress: '', dataType: 'INT16', color: '#1677ff', fontSize: 13, readOnly: false, trace: false, editGroup: null,
                   options: [ { label: 'Option 1', value: 1, color: '' }, { label: 'Option 2', value: 2, color: '' }, { label: 'Option 3', value: 3, color: '' } ] },
  pixmap:        { src: '', alt: '', showWhen: 'none', plcAddress: '' },
  stl_viewer:   { src: '', modelColor: '#4a90d9', background: '#1e1e2e', wireframe: false },
  box:           { borderColor: '#475569', fillColor: 'transparent', borderWidth: 1, borderRadius: 4 },
  button:        { label: 'Button', fontSize: 13, color: '#e2e8f0', bgColor: '#1e293b', bold: false, image: '', icon: '', iconPosition: 'left', iconSize: 20, labelLoggedIn: '', iconLoggedIn: '', plcAddress: '', onClick: 'navigate', targetPage: '', url: '', urlMode: 'overlay', writeAddress: '', writeValue: '', scriptName: '', conditionAddress: '', effectAddress: '', effectValue: 1, editGroup: null },
  toggle_pixmap: { file1: '', file2: '', file3: '', file4: '', stateMode: 'bool', value2: 1, value3: 2, value4: 3, sensible: false, source: 'plc', plcAddress: '', dataType: 'INT16', onClick: 'navigate', targetPage: '', url: '', urlMode: 'overlay', writeAddress: '', writeValue: '', scriptName: '', conditionAddress: '', effectAddress: '', effectValue: 1, editGroup: null },
  grid:          { title: '', rowCount: 8, showRowNumbers: true, source: 'plc', columns: [], structSymbol: '', multiEdit: false, requireComment: false, unit: '', decimals: 0 },
  event_box:     { label: '', plcAddress: '', onClick: 'navigate', targetPage: '', url: '', urlMode: 'overlay', writeAddress: '', writeValue: '', scriptName: '', conditionAddress: '', effectAddress: '', effectValue: 1, editGroup: null },
  cycling_alarms: { cycleInterval: 3000, fontSize: 15, showCode: true, emptyText: '', popupTitle: '' },
  audit_trail:    { title: '', pageSize: 25, eventType: '', showFilters: true, autoRefreshSec: 0, allowExport: true, columns: ['ts', 'user', 'event', 'object', 'address', 'change', 'reason'] },
  users_panel:    {},   // embeds the full User Management page; uses the session token (admin context)
  sidebar:        {},   // content + style live in the global sidebar config (shared across pages)
}
const DEFAULT_SIZE = {
  label:         { w: 120, h: 30 },
  entry:         { w: 200, h: 40 },
  graph:         { w: 300, h: 200 },
  progress_bar:  { w: 240, h: 48 },
  toggle_button: { w: 120, h: 40 },
  toggle_multi:  { w: 140, h: 52 },
  pixmap:        { w: 100, h: 100 },
  stl_viewer:   { w: 320, h: 260 },
  box:           { w: 160, h: 100 },
  button:        { w: 120, h: 40 },
  toggle_pixmap: { w: 80, h: 80 },
  grid:          { w: 360, h: 220 },
  event_box:     { w: 140, h: 40 },
  users_panel:   { w: 640, h: 420 },
  audit_trail:   { w: 720, h: 400 },
  cycling_alarms: { w: 320, h: 44 },
  sidebar:        { w: 96, h: 600 },
}
const WIDGET_COLORS = {
  label: '#0ea5e9', entry: '#8b5cf6', graph: '#10b981', progress_bar: '#3b82f6',
  toggle_button: '#f59e0b', toggle_multi: '#14b8a6',
  pixmap: '#f97316', stl_viewer: '#06b6d4', event_box: '#ec4899',
  box: '#94a3b8', button: '#6366f1', toggle_pixmap: '#eab308', grid: '#d946ef',
  users_panel: '#06b6d4', cycling_alarms: '#dc2626', sidebar: '#64748b', audit_trail: '#1677ff',
}

function snap(val) { return Math.round(val / GRID) * GRID }

// ---------------------------------------------------------------------------
// Palette Item (draggable)
// ---------------------------------------------------------------------------
function PaletteItem({ item }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { isPalette: true, type: item.type },
  })
  const Icon = item.icon
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-3 py-2 rounded border cursor-grab active:cursor-grabbing
        transition-all duration-150 select-none ${item.color}
        hover:brightness-125 ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}`}
      style={{ touchAction: 'none' }}
    >
      <Icon size={13} className="text-gray-700 shrink-0" />
      <span className="text-xs text-gray-700 font-medium truncate">{item.label}</span>
    </div>
  )
}

// A saved library item in the palette — draggable onto the canvas like a built-in
// widget, but it inserts a (fresh-id) COPY of the saved widget(s). A group item
// shows how many widgets it carries.
function LibraryPaletteItem({ item }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${item.id}`,
    data: { isLibrary: true, itemId: item.id },
  })
  const count = Array.isArray(item.widgets) ? item.widgets.length : 0
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={`${item.name}${item.kind === 'group' ? ` · ${count} widgets` : ''}`}
      className={`flex items-center gap-2 px-3 py-2 rounded border cursor-grab active:cursor-grabbing
        transition-all duration-150 select-none bg-teal-900/50 border-teal-700/60
        hover:brightness-125 ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}`}
      style={{ touchAction: 'none' }}
    >
      {item.kind === 'group'
        ? <Package size={13} className="text-gray-700 shrink-0" />
        : <Bookmark size={13} className="text-gray-700 shrink-0" />}
      <span className="text-xs text-gray-700 font-medium truncate flex-1">{item.name}</span>
      {item.kind === 'group' && <span className="text-[9px] text-gray-500 shrink-0">{count}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canvas Widget
//
// Renders the REAL widget (via the shared WidgetContent) so the editor is
// WYSIWYG with the runtime monitor. Editing chrome (selection ring, resize
// handle, drag) is layered on top; the widget itself is pointer-events:none so
// mouse gestures always reach this wrapper.
// ---------------------------------------------------------------------------
function CanvasWidget({ widget, isSelected, showResizeHandle = true, snapEnabled, onBeginInteraction, onGroupMove, onResize, onContextMenu }) {
  const snapV = (v) => (snapEnabled ? snap(v) : Math.round(v))

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    const res = onBeginInteraction(widget.id, additive)
    if (!res || !res.drag) return
    const start = { mx: e.clientX, my: e.clientY }
    const onMove_ = (ev) => onGroupMove(ev.clientX - start.mx, ev.clientY - start.my)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove_)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove_)
    window.addEventListener('mouseup', onUp)
  }

  const handleResizeDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const start = { mx: e.clientX, my: e.clientY, ww: widget.width, wh: widget.height }
    const onR = (ev) => {
      onResize(widget.id,
        snapV(Math.max(40, start.ww + ev.clientX - start.mx)),
        snapV(Math.max(20, start.wh + ev.clientY - start.my))
      )
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onR)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onR)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, widget.id) }}
      style={{
        position: 'absolute', left: widget.x, top: widget.y,
        width: widget.width, height: widget.height, zIndex: widget.zIndex ?? 1,
        cursor: 'move', userSelect: 'none', boxSizing: 'border-box',
      }}
      className="group"
    >
      {/* Real widget preview — non-interactive so drags reach the wrapper.
          Boxed per-widget so a single broken widget shows an inline error
          instead of blanking the whole editor (keyed by id so edits recover). */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <ErrorBoundary compact label={widget.type} resetKeys={[widget.id]}>
          <WidgetContent widget={widget} readOnly={false} editor />
        </ErrorBoundary>
      </div>

      {/* Selection / hover ring (outline via box-shadow — no layout shift) */}
      <div
        className={`absolute inset-0 pointer-events-none transition-shadow duration-75 ${
          isSelected
            ? 'shadow-[0_0_0_1.5px_#1677ff]'
            : 'shadow-[0_0_0_1px_transparent] group-hover:shadow-[0_0_0_1px_#93c5fd]'
        }`}
      />

      {/* Type tag — helps grab transparent widgets (box / event_box) */}
      {!isSelected && (
        <div className="absolute top-0 left-0 px-1 leading-tight text-[8px] font-mono bg-[#1677ff] text-white rounded-br opacity-0 group-hover:opacity-90 pointer-events-none">
          {widget.type}
        </div>
      )}

      {/* Resize handle — hidden in a multi-selection; the group overlay owns
          resizing then so the whole selection scales together. */}
      {isSelected && showResizeHandle && (
        <div
          onMouseDown={handleResizeDown}
          className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-[#1677ff] rounded-sm cursor-se-resize"
          style={{ zIndex: 10 }}
        />
      )}

      {isSelected && (
        <div className="absolute -top-5 left-0 text-[9px] text-[#1677ff] font-mono whitespace-nowrap pointer-events-none">
          {widget.x},{widget.y} · {widget.width}×{widget.height}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group Resize Overlay
// ---------------------------------------------------------------------------
// Drawn over a multi-selection: a dashed bounding box around all selected
// widgets with a single handle at the bottom-right. Dragging it scales the
// whole selection proportionally about the box's top-left corner.
// ---------------------------------------------------------------------------
function GroupResizeOverlay({ widgets, snapEnabled, onBegin, onResize }) {
  if (widgets.length < 2) return null
  const snapV = (v) => (snapEnabled ? snap(v) : Math.round(v))
  const left   = Math.min(...widgets.map(w => w.x))
  const top    = Math.min(...widgets.map(w => w.y))
  const right  = Math.max(...widgets.map(w => w.x + w.width))
  const bottom = Math.max(...widgets.map(w => w.y + w.height))
  const width = right - left, height = bottom - top

  const handleDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const snapshot = onBegin()
    if (!snapshot) return
    const start = { mx: e.clientX, my: e.clientY }
    const { w0, h0 } = snapshot
    const onMove = (ev) => {
      const newW = Math.max(20, snapV(w0 + ev.clientX - start.mx))
      const newH = Math.max(20, snapV(h0 + ev.clientY - start.my))
      onResize(newW / w0, newH / h0)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      style={{ position: 'absolute', left, top, width, height, zIndex: 9997, pointerEvents: 'none' }}
    >
      <div className="absolute inset-0 border border-dashed border-[#1677ff]/70 pointer-events-none" />
      <div className="absolute -top-5 left-0 text-[9px] text-[#1677ff] font-mono whitespace-nowrap pointer-events-none">
        {widgets.length} widgets · {width}×{height}
      </div>
      <div
        onMouseDown={handleDown}
        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-[#1677ff] border border-white rounded-sm cursor-se-resize shadow"
        style={{ pointerEvents: 'auto', zIndex: 10 }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Asset Picker Modal
// ---------------------------------------------------------------------------
function AssetPickerModal({ filter, onSelect, onClose }) {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [err, setErr]           = useState(null)
  const fileInputRef = useRef(null)

  const EXT_IMAGE = new Set(['.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp'])
  const isImage = name => EXT_IMAGE.has(name.slice(name.lastIndexOf('.')).toLowerCase())

  const load = () => {
    setLoading(true)
    assetsApi.list()
      .then(all => setItems(filter === 'image' ? all.filter(a => a.type === 'image')
                          : filter === 'stl'   ? all.filter(a => a.type === 'stl')
                          : all))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [filter])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await assetsApi.upload(file)
      load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleConfirm = () => {
    if (selected) onSelect(selected.url)
  }

  const title = filter === 'image' ? 'Select Image' : filter === 'stl' ? 'Select STL Model' : 'Select Asset'
  const accept = filter === 'image' ? 'image/*' : filter === 'stl' ? '.stl' : 'image/*,.stl'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={15} className="text-[#1677ff]" />
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 btn-secondary py-1 px-2.5 text-xs disabled:opacity-60"
            >
              <Upload size={11} />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleUpload} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {err && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">{err}</div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-[#1677ff] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
              <FolderOpen size={32} />
              <p className="text-xs">No files yet. Upload one to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {items.map(item => (
                <button
                  key={item.name}
                  onClick={() => setSelected(item)}
                  className={`relative rounded-lg border overflow-hidden transition-all duration-100 group
                    ${selected?.name === item.name
                      ? 'border-[#1677ff] shadow-[0_0_0_2px_#1677ff]'
                      : 'border-gray-200 hover:border-gray-300'}`}
                  style={{ aspectRatio: '1' }}
                >
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.name}
                      className="w-full h-full object-contain bg-gray-50 p-1" draggable={false} />
                  ) : (
                    <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center gap-1 p-2">
                      <Box size={24} className="text-cyan-400" />
                      <span className="text-[9px] text-gray-500 font-mono text-center break-all leading-tight px-1">
                        {item.name.replace(/^\d+_/, '')}
                      </span>
                    </div>
                  )}
                  {selected?.name === item.name && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-[#1677ff] rounded-full flex items-center justify-center">
                      <Check size={9} className="text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-white/90 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[8px] text-gray-700 truncate">{item.name.replace(/^\d+_/, '')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-200 shrink-0">
          <p className="text-[10px] text-gray-400">
            {selected ? `Selected: ${selected.name.replace(/^\d+_/, '')}` : 'No file selected'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-xs py-1 px-3">Cancel</button>
            <button onClick={handleConfirm} disabled={!selected} className="btn-primary text-xs py-1 px-3 disabled:opacity-50">
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section (collapsible)
// ---------------------------------------------------------------------------
function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{title}</span>
        {open ? <ChevronUp size={11} className="text-gray-400" /> : <ChevronDown size={11} className="text-gray-400" />}
      </button>
      {open && <div className="p-3 space-y-2">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prop helpers
// ---------------------------------------------------------------------------
function PropField({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-0.5">{label}</label>
      {children}
    </div>
  )
}
const SI = ({ value, onChange, placeholder, type = 'text' }) => (
  <input type={type} className="input-field text-xs py-1"
    value={value ?? ''} onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
    placeholder={placeholder} />
)
const NI = ({ value, onChange }) => (
  <input type="number" className="input-field text-xs py-1" value={value ?? 0} onChange={e => onChange(Number(e.target.value))} />
)
const CI = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <input type="color" value={value ?? '#ffffff'} onChange={e => onChange(e.target.value)}
      className="w-7 h-7 rounded cursor-pointer border border-gray-300 bg-transparent shrink-0" />
    <input type="text" className="input-field text-xs py-1 flex-1" value={value ?? ''} onChange={e => onChange(e.target.value)} />
  </div>
)
const SEL = ({ value, onChange, options }) => (
  <select className="input-field text-xs py-1" value={value ?? ''} onChange={e => onChange(e.target.value)}>
    {options.map(o => typeof o === 'string'
      ? <option key={o} value={o}>{o}</option>
      : <option key={o.value} value={o.value}>{o.label}</option>
    )}
  </select>
)
// ---------------------------------------------------------------------------
// Machines store — the single configured machine (id, name, protocol) fetched
// once so the PLC-address field knows whether it speaks ADS (and can offer the
// symbol browser). Loaded lazily; empty if the backend can't be reached.
// ---------------------------------------------------------------------------
let _machines = null
let _machinesPromise = null
const _machineSubs = new Set()
function loadMachines() {
  if (!_machinesPromise) {
    _machinesPromise = systemApi.getSim()
      .then(d => { _machines = d.machines || []; _machineSubs.forEach(fn => fn(_machines)); return _machines })
      .catch(() => { _machines = []; _machineSubs.forEach(fn => fn(_machines)); return _machines })
  }
  return _machinesPromise
}
function useMachines() {
  const [m, setM] = useState(_machines || [])
  useEffect(() => {
    if (_machines) setM(_machines); else loadMachines()
    const fn = list => setM(list)
    _machineSubs.add(fn)
    return () => { _machineSubs.delete(fn) }
  }, [])
  return m
}
// Data-type set offered in the editor. ADS/OPC-UA addresses carry their own PLC
// type; this is the selectable list for widget variables.
const DATA_TYPES = ['INT16','UINT16','INT32','UINT32','REAL','FLOAT32','LREAL','BOOL','STRING']
const DtSel = ({ v, on }) => (
  <SEL value={v} onChange={on} options={DATA_TYPES} />
)

// Map a TwinCAT/IEC symbol type to the widget's DATA_TYPES set (best effort).
// Returns null for structs/arrays/unknown types so the current dataType is kept.
function adsTypeToDataType(t) {
  const s = String(t || '').toUpperCase().trim()
  if (s === 'BOOL') return 'BOOL'
  if (s === 'SINT' || s === 'INT') return 'INT16'
  if (s === 'BYTE' || s === 'USINT' || s === 'WORD' || s === 'UINT') return 'UINT16'
  if (s === 'DINT') return 'INT32'
  if (s === 'DWORD' || s === 'UDINT') return 'UINT32'
  if (s === 'REAL') return 'REAL'
  if (s === 'LREAL') return 'LREAL'
  if (s.startsWith('STRING') || s.startsWith('WSTRING')) return 'STRING'
  return null
}

// Modal that lists a machine's PLC variables with live filtering — the ADS
// symbol table, or the browsed OPC UA address space (name = NodeId, comment =
// browse path). Picking one returns { name, type } so the caller can fill
// plcAddress (and dataType, when the protocol provides a type).
function SymbolPicker({ machineId, onPick, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, symbols: [] })
  const [q, setQ] = useState('')
  const load = useCallback((refresh = false) => {
    setState(s => ({ ...s, loading: true, error: null }))
    plcApi.symbols(machineId, refresh)
      .then(d => setState({ loading: false, error: null, symbols: d.symbols || [] }))
      .catch(e => setState({ loading: false, error: e.response?.data?.error || e.message, symbols: [] }))
  }, [machineId])
  useEffect(() => { load(false) }, [load])

  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? state.symbols.filter(s => s.name.toLowerCase().includes(needle) || (s.comment || '').toLowerCase().includes(needle))
    : state.symbols
  const MAX = 500
  const shown = filtered.slice(0, MAX)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[520px] max-w-[92vw] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
          <span className="text-sm font-medium text-gray-800">PLC Variables</span>
          <div className="flex items-center gap-1">
            <button onClick={() => load(true)} title="Reload from PLC"
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><RefreshCw size={13} /></button>
            <button onClick={onClose} title="Close"
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={13} /></button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-gray-50 border border-gray-200">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter by name or comment…"
              className="flex-1 bg-transparent text-xs outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {state.loading && <div className="px-4 py-6 text-center text-xs text-gray-400">Loading symbols from PLC…</div>}
          {state.error && <div className="px-4 py-6 text-center text-xs text-red-500">{state.error}</div>}
          {!state.loading && !state.error && shown.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-400">No matching symbols.</div>
          )}
          {!state.loading && !state.error && shown.map(sym => (
            <button key={sym.name} onClick={() => onPick(sym)}
              className="w-full text-left px-4 py-1.5 hover:bg-blue-50 border-b border-gray-50 flex items-baseline gap-2">
              <span className="font-mono text-[11px] text-gray-800 truncate">{sym.name}</span>
              <span className="text-[10px] text-[#1677ff] shrink-0">{sym.type}</span>
              {sym.comment && <span className="text-[10px] text-gray-400 truncate ml-auto">{sym.comment}</span>}
            </button>
          ))}
        </div>
        <div className="px-4 py-1.5 border-t border-gray-100 text-[10px] text-gray-400">
          {state.loading ? '' : `${filtered.length} symbol${filtered.length === 1 ? '' : 's'}${filtered.length > MAX ? ` (showing first ${MAX})` : ''}`}
        </div>
      </div>
    </div>
  )
}

// PLC-address field. For ADS (Beckhoff) and OPC UA machines it adds a "browse
// symbols" button that opens the SymbolPicker (ADS symbol table / OPC UA address
// space); for offset-based protocols it is a plain text input (unchanged
// behaviour). `onPickType`, when given, receives the mapped widget dataType so
// selecting a symbol also sets the data type (ADS only — OPC UA browse carries
// no type info).
function PlcAddressInput({ value, onChange, onPickType, placeholder, small = false }) {
  // Single-machine deployment: the one configured machine drives protocol
  // detection and the symbol browser (no per-widget machine selection any more).
  const machines = useMachines()
  const machine = machines[0]
  const proto = String(machine?.protocol || '').toLowerCase()
  const canBrowse = proto === 'ads' || proto === 'opcua'
  const ph = proto === 'ads' ? 'MAIN.fSpeed' : proto === 'opcua' ? 'ns=4;s=MAIN.fSpeed' : placeholder
  const [open, setOpen] = useState(false)

  const field = small
    ? <input type="text" className="input-field text-[10px] py-0.5 w-full"
        value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={ph} />
    : <SI value={value} onChange={onChange} placeholder={ph} />

  if (!canBrowse) return field
  return (
    <>
      <div className="flex items-center gap-1">
        <div className="flex-1 min-w-0">{field}</div>
        <button onClick={() => setOpen(true)} title="Browse PLC symbols"
          className="shrink-0 flex items-center px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs transition-colors">
          <Search size={11} />
        </button>
      </div>
      {open && <SymbolPicker machineId={machine?.id} onClose={() => setOpen(false)}
        onPick={sym => {
          onChange(sym.name)
          if (onPickType) { const dt = adsTypeToDataType(sym.type); if (dt) onPickType(dt) }
          setOpen(false)
        }} />}
    </>
  )
}

// Variable source (PLC / numbered-list / logged user).
// PLC is wired to the scanner.
const SOURCE_OPTIONS = [
  { value: 'plc',       label: 'PLC' },
  { value: 'list',    label: 'Numbered list' },
  { value: 'session', label: 'Logged user' },
]

// Date-time label formats. Presets follow the browser locale; 'custom' expands a
// token pattern (YYYY MM DD HH mm ss) in LabelWidget.
const DATETIME_FORMAT_OPTIONS = [
  { value: 'datetime',   label: 'Date & time' },
  { value: 'date',       label: 'Date only' },
  { value: 'time',       label: 'Time (with seconds)' },
  { value: 'time_short', label: 'Time (HH:MM)' },
  { value: 'custom',     label: 'Custom pattern…' },
]

// What a 'session' (logged-user) label renders.
const SESSION_FIELD_OPTIONS = [
  { value: 'name_group', label: 'Name + group' },
  { value: 'name',       label: 'Name only' },
  { value: 'group',      label: 'Group only' },
]

// ---------------------------------------------------------------------------
// Reusable prop helpers
// ---------------------------------------------------------------------------
// Text input + "browse assets" button
function ImageField({ label, value, onChange, filter = 'image', onBrowse }) {
  return (
    <PropField label={label}>
      <div className="flex gap-1.5">
        <input type="text" className="input-field text-xs py-1 flex-1 min-w-0"
          value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="URL or browse…" />
        <button
          onClick={() => onBrowse?.(filter, url => onChange(url))}
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs transition-colors"
          title="Browse assets"
        >
          <FolderOpen size={11} />
        </button>
      </div>
    </PropField>
  )
}

// Icon field: accepts an Ant Design icon (via picker, stored as `ant:Name`)
// OR an uploaded image URL (via the asset browser). Kept backward-compatible —
// an existing image URL still shows and edits as before.
function IconField({ label, value, onChange, onBrowse }) {
  const [pick, setPick] = useState(false)
  const ant = isAntIcon(value)
  return (
    <PropField label={label}>
      <div className="flex gap-1.5 items-center">
        <div className="shrink-0 w-7 h-7 flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-600 overflow-hidden">
          {value
            ? (ant
                ? <AntIcon name={antIconName(value)} size={16} />
                : <img src={value} alt="" className="w-full h-full object-contain" />)
            : <span className="text-[9px] text-gray-300">none</span>}
        </div>
        <input type="text" className="input-field text-xs py-1 flex-1 min-w-0"
          value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="ant:Name or image URL" />
        <button onClick={() => setPick(true)} title="Choose Ant icon"
          className="shrink-0 flex items-center px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs transition-colors">
          <Package size={11} />
        </button>
        <button onClick={() => onBrowse?.('image', url => onChange(url))} title="Browse image"
          className="shrink-0 flex items-center px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs transition-colors">
          <FolderOpen size={11} />
        </button>
        {value && (
          <button onClick={() => onChange('')} title="Clear"
            className="shrink-0 flex items-center px-1.5 py-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={11} />
          </button>
        )}
      </div>
      {pick && <AntIconPicker onPick={onChange} onClose={() => setPick(false)} />}
    </PropField>
  )
}

// How a `navigate_url` event opens its URL. 'overlay' is the kiosk-safe default:
// the page shows inside HMI Studio with a "back" button, no browser tabs needed.
const URL_MODE_OPTIONS = [
  { value: 'overlay', label: 'In HMI Studio (with back button)' },
  { value: 'same',    label: 'Same tab' },
  { value: 'newtab',  label: 'New tab (not in kiosk mode)' },
]

// Effect bit value (set / reset) for the post-action flag write.
const EFFECT_VALUE_OPTIONS = [
  { value: '1', label: 'Set (1)' },
  { value: '0', label: 'Reset (0)' },
]

// Click-event model shared by button / pixmap-toggle / event widgets
function EventProps({ p, s, pageOptions = [] }) {
  // Target-page dropdown built from the existing pages; keep any currently-set
  // value even if it's not in the list (e.g. a page deleted or not yet loaded).
  const targetOptions = [{ value: '', label: '— select page —' }, ...pageOptions]
  if (p.targetPage && !pageOptions.some(o => o.value === p.targetPage)) {
    targetOptions.push({ value: p.targetPage, label: `${p.targetPage} (not found)` })
  }
  // Condition + effect apply to every action EXCEPT the operator-session toggles
  // and the no-op (those don't gate on a PLC bit).
  const hasCondEffect = !['none', 'session', 'login', 'logout'].includes(p.onClick)
  return <>
    <PropField label="On Click">
      <SEL value={p.onClick} onChange={v => s('onClick', v)} options={EVENT_OPTIONS} />
    </PropField>
    {p.onClick === 'navigate' && (
      <PropField label="Target Page"><SEL value={p.targetPage} onChange={v => s('targetPage', v)} options={targetOptions} /></PropField>
    )}
    {p.onClick === 'navigate_url' && <>
      <PropField label="URL"><SI value={p.url} onChange={v => s('url', v)} placeholder="https://example.com" /></PropField>
      <PropField label="Open mode">
        <SEL value={p.urlMode ?? 'overlay'} onChange={v => s('urlMode', v)} options={URL_MODE_OPTIONS} />
      </PropField>
    </>}
    {p.onClick === 'write' && <>
      <PropField label="Write Address"><PlcAddressInput value={p.writeAddress} onChange={v => s('writeAddress', v)} placeholder="DB1.DBX0.0" /></PropField>
      <PropField label="Write Value"><SI value={p.writeValue} onChange={v => s('writeValue', v)} /></PropField>
    </>}
    {p.onClick === 'script' && <>
      <PropField label="Script name"><SI value={p.scriptName} onChange={v => s('scriptName', v)} placeholder="example" /></PropField>
      <p className="text-[10px] text-gray-400 leading-snug">Runs <code>data/scripts/&lt;name&gt;.js</code> on the server.</p>
    </>}
    {hasCondEffect && (
      <div className="mt-1 pt-2 border-t border-gray-200 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">Condition &amp; effect (optional)</div>
        <PropField label="Condition (run if bit)">
          <PlcAddressInput value={p.conditionAddress} onChange={v => s('conditionAddress', v)} placeholder="GVL.bEnabled" />
        </PropField>
        <div className="grid grid-cols-2 gap-2">
          <PropField label="Effect address">
            <PlcAddressInput value={p.effectAddress} onChange={v => s('effectAddress', v)} placeholder="GVL.bDone" />
          </PropField>
          <PropField label="Effect value">
            <SEL value={String(p.effectValue ?? 1)} onChange={v => s('effectValue', Number(v))} options={EFFECT_VALUE_OPTIONS} />
          </PropField>
        </div>
      </div>
    )}
  </>
}

// Per-object access is now a GROUP assignment (`editGroup`), not a numeric level.
// Groups travel with the project; we fetch them once and share via a module cache
// so every GroupMultiSel instance (and the multi-edit panel) stays in sync.
let _groupsCache = null
let _groupsPromise = null
function useGroups() {
  const [gs, setGs] = useState(_groupsCache || [])
  useEffect(() => {
    if (_groupsCache) { setGs(_groupsCache); return }
    if (!_groupsPromise) {
      _groupsPromise = groupsApi.list().then(d => { _groupsCache = Array.isArray(d) ? d : []; return _groupsCache })
    }
    _groupsPromise.then(setGs).catch(() => setGs([]))
  }, [])
  return gs
}
// Multi-group selector: a widget may be editable by ANY of several groups (OR).
// Stores a number[] of group ids, or null when nothing is checked (unprotected).
// `mixed` (multi-edit panel) shows nothing checked until the designer overrides.
function GroupMultiSel({ value, onChange, mixed = false, emptyText = 'None (unprotected)' }) {
  const gs = useGroups()
  const selected = editGroupList(value)
  const toggle = (id) => {
    const set = new Set(selected)
    if (set.has(id)) set.delete(id); else set.add(id)
    const arr = gs.map(g => g.id).filter(id => set.has(id)) // keep group order
    onChange(arr.length ? arr : null)
  }
  return (
    <div className="border border-gray-200 rounded p-1.5 space-y-1 max-h-32 overflow-y-auto bg-white">
      {gs.length === 0 && <p className="text-[10px] text-gray-400">No groups defined</p>}
      {mixed && <p className="text-[10px] text-amber-600">mixed — checking a box overrides all</p>}
      {!mixed && selected.length === 0 && gs.length > 0 && (
        <p className="text-[10px] text-gray-400">{emptyText}</p>
      )}
      {gs.map(g => (
        <label key={g.id} className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
          <input type="checkbox" className="accent-blue-500"
            checked={!mixed && selected.includes(g.id)} onChange={() => toggle(g.id)} />
          <span>{g.name}</span>
        </label>
      ))}
    </div>
  )
}

// Checkbox helper
const Chk = ({ checked, onChange, text }) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <input type="checkbox" className="accent-blue-500" checked={!!checked} onChange={e => onChange(e.target.checked)} />
    <span className="text-xs text-gray-500">{text}</span>
  </label>
)

// ---------------------------------------------------------------------------
// Shared variable-source block — the legacy unified `ci_dati_oggetto` model.
// Rendered by every data-bound widget so the source/type/K/limits/level/trace
// options are consistent. Field visibility is toggled per widget via `opts`.
//   source, plcAddress, dataType, k, decimals, limitMin, limitMax,
//   trace, widgetLevel
// The scanner's widgetTransform() already consumes k / round / limitMin / limitMax.
// ---------------------------------------------------------------------------
function VariableProps({ p, s, opts = {} }) {
  const {
    showLimits = true,   // input min/max bounds
    showDecimals = true, // K + decimals (round)
    showTrace = true,    // per-variable trace flag
    showRequireComment = false, // force operator comment on write (writable widgets only)
    showLevel = true,    // password level
    dataType = true,     // data-type selector
    addressLabel = 'PLC Address',
    addressPlaceholder = 'DB1.DBX0.0',
  } = opts
  const source = p.source ?? 'plc'
  return <>
    <PropField label="Source">
      <SEL value={source} onChange={v => s('source', v)} options={SOURCE_OPTIONS} />
    </PropField>
    {source === 'plc' && <>
      <PropField label={addressLabel}><PlcAddressInput value={p.plcAddress} onChange={v => s('plcAddress', v)}onPickType={dataType ? (dt => s('dataType', dt)) : undefined} placeholder={addressPlaceholder} /></PropField>    </>}
    {source === 'list' && (
      <PropField label="List Number"><NI value={p.listNumber} onChange={v => s('listNumber', v)} /></PropField>
    )}
    {source === 'session' && (
      <PropField label="Show"><SEL value={p.sessionField ?? 'name_group'} onChange={v => s('sessionField', v)} options={SESSION_FIELD_OPTIONS} /></PropField>
    )}
    {dataType && source !== 'session' && (
      <PropField label="Data Type"><DtSel v={p.dataType} on={v => s('dataType', v)} /></PropField>
    )}
    {showDecimals && source !== 'session' && (
      <div className="grid grid-cols-2 gap-2">
        <PropField label="K Multiplier"><SI type="number" value={p.k} onChange={v => s('k', v)} placeholder="1" /></PropField>
        <PropField label="Decimals"><NI value={p.decimals} onChange={v => s('decimals', v)} /></PropField>
      </div>
    )}
    {showLimits && (
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Input Min"><SI type="number" value={p.limitMin} onChange={v => s('limitMin', v)} /></PropField>
        <PropField label="Input Max"><SI type="number" value={p.limitMax} onChange={v => s('limitMax', v)} /></PropField>
      </div>
    )}
    {showTrace && (
      <PropField label="Trace"><Chk checked={p.trace} onChange={v => s('trace', v)} text="Trace changes" /></PropField>
    )}
    {showRequireComment && (
      <PropField label="Comment"><Chk checked={p.requireComment} onChange={v => s('requireComment', v)} text="Require comment on write" /></PropField>
    )}
    {showLevel && (
      <PropField label="Edit Groups"><GroupMultiSel value={p.editGroup} onChange={v => s('editGroup', v)} /></PropField>
    )}
  </>
}

// Editor for the Multi Toggle's ordered option list. Each option carries a
// (localizable) label, the value written when selected, and an optional colour.
// The cycle follows this top-to-bottom order; reorder with the arrows.
function ToggleOptionsEditor({ options = [], onChange }) {
  const list = Array.isArray(options) ? options : []
  const update = (i, patch) => onChange(list.map((o, j) => (j === i ? { ...o, ...patch } : o)))
  const remove = (i) => onChange(list.filter((_, j) => j !== i))
  const add = () => {
    const nextVal = list.length ? Math.max(...list.map(o => Number(o.value) || 0)) + 1 : 1
    onChange([...list, { label: `Option ${list.length + 1}`, value: nextVal, color: '' }])
  }
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const copy = list.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    onChange(copy)
  }
  return (
    <div className="space-y-2">
      {list.map((o, i) => (
        <div key={i} className="rounded border border-gray-200 p-2 space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 w-4 text-center shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0"><MultiLangInput value={o.label} onChange={v => update(i, { label: v })} /></div>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
              className="p-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30" title="Move up"><ChevronUp size={12} /></button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}
              className="p-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30" title="Move down"><ChevronDown size={12} /></button>
            <button type="button" onClick={() => remove(i)}
              className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-500" title="Remove"><Trash2 size={12} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2 pl-5">
            <PropField label="Writes value"><NI value={o.value} onChange={v => update(i, { value: v })} /></PropField>
            <PropField label="Color (optional)"><CI value={o.color} onChange={v => update(i, { color: v })} /></PropField>
          </div>
        </div>
      ))}
      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-1 rounded border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700">
        <Plus size={12} /> Add option
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Type-specific props
// ---------------------------------------------------------------------------
function TypeProps({ type, props: p, onChange: op, onBrowse, pageOptions = [] }) {
  const s = (k, v) => op(k, v)
  switch (type) {
    case 'label': return <>
      <PropField label="Text"><MultiLangInput value={p.text} onChange={v => s('text', v)} /></PropField>
      <PropField label="Font Size"><NI value={p.fontSize} onChange={v => s('fontSize', v)} /></PropField>
      <PropField label="Color"><CI value={p.color} onChange={v => s('color', v)} /></PropField>
      <PropField label="Bold">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-blue-500" checked={!!p.bold} onChange={e => s('bold', e.target.checked)} />
          <span className="text-xs text-gray-500">Bold text</span>
        </label>
      </PropField>
      <PropField label="Align"><SEL value={p.align} onChange={v => s('align', v)} options={['left','center','right']} /></PropField>
      <PropField label="Background">
        <div className="flex items-center gap-2">
          <CI value={p.bgColor || '#ffffff'} onChange={v => s('bgColor', v)} />
          {p.bgColor && (
            <button type="button" onClick={() => s('bgColor', '')}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline">clear</button>
          )}
        </div>
      </PropField>
      <PropField label="Border">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-blue-500" checked={!!p.border} onChange={e => s('border', e.target.checked)} />
          <span className="text-xs text-gray-500">Show border</span>
        </label>
      </PropField>
      {p.border && (
        <div className="grid grid-cols-2 gap-2">
          <PropField label="Border Color"><CI value={p.borderColor} onChange={v => s('borderColor', v)} /></PropField>
          <PropField label="Border Width"><NI value={p.borderWidth} onChange={v => s('borderWidth', v)} /></PropField>
        </div>
      )}
      {/* Date / time clock: when enabled the label shows a live, ticking clock and
          ignores the static text and any live binding. */}
      <div className="mt-2 pt-2 border-t border-gray-100">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-1">Date / Time</div>
        <Chk checked={p.datetime} onChange={v => s('datetime', v)} text="Show current date/time (live clock)" />
        {p.datetime && <div className="mt-2 space-y-2">
          <PropField label="Format">
            <SEL value={p.datetimeFormat ?? 'datetime'} onChange={v => s('datetimeFormat', v)} options={DATETIME_FORMAT_OPTIONS} />
          </PropField>
          {p.datetimeFormat === 'custom' && (
            <PropField label="Custom pattern">
              <SI value={p.datetimeCustom} onChange={v => s('datetimeCustom', v)} placeholder="DD/MM/YYYY HH:mm:ss" />
            </PropField>
          )}
          <p className="text-[10px] text-gray-400 leading-snug">Overrides the text and live value. Tokens: YYYY MM DD HH mm ss.</p>
        </div>}
      </div>
      {/* Optional live binding: when a PLC address is set the label shows the
          live value (scaled by K / decimals); otherwise it shows the static Text above. */}
      {!p.datetime && (
      <div className="mt-2 pt-2 border-t border-gray-100">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-1">Live Value (optional)</div>
        <VariableProps p={p} s={s} opts={{ showLimits: false, showTrace: false, showLevel: false }} />
        <PropField label="Unit"><SI value={p.unit} onChange={v => s('unit', v)} placeholder="e.g. °C, bar, rpm" /></PropField>
      </div>
      )}
    </>
    case 'entry': return <>
      <PropField label="Label"><MultiLangInput value={p.label} onChange={v => s('label', v)} /></PropField>
      <PropField label="Unit"><SI value={p.unit} onChange={v => s('unit', v)} /></PropField>
      <VariableProps p={p} s={s} opts={{ showRequireComment: true }} />
    </>
    case 'graph': return <>
      <PropField label="Label"><MultiLangInput value={p.label} onChange={v => s('label', v)} /></PropField>
      <VariableProps p={p} s={s} opts={{ showLimits: false, showTrace: false, showLevel: false }} />
      <PropField label="Line Color"><CI value={p.color} onChange={v => s('color', v)} /></PropField>
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Y Min"><NI value={p.yMin} onChange={v => s('yMin', v)} /></PropField>
        <PropField label="Y Max"><NI value={p.yMax} onChange={v => s('yMax', v)} /></PropField>
      </div>
      <PropField label="Time Window (s)"><NI value={p.timeWindowSec} onChange={v => s('timeWindowSec', v)} /></PropField>
    </>
    case 'progress_bar': return <>
      <PropField label="Label"><MultiLangInput value={p.label} onChange={v => s('label', v)} /></PropField>
      <VariableProps p={p} s={s} opts={{ showLimits: false, showTrace: false, showLevel: false }} />
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Min"><SI type="number" value={p.min} onChange={v => s('min', v)} /></PropField>
        <PropField label="Max"><SI type="number" value={p.max} onChange={v => s('max', v)} /></PropField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Unit"><SI value={p.unit} onChange={v => s('unit', v)} placeholder="%" /></PropField>
        <PropField label="Orientation">
          <SEL value={p.orientation} onChange={v => s('orientation', v)} options={[
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical',   label: 'Vertical' },
          ]} />
        </PropField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Fill Color"><CI value={p.color} onChange={v => s('color', v)} /></PropField>
        <PropField label="Track Color"><CI value={p.bgColor} onChange={v => s('bgColor', v)} /></PropField>
      </div>
      <PropField label="Text size"><NI value={p.fontSize} onChange={v => s('fontSize', v)} /></PropField>
      <PropField label="Readout"><Chk checked={p.showValue} onChange={v => s('showValue', v)} text="Show value" /></PropField>
      {p.showValue && (
        <PropField label="Readout format"><Chk checked={p.showPercent} onChange={v => s('showPercent', v)} text="As percent (else raw value + unit)" /></PropField>
      )}
    </>
    case 'toggle_button': return <>
      <PropField label="Label"><MultiLangInput value={p.label} onChange={v => s('label', v)} /></PropField>
      <VariableProps p={p} s={s} opts={{ dataType: false, showDecimals: false, showLimits: false }} />
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Label ON"><MultiLangInput value={p.labelOn} onChange={v => s('labelOn', v)} /></PropField>
        <PropField label="Label OFF"><MultiLangInput value={p.labelOff} onChange={v => s('labelOff', v)} /></PropField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Color ON"><CI value={p.colorOn} onChange={v => s('colorOn', v)} /></PropField>
        <PropField label="Color OFF"><CI value={p.colorOff} onChange={v => s('colorOff', v)} /></PropField>
      </div>
      <PropField label="Read-only"><Chk checked={p.readOnly} onChange={v => s('readOnly', v)} text="Display only (not clickable)" /></PropField>
    </>
    case 'toggle_multi': return <>
      <PropField label="Caption (optional)"><MultiLangInput value={p.label} onChange={v => s('label', v)} /></PropField>
      <VariableProps p={p} s={s} opts={{ showDecimals: false, showLimits: false, showLevel: false }} />
      <div className="mt-2 pt-2 border-t border-gray-100">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-1">Options (cycled on click)</div>
        <p className="text-[10px] text-gray-400 leading-snug mb-2">
          Each click advances to the next option and writes its value to the linked variable.
          The option whose value matches the live value is shown as active.
        </p>
        <ToggleOptionsEditor options={p.options} onChange={v => s('options', v)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Default Color"><CI value={p.color} onChange={v => s('color', v)} /></PropField>
        <PropField label="Text Size"><NI value={p.fontSize} onChange={v => s('fontSize', v)} /></PropField>
      </div>
      <PropField label="Read-only"><Chk checked={p.readOnly} onChange={v => s('readOnly', v)} text="Display only (not clickable)" /></PropField>
      <PropField label="Edit Groups"><GroupMultiSel value={p.editGroup} onChange={v => s('editGroup', v)} /></PropField>
    </>
    case 'pixmap': return <>
      <PropField label="Image">
        <div className="flex gap-1.5">
          <input type="text" className="input-field text-xs py-1 flex-1 min-w-0"
            value={p.src ?? ''} onChange={e => s('src', e.target.value)}
            placeholder="URL or browse…" />
          <button
            onClick={() => onBrowse?.('image', url => s('src', url))}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs transition-colors"
            title="Browse assets"
          >
            <FolderOpen size={11} />
          </button>
        </div>
      </PropField>
      <PropField label="Alt Text"><SI value={p.alt} onChange={v => s('alt', v)} /></PropField>
      <PropField label="Show When">
        <SEL value={p.showWhen} onChange={v => s('showWhen', v)} options={['none','true','false']} />
      </PropField>
      {p.showWhen !== 'none' && <>
        <PropField label="PLC Address"><PlcAddressInput value={p.plcAddress} onChange={v => s('plcAddress', v)}/></PropField>      </>}
    </>
    case 'stl_viewer': return <>
      <PropField label="STL File">
        <div className="flex gap-1.5">
          <input type="text" className="input-field text-xs py-1 flex-1 min-w-0"
            value={p.src ?? ''} onChange={e => s('src', e.target.value)}
            placeholder="URL or browse…" />
          <button
            onClick={() => onBrowse?.('stl', url => s('src', url))}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs transition-colors"
            title="Browse STL files"
          >
            <FolderOpen size={11} />
          </button>
        </div>
      </PropField>
      <PropField label="Model Color"><CI value={p.modelColor} onChange={v => s('modelColor', v)} /></PropField>
      <PropField label="Background"><CI value={p.background} onChange={v => s('background', v)} /></PropField>
      <PropField label="Wireframe">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-blue-500" checked={!!p.wireframe} onChange={e => s('wireframe', e.target.checked)} />
          <span className="text-xs text-gray-500">Wireframe mode</span>
        </label>
      </PropField>
    </>
    case 'box': return <>
      <PropField label="Border Color"><CI value={p.borderColor} onChange={v => s('borderColor', v)} /></PropField>
      <PropField label="Fill Color"><CI value={p.fillColor} onChange={v => s('fillColor', v)} /></PropField>
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Border Width"><NI value={p.borderWidth} onChange={v => s('borderWidth', v)} /></PropField>
        <PropField label="Radius"><NI value={p.borderRadius} onChange={v => s('borderRadius', v)} /></PropField>
      </div>
    </>
    case 'button': return <>
      <PropField label="Label"><MultiLangInput value={p.label} onChange={v => s('label', v)} /></PropField>
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Font Size"><NI value={p.fontSize} onChange={v => s('fontSize', v)} /></PropField>
        <PropField label="Text Color"><CI value={p.color} onChange={v => s('color', v)} /></PropField>
      </div>
      <PropField label="Background"><CI value={p.bgColor} onChange={v => s('bgColor', v)} /></PropField>
      <PropField label="Bold">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-blue-500" checked={!!p.bold} onChange={e => s('bold', e.target.checked)} />
          <span className="text-xs text-gray-500">Bold text</span>
        </label>
      </PropField>
      <ImageField label="Background Image" value={p.image} onChange={v => s('image', v)} onBrowse={onBrowse} />
      <IconField label="Icon" value={p.icon} onChange={v => s('icon', v)} onBrowse={onBrowse} />
      {p.icon && (
        <div className="grid grid-cols-2 gap-2">
          <PropField label="Icon Position">
            <SEL value={p.iconPosition} onChange={v => s('iconPosition', v)} options={[
              { value: 'left',   label: 'Left' },
              { value: 'right',  label: 'Right' },
              { value: 'top',    label: 'Top' },
              { value: 'bottom', label: 'Bottom' },
            ]} />
          </PropField>
          <PropField label="Icon Size"><NI value={p.iconSize} onChange={v => s('iconSize', v)} /></PropField>
        </div>
      )}
      <EventProps p={p} s={s} pageOptions={pageOptions} />
      {p.onClick === 'session' && (
        <div className="mt-1 pt-2 border-t border-gray-200 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Logged-in appearance (logout)</div>
          <p className="text-[10px] text-gray-400 leading-snug">
            The Label &amp; Icon above are shown when no operator is logged in (the “log in” state).
            Set these to change the button once an operator is logged in; leave blank to keep the same.
          </p>
          <PropField label="Label (logged in)"><MultiLangInput value={p.labelLoggedIn} onChange={v => s('labelLoggedIn', v)} /></PropField>
          <IconField label="Icon (logged in)" value={p.iconLoggedIn} onChange={v => s('iconLoggedIn', v)} onBrowse={onBrowse} />
        </div>
      )}
      <PropField label="Edit Groups"><GroupMultiSel value={p.editGroup} onChange={v => s('editGroup', v)} /></PropField>
    </>
    case 'toggle_pixmap': return <>
      <PropField label="Mode">
        <SEL value={p.stateMode} onChange={v => s('stateMode', v)} options={[
          { value: 'bool', label: '2 states (bool)' },
          { value: 'multi', label: 'Multi-state (value)' },
        ]} />
      </PropField>
      <ImageField label="Image — state 1" value={p.file1} onChange={v => s('file1', v)} onBrowse={onBrowse} />
      <ImageField label="Image — state 2" value={p.file2} onChange={v => s('file2', v)} onBrowse={onBrowse} />
      {p.stateMode === 'multi' && <>
        <div className="grid grid-cols-2 gap-2">
          <PropField label="Value → state 2"><NI value={p.value2} onChange={v => s('value2', v)} /></PropField>
          <PropField label="Value → state 3"><NI value={p.value3} onChange={v => s('value3', v)} /></PropField>
        </div>
        <ImageField label="Image — state 3" value={p.file3} onChange={v => s('file3', v)} onBrowse={onBrowse} />
        <ImageField label="Image — state 4" value={p.file4} onChange={v => s('file4', v)} onBrowse={onBrowse} />
        <PropField label="Value → state 4"><NI value={p.value4} onChange={v => s('value4', v)} /></PropField>
      </>}
      <VariableProps p={p} s={s} opts={{ showDecimals: false, showLimits: false, showTrace: false, showLevel: false }} />
      <PropField label="Clickable">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-blue-500" checked={!!p.sensible} onChange={e => s('sensible', e.target.checked)} />
          <span className="text-xs text-gray-500">Responds to clicks</span>
        </label>
      </PropField>
      {p.sensible && <>
        <EventProps p={p} s={s} pageOptions={pageOptions} />
        <PropField label="Edit Groups"><GroupMultiSel value={p.editGroup} onChange={v => s('editGroup', v)} /></PropField>
      </>}
    </>
    case 'grid': return <GridPropsEditor p={p} onChange={s} />
    case 'event_box': return <>
      <PropField label="Label"><MultiLangInput value={p.label} onChange={v => s('label', v)} /></PropField>
      <EventProps p={p} s={s} pageOptions={pageOptions} />
      <PropField label="Edit Groups"><GroupMultiSel value={p.editGroup} onChange={v => s('editGroup', v)} /></PropField>
    </>
    case 'cycling_alarms': return <>
      <div className="grid grid-cols-2 gap-2">
        <PropField label="Cycle interval (ms)"><NI value={p.cycleInterval} onChange={v => s('cycleInterval', v)} /></PropField>
        <PropField label="Text size"><NI value={p.fontSize} onChange={v => s('fontSize', v)} /></PropField>
      </div>
      <PropField label="Alarm code"><Chk checked={p.showCode} onChange={v => s('showCode', v)} text="Show code" /></PropField>
      <PropField label="«No alarms» text"><SI value={p.emptyText} onChange={v => s('emptyText', v)} placeholder="Auto (translated)" /></PropField>
      <PropField label="Alarm popup title"><SI value={p.popupTitle} onChange={v => s('popupTitle', v)} placeholder="Auto (translated)" /></PropField>
    </>
    case 'audit_trail': return <AuditTrailPropsEditor p={p} s={s} />
    case 'sidebar': return <SidebarConfigEditor pageOptions={pageOptions} onBrowse={onBrowse} />
    default: return <p className="text-xs text-gray-400">No configurable props.</p>
  }
}

// ---------------------------------------------------------------------------
// Audit trail widget props. Event names here are the English designer labels;
// the runtime widget shows them translated.
// ---------------------------------------------------------------------------
const AUDIT_EVENT_LABELS = {
  512: 'Value changed', 513: 'Login', 514: 'Logout', 516: 'Account locked', 517: 'Script run',
  612: 'User created', 613: 'User deleted', 614: 'User modified', 615: 'Password changed',
  616: 'User disabled', 617: 'User enabled',
}
const AUDIT_COLUMN_LABELS = {
  ts: 'Time', user: 'User', event: 'Event', object: 'Object (page › widget / account)',
  address: 'PLC address', change: 'Change (old → new)', reason: 'Reason / comment',
}
function AuditTrailPropsEditor({ p, s }) {
  const cols = Array.isArray(p.columns) && p.columns.length ? p.columns : AUDIT_COLUMNS
  const toggleCol = (c, on) => {
    const next = AUDIT_COLUMNS.filter((k) => (k === c ? on : cols.includes(k)))
    s('columns', next.length ? next : [c]) // never allow zero columns
  }
  return <>
    <PropField label="Title"><MultiLangInput value={p.title} onChange={v => s('title', v)} /></PropField>
    <p className="text-[10px] text-gray-400 -mt-1">Empty → “Audit trail”, translated.</p>
    <div className="grid grid-cols-2 gap-2">
      <PropField label="Rows per page"><NI value={p.pageSize} onChange={v => s('pageSize', v)} /></PropField>
      <PropField label="Auto-refresh (s)"><NI value={p.autoRefreshSec} onChange={v => s('autoRefreshSec', v)} /></PropField>
    </div>
    <p className="text-[10px] text-gray-400 -mt-1">Auto-refresh 0 = off (operator uses the refresh button).</p>
    <PropField label="Events">
      <SEL value={p.eventType ?? ''} onChange={v => s('eventType', v)} options={[
        { value: '', label: 'All (operator can filter)' },
        ...AUDIT_EVENTS.map(e => ({ value: String(e.code), label: `Only: ${AUDIT_EVENT_LABELS[e.code]}` })),
      ]} />
    </PropField>
    <PropField label="Filters"><Chk checked={p.showFilters !== false} onChange={v => s('showFilters', v)} text="Show filter bar (event, user, text, dates)" /></PropField>
    <PropField label="Export"><Chk checked={p.allowExport !== false} onChange={v => s('allowExport', v)} text="CSV export button" /></PropField>
    <PropField label="Columns">
      <div className="space-y-1">
        {AUDIT_COLUMNS.map(c => (
          <Chk key={c} checked={cols.includes(c)} onChange={v => toggleCol(c, v)} text={AUDIT_COLUMN_LABELS[c]} />
        ))}
      </div>
    </PropField>
    <p className="text-[10px] text-gray-400 leading-snug">
      At runtime the operator must log in with a group that has the “View audit trail”
      permission (Groups page). Edit-mode groups have it automatically.
    </p>
  </>
}

// ---------------------------------------------------------------------------
// Sidebar config editor — edits the GLOBAL shared sidebar (buttons + style).
// Changes preview live on the canvas (setLocalConfig) and persist on Save.
// ---------------------------------------------------------------------------
function SidebarConfigEditor({ pageOptions = [], onBrowse }) {
  const [cfg, setCfg] = useState(() => ({ ...DEFAULT_SIDEBAR, ...getSidebarConfig() }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    ensureSidebarLoaded().then(c => { if (c) setCfg({ ...DEFAULT_SIDEBAR, ...c }) })
  }, [])

  // Apply a change to local state AND the live-preview store.
  const apply = (next) => { setCfg(next); setLocalConfig(next); setDirty(true); setSaved(false) }
  const set = (k, v) => apply({ ...cfg, [k]: v })

  const buttons = cfg.buttons ?? []
  const setBtn = (i, k, v) => apply({ ...cfg, buttons: buttons.map((b, idx) => idx === i ? { ...b, [k]: v } : b) })
  const addBtn = () => apply({ ...cfg, buttons: [...buttons, { id: `sb_${buttons.length}_${Math.round(performance.now())}`, label: '', icon: '', targetPage: '' }] })
  const delBtn = (i) => apply({ ...cfg, buttons: buttons.filter((_, idx) => idx !== i) })
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= buttons.length) return
    const arr = buttons.slice()
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    apply({ ...cfg, buttons: arr })
  }

  const save = async () => {
    setSaving(true)
    try { await saveSidebarConfig(cfg); setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500) }
    catch (e) { alert('Save failed: ' + (e.response?.data?.error ?? e.message)) }
    finally { setSaving(false) }
  }

  const targetOptions = [{ value: '', label: '— select page —' }, ...pageOptions]

  return <>
    <div className="rounded bg-blue-50 border border-blue-200 text-blue-700 text-[11px] px-2 py-1.5 mb-1">
      Shared across all pages — changes apply everywhere this sidebar is placed.
    </div>
    <div className="grid grid-cols-2 gap-2">
      <PropField label="Orientation">
        <SEL value={cfg.orientation ?? 'vertical'} onChange={v => set('orientation', v)}
          options={[{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }]} />
      </PropField>
      <PropField label="Align">
        <SEL value={cfg.align} onChange={v => set('align', v)} options={[{ value: 'start', label: 'Start' }, { value: 'center', label: 'Center' }]} />
      </PropField>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <PropField label="Background"><CI value={cfg.bgColor} onChange={v => set('bgColor', v)} /></PropField>
      <PropField label="Text color"><CI value={cfg.textColor} onChange={v => set('textColor', v)} /></PropField>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <PropField label="Active color"><CI value={cfg.activeColor} onChange={v => set('activeColor', v)} /></PropField>
      <PropField label="Icon size"><NI value={cfg.iconSize} onChange={v => set('iconSize', v)} /></PropField>
    </div>
    <PropField label={(cfg.orientation ?? 'vertical') === 'horizontal' ? 'Button width' : 'Button height'}>
      <NI value={cfg.buttonSize ?? cfg.buttonHeight ?? 56} onChange={v => set('buttonSize', v)} />
    </PropField>
    <PropField label="Labels"><Chk checked={cfg.showLabels} onChange={v => set('showLabels', v)} text="Show labels under icons" /></PropField>

    <div className="mt-1 pt-2 border-t border-gray-200">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">Buttons</div>
        <button onClick={addBtn} className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"><Plus size={11} /> Add</button>
      </div>
      {buttons.length === 0 && <p className="text-xs text-gray-400">No buttons yet.</p>}
      <div className="space-y-2">
        {buttons.map((b, i) => (
          <div key={b.id} className="rounded border border-gray-200 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">#{i + 1}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp size={12} /></button>
                <button onClick={() => move(i, 1)} disabled={i === buttons.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown size={12} /></button>
                <button onClick={() => delBtn(i)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>
              </div>
            </div>
            <PropField label="Label"><MultiLangInput value={b.label} onChange={v => setBtn(i, 'label', v)} /></PropField>
            <PropField label="Target page"><SEL value={b.targetPage} onChange={v => setBtn(i, 'targetPage', v)} options={targetOptions} /></PropField>
            <IconField label="Icon" value={b.icon} onChange={v => setBtn(i, 'icon', v)} onBrowse={onBrowse} />
          </div>
        ))}
      </div>
    </div>

    <button onClick={save} disabled={saving}
      className="btn-primary w-full mt-2 flex items-center justify-center gap-2 disabled:opacity-60">
      {saving ? 'Saving…' : saved ? 'Saved ✓' : dirty ? 'Save sidebar *' : 'Save sidebar'}
    </button>
  </>
}

// ---------------------------------------------------------------------------
// Properties Panel
// ---------------------------------------------------------------------------
function GridPropsEditor({ p, onChange }) {
  const cols = p.columns ?? []
  const isStruct = p.source === 'struct'
  const addCol = () => onChange('columns', prev => [...(prev ?? []), isStruct
    ? { label: '', field: '', dataType: 'REAL', editable: false, unit: '', decimals: 0 }
    : { label: '', plcAddress: '', dataType: 'REAL', unit: '', decimals: 0 }])
  const upd = (i, k, v) => onChange('columns', prev => (prev ?? []).map((c, idx) => idx === i ? { ...c, [k]: v } : c))
  const del = i => onChange('columns', prev => (prev ?? []).filter((_, idx) => idx !== i))

  // "Detect fields": read the struct array symbol from the PLC and replace the
  // columns with its scalar members (ADS only). Non-editable by default.
  const machine = useMachines()[0]
  const [detect, setDetect] = useState({ loading: false, error: null })
  const detectFields = () => {
    if (!p.structSymbol) { setDetect({ loading: false, error: 'Set the struct array symbol first' }); return }
    setDetect({ loading: true, error: null })
    plcApi.structFields(machine?.id, p.structSymbol)
      .then(d => {
        const fields = d.fields || []
        if (!fields.length) { setDetect({ loading: false, error: 'No scalar fields found' }); return }
        onChange('columns', () => fields.map(f => ({ label: f.field, field: f.field, dataType: f.dataType || 'REAL', editable: false, unit: '', decimals: 0 })))
        setDetect({ loading: false, error: null })
      })
      .catch(e => setDetect({ loading: false, error: e.response?.data?.error || e.message }))
  }

  return <>
    <PropField label="Title"><SI value={p.title} onChange={v => onChange('title', v)} /></PropField>
    <PropField label="Source">
      <SEL value={p.source ?? 'plc'} onChange={v => onChange('source', v)} options={[
        { value: 'plc', label: 'PLC columns' },
        { value: 'struct', label: 'PLC array of struct (ADS)' },
      ]} />
    </PropField>
    {isStruct && <>
      <PropField label="Struct array symbol (ARRAY OF ST_…)">
        <PlcAddressInput value={p.structSymbol} onChange={v => onChange('structSymbol', v)} placeholder="GVL.aRecipes" />
      </PropField>
      <div className="flex items-center justify-between">
        <button onClick={detectFields} disabled={detect.loading}
          className="flex items-center gap-1 text-[10px] text-[#1677ff] hover:text-[#4096ff] disabled:opacity-50">
          <RefreshCw size={9} className={detect.loading ? 'animate-spin' : ''} /> {detect.loading ? 'Reading PLC…' : 'Detect fields'}
        </button>
        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-500">
          <input type="checkbox" className="accent-[#1677ff]" checked={!!p.multiEdit} onChange={e => onChange('multiEdit', e.target.checked)} />
          Row checkboxes (multi-row edit)
        </label>
      </div>
      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-500">
        <input type="checkbox" className="accent-[#1677ff]" checked={!!p.requireComment} onChange={e => onChange('requireComment', e.target.checked)} />
        Require comment on write
      </label>
      {detect.error && <div className="text-[10px] text-red-500">{detect.error}</div>}
    </>}
    <div className="grid grid-cols-2 gap-2">
      <PropField label="Rows"><NI value={p.rowCount} onChange={v => onChange('rowCount', v)} /></PropField>
      <PropField label="Row #">
        <label className="flex items-center gap-2 cursor-pointer h-7">
          <input type="checkbox" className="accent-blue-500" checked={!!p.showRowNumbers} onChange={e => onChange('showRowNumbers', e.target.checked)} />
          <span className="text-xs text-gray-500">Show</span>
        </label>
      </PropField>
    </div>
    <div className="flex items-center justify-between pt-1">
      <span className="text-[10px] text-gray-400">Columns ({cols.length})</span>
      <button onClick={addCol} className="flex items-center gap-1 text-[10px] text-[#1677ff] hover:text-[#4096ff]">
        <Plus size={9} /> Add Column
      </button>
    </div>
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {cols.map((col, i) => (
        <div key={i} className="border border-gray-200 rounded p-2 space-y-1.5 relative text-[10px]">
          <button onClick={() => del(i)} className="absolute top-1.5 right-1.5 text-red-500 hover:text-red-400"><X size={9} /></button>
          <div className="pr-4"><label className="block text-[9px] text-gray-400 mb-0.5">Header</label>
            <input type="text" className="input-field text-[10px] py-0.5" value={col.label} onChange={e => upd(i,'label',e.target.value)} /></div>
          {isStruct ? <>
            <div><label className="block text-[9px] text-gray-400 mb-0.5">Struct field</label>
              <input type="text" className="input-field text-[10px] py-0.5" value={col.field ?? ''} onChange={e => upd(i,'field',e.target.value)} placeholder="SetPoint" /></div>
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-500">
              <input type="checkbox" className="accent-[#1677ff]" checked={!!col.editable} onChange={e => upd(i,'editable',e.target.checked)} />
              Editable (operator can write this column)
            </label>
          </> : (
            <div><label className="block text-[9px] text-gray-400 mb-0.5">PLC Base Address (reads base[0..rows])</label>
              <PlcAddressInput small value={col.plcAddress} onChange={v => upd(i,'plcAddress',v)}onPickType={dt => upd(i,'dataType',dt)} /></div>
          )}
          <div className="grid grid-cols-2 gap-1">
            <div><label className="block text-[9px] text-gray-400 mb-0.5">Type</label>
              <select className="input-field text-[10px] py-0.5" value={col.dataType} onChange={e => upd(i,'dataType',e.target.value)}>
                {DATA_TYPES.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><label className="block text-[9px] text-gray-400 mb-0.5">Unit</label>
              <input type="text" className="input-field text-[10px] py-0.5" value={col.unit} onChange={e => upd(i,'unit',e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div><label className="block text-[9px] text-gray-400 mb-0.5">K</label>
              <input type="number" className="input-field text-[10px] py-0.5" value={col.k ?? ''} onChange={e => upd(i,'k',e.target.value)} placeholder="1" /></div>
            <div><label className="block text-[9px] text-gray-400 mb-0.5">Dec</label>
              <input type="number" className="input-field text-[10px] py-0.5" value={col.decimals} onChange={e => upd(i,'decimals',Number(e.target.value))} /></div>
          </div>
        </div>
      ))}
    </div>
  </>
}

// ---------------------------------------------------------------------------
// Multi-selection common-property editing
// ---------------------------------------------------------------------------
// Properties safe to bulk-edit across a multi-selection. Restricted to
// primitive-valued visual props so "mixed" detection is a plain equality check —
// bindings/PLC addresses and multilang text are intentionally excluded.
const MULTI_PROPS = [
  // — Text —
  { key: 'fontSize',     label: 'Font Size',         kind: 'num' },
  { key: 'color',        label: 'Text / Line Color', kind: 'color' },
  { key: 'bgColor',      label: 'Background',         kind: 'color' },
  { key: 'bold',         label: 'Bold',              kind: 'bool' },
  { key: 'align',        label: 'Align',             kind: 'sel', options: ['left', 'center', 'right'] },
  // — Border / fill —
  { key: 'border',       label: 'Show Border',       kind: 'bool' },
  { key: 'borderColor',  label: 'Border Color',      kind: 'color' },
  { key: 'borderWidth',  label: 'Border Width',      kind: 'num' },
  { key: 'borderRadius', label: 'Radius',            kind: 'num' },
  { key: 'fillColor',    label: 'Fill Color',        kind: 'color' },
  // — Icon —
  { key: 'iconSize',     label: 'Icon Size',         kind: 'num' },
  { key: 'iconPosition', label: 'Icon Position',     kind: 'sel', options: ['left', 'right'] },
  // — Toggle colors / layout —
  { key: 'colorOn',      label: 'Color ON',          kind: 'color' },
  { key: 'colorOff',     label: 'Color OFF',         kind: 'color' },
  { key: 'orientation',  label: 'Orientation',       kind: 'sel', options: ['horizontal', 'vertical'] },
  // — Behaviour / access —
  { key: 'readOnly',     label: 'Read Only',         kind: 'bool' },
  { key: 'editGroup',    label: 'Edit Groups',       kind: 'group' },
]

// Number input that shows blank with a "mixed" placeholder when the selection's
// values differ; typing a value applies it to the whole selection.
const MultiNum = ({ value, onChange }) => (
  <input type="number" className="input-field text-xs py-1"
    value={value ?? ''} placeholder={value === undefined ? 'mixed' : ''}
    onChange={e => { if (e.target.value !== '') onChange(Number(e.target.value)) }} />
)

// One common-property editor; `value === undefined` means the selection is mixed.
function MultiField({ def, value, onChange }) {
  const mixed = value === undefined
  switch (def.kind) {
    case 'num':
      return <MultiNum value={value} onChange={onChange} />
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input type="color" value={typeof value === 'string' ? value : '#ffffff'}
            onChange={e => onChange(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-gray-300 bg-transparent shrink-0" />
          <input type="text" className="input-field text-xs py-1 flex-1"
            value={mixed ? '' : (value ?? '')} placeholder={mixed ? 'mixed' : ''}
            onChange={e => onChange(e.target.value)} />
        </div>
      )
    case 'bool':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-blue-500"
            ref={el => { if (el) el.indeterminate = mixed }}
            checked={!!value} onChange={e => onChange(e.target.checked)} />
          <span className="text-xs text-gray-500">{mixed ? 'mixed' : (value ? 'On' : 'Off')}</span>
        </label>
      )
    case 'sel':
      return (
        <select className="input-field text-xs py-1" value={mixed ? '' : String(value)}
          onChange={e => onChange(def.numeric ? Number(e.target.value) : e.target.value)}>
          {mixed && <option value="" disabled>mixed</option>}
          {def.options.map(o => <option key={o} value={o}>{String(o)}</option>)}
        </select>
      )
    case 'group':
      return <GroupMultiSel mixed={mixed} value={value} onChange={onChange} />
    default:
      return null
  }
}

// Panel shown when 2+ widgets are selected — edit geometry and any visual
// property the whole selection shares. `onChange` takes a widget-mutator and
// applies it to every selected widget (see handleMultiChange).
function MultiEditPanel({ selection, onChange, onDelete }) {
  // Common value across the selection for a getter, or undefined if they differ.
  // Array-aware so multi-valued props (e.g. editGroup lists) compare by contents.
  const eq = (a, b) => (Array.isArray(a) && Array.isArray(b))
    ? a.length === b.length && a.every((x, i) => x === b[i])
    : a === b
  const common = (getter) => {
    const first = getter(selection[0])
    return selection.every(w => eq(getter(w), first)) ? first : undefined
  }
  const setGeom = (k, v) => onChange(w => ({ ...w, [k]: Math.max(0, v) }))
  const setProp = (k, v) => onChange(w => ({ ...w, props: { ...w.props, [k]: v } }))

  // Does this widget's KIND support the prop? Gate on the type's defaults rather
  // than the live props object: widgets created before a prop existed won't have
  // the key stored, yet the kind still supports it (e.g. a label's border). The
  // live props are a fallback for widgets whose type carries extra keys (library).
  const supports = (w, key) =>
    (DEFAULT_PROPS[w.type] && Object.prototype.hasOwnProperty.call(DEFAULT_PROPS[w.type], key)) ||
    (w.props && Object.prototype.hasOwnProperty.call(w.props, key))
  // Current value, falling back to the type default when the key isn't stored —
  // so a widget missing the key reads as its default instead of forcing "mixed".
  const propVal = (w, key) => (w.props && Object.prototype.hasOwnProperty.call(w.props, key))
    ? w.props[key]
    : DEFAULT_PROPS[w.type]?.[key]

  // A prop is offered only if EVERY selected widget's kind supports it — so a
  // mixed selection (e.g. a box + a label) only surfaces what they genuinely share.
  const shared = MULTI_PROPS.filter(pd => selection.every(w => supports(w, pd.key)))

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between shrink-0">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Multiple Selection</p>
          <p className="text-[10px] text-gray-400">{selection.length} widgets — edits apply to all</p>
        </div>
        <button onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors" title="Delete selection">
          <Trash2 size={12} />
        </button>
      </div>
      <div className="p-3 space-y-3 flex-1">
        <Section title="Geometry">
          <div className="grid grid-cols-2 gap-2">
            {[['x', 'X'], ['y', 'Y'], ['width', 'W'], ['height', 'H']].map(([k, lbl]) => (
              <PropField key={k} label={lbl}>
                <MultiNum value={common(w => w[k])} onChange={v => setGeom(k, v)} />
              </PropField>
            ))}
          </div>
          <p className="text-[9px] text-gray-400 leading-snug">Blank = values differ. Setting W/H sizes all alike; use the toolbar align/distribute tools for positioning.</p>
        </Section>

        <Section title="Common Properties">
          {shared.length === 0
            ? <p className="text-[10px] text-gray-400">The selected widgets share no editable visual properties. Select widgets of the same kind to edit them together.</p>
            : <div className="space-y-2">
                {shared.map(pd => (
                  <PropField key={pd.key} label={pd.label}>
                    <MultiField def={pd} value={common(w => propVal(w, pd.key))} onChange={v => setProp(pd.key, v)} />
                  </PropField>
                ))}
              </div>}
        </Section>
      </div>
    </div>
  )
}

function PropsPanel({ widget, multiCount = 0, selection = [], onChange, onMultiChange, onDelete, onBrowse, pageOptions = [] }) {
  if (!widget) {
    // Guard on the resolved selection array, not just multiCount: a stale
    // selection (ids left over from another page) yields multiCount > 1 with an
    // empty `selection`, which MultiEditPanel's common() would deref and crash on.
    if (multiCount > 1 && selection.length > 1) return <MultiEditPanel selection={selection} onChange={onMultiChange} onDelete={onDelete} />
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-gray-400">
        <Layers size={28} />
        <p className="text-xs text-center leading-relaxed text-gray-400">
          Select a widget on the canvas to edit its properties
        </p>
      </div>
    )
  }

  // Functional updates so multiple edits in one tick compose (see handleWidgetChange).
  // A value may itself be an updater fn (used for array props like table rows).
  const set = (k, v) => onChange(prev => ({ ...prev, [k]: v }))
  const setProp = (k, v) => onChange(prev => ({
    ...prev,
    props: { ...prev.props, [k]: typeof v === 'function' ? v(prev.props?.[k]) : v },
  }))

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between shrink-0">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Properties</p>
          <p className="text-[10px] text-gray-400 font-mono">{widget.id}</p>
        </div>
        <button onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors" title="Delete widget">
          <Trash2 size={12} />
        </button>
      </div>
      <div className="p-3 space-y-3 flex-1">
        <Section title="Geometry">
          <div className="grid grid-cols-2 gap-2">
            {[['x','X'],['y','Y'],['width','W'],['height','H']].map(([k, lbl]) => (
              <PropField key={k} label={lbl}>
                <input type="number" className="input-field text-xs py-1"
                  value={widget[k]} onChange={e => set(k, Number(e.target.value))} />
              </PropField>
            ))}
          </div>
        </Section>
        <Section title="Widget Props">
          <TypeProps type={widget.type} props={widget.props ?? {}} onChange={setProp} onBrowse={onBrowse} pageOptions={pageOptions} />
        </Section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context Menu
// ---------------------------------------------------------------------------
function ContextMenu({ x, y, onCopy, onPaste, canPaste, onDuplicate, onSaveToLibrary, onDelete, onLayer, onClose }) {
  useEffect(() => {
    const h = () => onClose()
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [onClose])

  const items = [
    { icon: Copy,         label: 'Copy',           action: onCopy,  hint: 'Ctrl+C' },
    { icon: Copy,         label: 'Paste',          action: onPaste, hint: 'Ctrl+V', disabled: !canPaste },
    { icon: Copy,         label: 'Duplicate',      action: onDuplicate, hint: 'Ctrl+D' },
    { icon: Bookmark,     label: 'Save to Library…', action: onSaveToLibrary },
    null,
    { icon: BringToFront, label: 'Bring to Front', action: () => onLayer('front') },
    { icon: ArrowUp,      label: 'Bring Forward',  action: () => onLayer('forward') },
    { icon: ArrowDown,    label: 'Send Backward',  action: () => onLayer('backward') },
    { icon: SendToBack,   label: 'Send to Back',   action: () => onLayer('back') },
    null,
    { icon: Trash2,       label: 'Delete',         action: onDelete, danger: true },
  ]

  return (
    <div
      style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-2xl py-1 min-w-[160px] animate-fade-in"
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map((item, i) => item === null
        ? <div key={i} className="border-t border-gray-200 my-1" />
        : (
          <button key={i} onClick={() => { if (item.disabled) return; item.action(); onClose() }}
            disabled={item.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left
              ${item.disabled ? 'text-gray-300 cursor-default' : 'hover:bg-gray-100 ' + (item.danger ? 'text-red-600 hover:text-red-500' : 'text-gray-700')}`}
          >
            <item.icon size={11} />
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="text-[9px] text-gray-400 font-mono">{item.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Save to Library Modal — name + category for the widget(s) being saved. Handles
// its own create call so validation errors (e.g. duplicate name) stay local.
// ---------------------------------------------------------------------------
function SaveToLibraryModal({ widgets, categories = [], onClose, onSaved }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('General')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const count = widgets.length
  const kind = count > 1 ? 'group' : 'single'

  const submit = async () => {
    const nm = name.trim()
    if (!nm || busy) return
    setBusy(true); setError(null)
    try {
      await libraryApi.create({ name: nm, category: category.trim() || 'General', widgets })
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error ?? e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Bookmark size={15} /> Save to Library</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[11px] text-gray-500">
            Saving {count === 1 ? 'a single widget' : <>a group of <b>{count}</b> widgets</>} ({kind}). Placing it later inserts an independent copy.
          </p>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Name</label>
            <input type="text" className="input-field" placeholder="e.g. Back button"
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Category</label>
            <input type="text" className="input-field" placeholder="General" list="lib-categories"
              value={category} onChange={e => setCategory(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} />
            <datalist id="lib-categories">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={!name.trim() || busy} className="btn-primary disabled:opacity-60">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Library Manager Modal — rename / recategorise / delete saved items.
// ---------------------------------------------------------------------------
function LibraryManagerModal({ items, onChanged, onClose }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  // Local editable copies keyed by id.
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(items.map(it => [it.id, { name: it.name, category: it.category || 'General' }])))

  const setDraft = (id, k, v) => setDrafts(d => ({ ...d, [id]: { ...d[id], [k]: v } }))

  const save = async (it) => {
    const d = drafts[it.id]
    if (!d || !d.name.trim()) return
    setBusyId(it.id); setError(null)
    try {
      await libraryApi.update(it.id, { name: d.name.trim(), category: d.category.trim() || 'General' })
      await onChanged()
    } catch (e) { setError(e.response?.data?.error ?? e.message) }
    finally { setBusyId(null) }
  }

  const remove = async (it) => {
    if (!window.confirm(`Delete library item “${it.name}”? Widgets already placed on pages are not affected.`)) return
    setBusyId(it.id); setError(null)
    try {
      await libraryApi.remove(it.id)
      await onChanged()
    } catch (e) { setError(e.response?.data?.error ?? e.message) }
    finally { setBusyId(null) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-2xl shadow-2xl animate-fade-in max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Library size={15} /> Widget Library</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {error && <p className="text-[11px] text-red-600 mb-3">{error}</p>}
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">
              No saved items yet. Right-click a widget (or a selection) on the canvas → “Save to Library”.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-200">
                  <th className="py-1.5 pr-2 font-medium">Name</th>
                  <th className="py-1.5 pr-2 font-medium">Category</th>
                  <th className="py-1.5 pr-2 font-medium">Kind</th>
                  <th className="py-1.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2">
                      <input className="input-field py-1 text-xs" value={drafts[it.id]?.name ?? ''}
                        onChange={e => setDraft(it.id, 'name', e.target.value)} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input className="input-field py-1 text-xs" value={drafts[it.id]?.category ?? ''}
                        onChange={e => setDraft(it.id, 'category', e.target.value)} />
                    </td>
                    <td className="py-1.5 pr-2 text-gray-500">
                      {it.kind === 'group' ? `group · ${(it.widgets || []).length}` : 'single'}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => save(it)} disabled={busyId === it.id || !(drafts[it.id]?.name || '').trim()}
                        className="btn-secondary py-1 px-2 text-xs mr-1.5 disabled:opacity-50" title="Save changes">
                        <Check size={12} />
                      </button>
                      <button onClick={() => remove(it)} disabled={busyId === it.id}
                        className="py-1 px-2 text-xs rounded text-red-600 hover:bg-red-50 disabled:opacity-50" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 shrink-0">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New Page Modal
// ---------------------------------------------------------------------------
function NewPageModal({ onConfirm, onClose }) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">New Page</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5">
          <label className="block text-xs text-gray-500 mb-1.5">Page Name (slug)</label>
          <input type="text" className="input-field" placeholder="my_page_name"
            value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_'))}
            onKeyDown={e => e.key === 'Enter' && name && onConfirm(name)} autoFocus />
          <p className="text-[10px] text-gray-400 mt-2">Lowercase letters, numbers, underscores only.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => name && onConfirm(name)} className="btn-primary" disabled={!name}>Create</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metadata Modal
// ---------------------------------------------------------------------------
function MetaModal({ meta, onSave, onClose }) {
  const [form, setForm] = useState({ ...meta })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">Page Metadata</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {[
            ['title',          'Title',          'text'],
            ['nav_order',      'Nav Order',      'number'],
          ].map(([k, lbl, t]) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-1">{lbl}</label>
              <input type={t} className="input-field" value={form[k] ?? ''}
                onChange={e => set(k, t === 'number' ? Number(e.target.value) : e.target.value)} />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Visible to groups</label>
            <GroupMultiSel value={form.viewGroups} onChange={v => set('viewGroups', v || [])}
              emptyText="None selected — every runtime screen can open this page" />
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              When groups are selected, the runtime shows this page only after an operator of one of
              them (or a group that inherits from one) logs in. Edit-mode users always see it.
              Widgets keep their own edit groups for writes.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 pt-1 cursor-pointer">
            <input type="checkbox" checked={!!form.is_home} onChange={e => set('is_home', e.target.checked)} />
            Set as home page (loaded at runtime startup)
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => { onSave(form); onClose() }} className="btn-primary">Save</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page List
// ---------------------------------------------------------------------------
// Trigger a browser download of raw text (e.g. a CSV export).
function downloadText(text, filename, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

function PageList({ onNew }) {
  const navigate = useNavigate()
  const [pageList, setPageList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)      // 'export' | 'import' | 'export-texts' | 'import-texts' | null
  const [notice, setNotice] = useState(null)  // { ok, text }
  const textsFileRef = useRef(null)
  const loadFileRef = useRef(null)

  // The HMI has a single runtime config on the server; a .hmiproj file is how
  // the client saves (downloads) and loads (uploads) it. `info` = runtime stats.
  const [projMenu, setProjMenu] = useState(false)
  const [info, setInfo] = useState(null)   // { exists, savedAt, counts, programVersion }
  const [version, setVersion] = useState('')         // program version tag, editable
  const [savingVersion, setSavingVersion] = useState(false)

  const reload = () =>
    pagesApi.list()
      .then(data => setPageList(Array.isArray(data) ? data : (data.pages ?? [])))
      .catch(e => setError(e.message))

  // Delete a page after confirmation, then refresh the list. The runtime stats
  // line is also refreshed so its page count stays in sync.
  const onDelete = async (pg) => {
    if (!window.confirm(`Delete page “${pg.name}”?\n\nThis permanently removes the page and all its widgets. This cannot be undone.`)) return
    try {
      await pagesApi.deletePage(pg.name)
      setNotice({ ok: true, text: `Page “${pg.name}” deleted.` })
      reload()
      refreshInfo()
    } catch (e) {
      setNotice({ ok: false, text: e?.response?.data?.error || e.message })
    }
  }

  const refreshInfo = () =>
    projectApi.info().then(d => { setInfo(d); setVersion(d?.programVersion || '') }).catch(() => {})

  useEffect(() => {
    Promise.all([reload(), refreshInfo()]).finally(() => setLoading(false))
  }, [])

  // Export all translatable text — widget texts across every page plus alarm
  // translations — as a single editable CSV.
  const handleExportTexts = async () => {
    setBusy('export-texts'); setNotice(null)
    try {
      const csv = await textioApi.exportTexts()
      const stamp = new Date().toISOString().slice(0, 10)
      downloadText(csv, `hmi-texts-${stamp}.csv`)
      setNotice({ ok: true, text: 'Texts & alarm translations exported (CSV).' })
    } catch (e) {
      setNotice({ ok: false, text: 'Text export failed: ' + (e.response?.data?.error ?? e.message) })
    } finally { setBusy(null) }
  }

  // Re-import an edited texts CSV (widget texts + alarm translations).
  const handleImportTexts = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('import-texts'); setNotice(null)
    try {
      const r = await textioApi.importTexts(await file.text())
      await reload()
      const warn = r.warnings?.length ? ` — ${r.warnings.length} warning(s)` : ''
      const alarms = (r.alarmsUpdated || r.alarmsInserted)
        ? `; alarms: ${r.alarmsUpdated} updated, ${r.alarmsInserted} new` : ''
      setNotice({ ok: true, text: `Texts imported: ${r.propsUpdated} field(s) across ${r.pagesUpdated} page(s)${alarms}${warn}` })
    } catch (e) {
      setNotice({ ok: false, text: 'Text import failed: ' + (e.response?.data?.error ?? e.message) })
    } finally { setBusy(null) }
  }

  // ── Runtime (.hmiproj) — New / Load from file / Save to file ──────────────
  // Save to file: download the server runtime as a .hmiproj onto the client.
  const handleSaveToFile = async () => {
    setProjMenu(false)
    const input = window.prompt('Download runtime as — file name:', 'hmi-runtime')
    if (input == null) return
    const base = input.trim() || 'hmi-runtime'
    const fname = base.toLowerCase().endsWith('.hmiproj') ? base : `${base}.hmiproj`
    setBusy('project'); setNotice(null)
    try {
      const blob = await projectApi.download(base)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fname
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      await refreshInfo()
      setNotice({ ok: true, text: `Runtime saved to “${fname}”.` })
    } catch (e) {
      setNotice({ ok: false, text: 'Save to file failed: ' + (e.response?.data?.error ?? e.message) })
    } finally { setBusy(null) }
  }

  // Load from file: upload a .hmiproj — REPLACES the runtime, so confirm first.
  const handleLoadFromFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!window.confirm('Load this file as the runtime?\n\nThis REPLACES the entire runtime configuration (all pages, assets, alarm definitions, recipes and settings) on the server. Save the current runtime to a file first if you need it.')) return
    setBusy('project'); setNotice(null)
    try {
      const bundle = JSON.parse(await file.text())
      const r = await projectApi.load(bundle)
      await Promise.all([reload(), refreshInfo()])
      const warn = r.warnings?.length ? ` — ${r.warnings.length} warning(s)` : ''
      const restart = r.machineRestartRequired ? ' Restart the backend to connect the project’s machine.' : ''
      setNotice({ ok: true, text: `Runtime loaded — ${r.pages} page(s), ${r.assets} asset(s), ${r.alarms} alarm(s), ${r.recipes} recipe(s)${warn}.${restart}` })
    } catch (e) {
      setNotice({ ok: false, text: 'Load failed: ' + (e.response?.data?.error ?? e.message) })
    } finally { setBusy(null) }
  }

  // New — blanks the runtime, so confirm first.
  const handleProjectNew = async () => {
    setProjMenu(false)
    if (!window.confirm('Start a new, empty runtime?\n\nThis clears all pages, alarm definitions, recipes and settings on the server. Save the current runtime to a file first if you need it.')) return
    setBusy('project'); setNotice(null)
    try {
      await projectApi.newProject()
      await Promise.all([reload(), refreshInfo()])
      setNotice({ ok: true, text: 'New empty runtime started.' })
    } catch (e) {
      setNotice({ ok: false, text: 'New runtime failed: ' + (e.response?.data?.error ?? e.message) })
    } finally { setBusy(null) }
  }

  // Save the free-text program version tag (shown at runtime).
  const saveVersion = async () => {
    setSavingVersion(true); setNotice(null)
    try {
      const r = await projectApi.setVersion(version.trim())
      setVersion(r.programVersion || '')
      await refreshInfo()
      setProjMenu(false)
      setNotice({ ok: true, text: r.programVersion ? `Program version set to “${r.programVersion}”.` : 'Program version cleared.' })
    } catch (e) {
      setNotice({ ok: false, text: 'Could not save program version: ' + (e.response?.data?.error ?? e.message) })
    } finally { setSavingVersion(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-[#1677ff] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">HMI Page Editor</h1>
          <p className="text-sm text-gray-500 mt-1">Design and configure HMI pages visually</p>
          {info && (
            <p className="text-xs text-gray-400 mt-1">
              Runtime: {info.counts?.pages ?? 0} page(s), {info.counts?.assets ?? 0} asset(s), {info.counts?.alarms ?? 0} alarm(s), {info.counts?.recipes ?? 0} recipe(s)
              {info.savedAt && ` · saved to file ${fmtWhen(info.savedAt)}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Runtime (.hmiproj) — New / Load from file / Save to file */}
          <input ref={loadFileRef} type="file" accept=".hmiproj,application/json,.json" className="hidden" onChange={handleLoadFromFile} />
          <div className="relative">
            <button onClick={() => setProjMenu(v => !v)} disabled={!!busy}
              className="btn-primary flex items-center gap-2 disabled:opacity-60"
              title="Runtime: new / load from file / save to file (.hmiproj)">
              <Package size={14} />
              <span>{busy === 'project' ? 'Working…' : 'Project'}</span>
              <ChevronDown size={14} />
            </button>
            {projMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setProjMenu(false)} />
                <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 text-sm">
                  <button onClick={handleProjectNew}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-700 hover:bg-[#e6f0ff] hover:text-[#1677ff] transition-colors">
                    <FilePlus size={15} /> New
                  </button>
                  <button onClick={() => { setProjMenu(false); loadFileRef.current?.click() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-700 hover:bg-[#e6f0ff] hover:text-[#1677ff] transition-colors">
                    <Upload size={15} /> Load from file…
                  </button>
                  <button onClick={handleSaveToFile}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-700 hover:bg-[#e6f0ff] hover:text-[#1677ff] transition-colors">
                    <Download size={15} /> Save to file
                  </button>
                  <div className="my-1 border-t border-gray-100" />
                  <div className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1.5">
                      <Tag size={13} /> Program version
                    </label>
                    <div className="flex gap-1.5">
                      <input type="text" className="input-field flex-1 text-sm" placeholder="e.g. 1.0.0"
                        value={version} onChange={e => setVersion(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveVersion()} />
                      <button onClick={saveVersion} disabled={savingVersion || version.trim() === (info?.programVersion || '')}
                        className="btn-primary px-3 disabled:opacity-50">
                        {savingVersion ? '…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="w-px h-6 bg-gray-200 mx-0.5" />
          <input ref={textsFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportTexts} />
          <button onClick={() => textsFileRef.current?.click()} disabled={!!busy}
            className="btn-secondary flex items-center gap-2 disabled:opacity-60" title="Import widget texts and alarm translations from a CSV file">
            <FileText size={14} /> {busy === 'import-texts' ? 'Importing…' : 'Import texts'}
          </button>
          <button onClick={handleExportTexts} disabled={!!busy}
            className="btn-secondary flex items-center gap-2 disabled:opacity-60" title="Export widget texts and alarm translations as an editable CSV">
            <FileText size={14} /> {busy === 'export-texts' ? 'Exporting…' : 'Export texts'}
          </button>
          <button onClick={onNew} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> New Page
          </button>
        </div>
      </div>
      {notice && (
        <div className={`rounded-lg p-3 text-sm mb-6 border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
          {notice.text}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600 mb-6">{error}</div>
      )}
      {pageList.length === 0 ? (
        <div className="panel p-16 text-center">
          <Layers size={36} className="text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">No pages yet. Create your first HMI page.</p>
          <button onClick={onNew} className="btn-primary mt-4 mx-auto flex items-center gap-2">
            <Plus size={14} /> Create Page
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {pageList.map(pg => (
            <div key={pg.name} className="relative group">
              <button
                onClick={() => navigate(`/edit/editor/${pg.name}`)}
                className="panel p-4 text-left w-full hover:border-[#1677ff] hover:bg-[#e6f0ff] transition-all duration-150"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-gray-800 group-hover:text-[#1677ff] transition-colors text-sm">{pg.name}</span>
                  <span className="text-[10px] text-gray-400 font-mono bg-gray-100 rounded px-1.5 py-0.5 shrink-0 ml-2 mr-5">
                    {pg.definition?.widgets?.length ?? 0}w
                  </span>
                </div>
                {pg.title && <p className="text-xs text-gray-500 mb-2">{pg.title}</p>}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(pg) }}
                title="Delete page"
                className="absolute top-2 right-2 p-1 rounded text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Format an ISO timestamp for the runtime "last saved to file" line.
function fmtWhen(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

// ---------------------------------------------------------------------------
// Toolbar controls
// ---------------------------------------------------------------------------
function ViewToggle({ active, onClick, icon: Icon, title }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded transition-colors ${active
        ? 'bg-[#e6f0ff] text-[#1677ff]'
        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}>
      <Icon size={14} />
    </button>
  )
}
function AlignBtn({ onClick, icon: Icon, title, disabled }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-[#1677ff] transition-colors
        disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500">
      <Icon size={14} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main EditorPage Component
// ---------------------------------------------------------------------------
export default function EditorPage() {
  const { pageName } = useParams()
  const navigate = useNavigate()

  const [showNewModal, setShowNewModal] = useState(false)
  const [showMetaModal, setShowMetaModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [loading, setLoading] = useState(!!pageName)
  const [error, setError] = useState(null)

  const [widgets, setWidgets] = useState([])
  const [canvasWidth, setCanvasWidth] = useState(1024)
  const [canvasHeight, setCanvasHeight] = useState(768)
  const [meta, setMeta] = useState({ title: '', nav_order: 0, required_level: 1, viewGroups: [], is_home: false })
  // Grid overlay: shown on the editor canvas AND saved into the page definition so
  // the runtime honours the same preference. Default on.
  const [showGrid, setShowGrid] = useState(true)

  // Unsaved-changes tracking: snapshot the page definition at load / after save,
  // and compare on every render so the toolbar knows when the page is "dirty".
  const [previewPrompt, setPreviewPrompt] = useState(false)
  const savedSnapshotRef = useRef('')
  const snapshotOf = (ws, cw, ch, m, g) => JSON.stringify({ widgets: ws, canvasWidth: cw, canvasHeight: ch, meta: m, showGrid: g })
  // Empty ref = not yet loaded → never "dirty".
  const dirty = savedSnapshotRef.current !== '' &&
    savedSnapshotRef.current !== snapshotOf(widgets, canvasWidth, canvasHeight, meta, showGrid)

  const [selectedIds, setSelectedIds] = useState([])
  const [marquee, setMarquee] = useState(null) // rubber-band box in canvas-local coords
  const [contextMenu, setContextMenu] = useState(null)
  const [activePalette, setActivePalette] = useState(null)
  const [assetPicker, setAssetPicker] = useState(null) // { filter, callback }
  const [pageOptions, setPageOptions] = useState([]) // { value: name, label } for "Vai a pagina"

  // Widget library (reusable saved widgets / groups).
  const [libraryItems, setLibraryItems] = useState([])
  const [saveLibTarget, setSaveLibTarget] = useState(null) // widget[] being saved, or null
  const [libManagerOpen, setLibManagerOpen] = useState(false)

  // View / editing options
  const [snapEnabled, setSnapEnabled] = useState(true)

  // Refs mirror state so mouse handlers can read the latest value synchronously
  // (drag snapshots must be captured at mousedown without waiting for a render).
  const widgetsRef   = useRef([])
  const selectionRef = useRef([])
  const snapRef      = useRef(true)
  const moveSnapshotRef = useRef({}) // { [id]: {x, y} } captured at drag start
  const resizeSnapshotRef = useRef(null) // group-resize anchor + per-widget geometry
  useEffect(() => { snapRef.current = snapEnabled }, [snapEnabled])

  const snapV = useCallback((v) => (snapRef.current ? snap(v) : Math.round(v)), [])

  const handleBrowse = useCallback((filter, callback) => {
    setAssetPicker({ filter, callback })
  }, [])

  // Load the list of pages to populate the "Target Page" combo box. Re-fetched
  // whenever the active page changes (creating a new form navigates here, so the
  // fresh page shows up in the navigate-event list without a manual reload).
  const loadPageOptions = useCallback(() => {
    pagesApi.list()
      .then(data => {
        const list = Array.isArray(data) ? data : (data.pages ?? [])
        setPageOptions(list.map(p => ({ value: p.name, label: p.title ? `${p.title} (${p.name})` : p.name })))
      })
      .catch(() => setPageOptions([]))
  }, [])
  useEffect(() => { loadPageOptions() }, [loadPageOptions, pageName])

  // Load (and reload after changes) the saved widget library.
  const reloadLibrary = useCallback(() =>
    libraryApi.list()
      .then(d => setLibraryItems(Array.isArray(d) ? d : []))
      .catch(() => setLibraryItems([])), [])
  useEffect(() => { reloadLibrary() }, [reloadLibrary])

  // Open the "Save to Library" modal for a widget. If the clicked widget is part
  // of the current multi-selection, save the whole selection as a group;
  // otherwise save just that widget. Deep-clone so later edits don't mutate it.
  const openSaveToLibrary = useCallback((widgetId) => {
    const sel = selectionRef.current
    const ids = (widgetId != null && sel.includes(widgetId) && sel.length > 1)
      ? sel
      : (widgetId != null ? [widgetId] : sel)
    const targets = widgetsRef.current.filter(w => ids.includes(w.id))
    if (!targets.length) return
    setSaveLibTarget(JSON.parse(JSON.stringify(targets)))
  }, [])

  const canvasRef = useRef(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Load page
  useEffect(() => {
    if (!pageName) return
    setLoading(true)
    pagesApi.get(pageName)
      .then(data => {
        const def = data.definition ?? data
        const loadedWidgets = (def.widgets ?? []).map((w, i) => ({ ...w, zIndex: w.zIndex ?? i + 1 }))
        const cw = def.canvasWidth ?? 1024
        const ch = def.canvasHeight ?? 768
        const g = def.showGrid !== false   // default on for pages saved before this setting
        const m = {
          title: data.title ?? '',
          nav_order: data.nav_order ?? 0,
          required_level: data.required_level ?? 1,
          viewGroups: Array.isArray(data.viewGroups) ? data.viewGroups : [],
          is_home: !!data.is_home,
        }
        setWidgets(loadedWidgets)
        setCanvasWidth(cw)
        setCanvasHeight(ch)
        setShowGrid(g)
        setMeta(m)
        // The selection belongs to the page we just left — its ids don't exist on
        // the freshly-loaded page. Clear it (and any open context menu) so stale
        // ids can't drive the props panel. The copy clipboard is intentionally
        // kept so widgets can be pasted across pages.
        setSelectedIds([])
        setContextMenu(null)
        // Baseline for dirty-tracking — matches the just-loaded (normalised) state.
        savedSnapshotRef.current = snapshotOf(loadedWidgets, cw, ch, m, g)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [pageName])

  useEffect(() => { widgetsRef.current = widgets }, [widgets])
  useEffect(() => { selectionRef.current = selectedIds }, [selectedIds])

  // The props panel edits a single widget; show it only when exactly one is
  // selected (the "primary" selection).
  const selectedWidgets = widgets.filter(w => selectedIds.includes(w.id))
  const selectedWidget = selectedIds.length === 1
    ? widgets.find(w => w.id === selectedIds[0]) ?? null
    : null
  const selectionCount = selectedIds.length

  // Keyboard: Delete removes the selection, Escape clears it. Ignore while
  // typing in a form field.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectionRef.current.length) { e.preventDefault(); handleDeleteRef.current() }
      } else if (e.key === 'Escape') {
        setSelectedIds([])
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        // Ctrl/Cmd+C = copy the current selection to the in-app clipboard
        if (!selectionRef.current.length) return
        e.preventDefault()
        handleCopyRef.current()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        // Ctrl/Cmd+V = paste copied widgets (offset so repeats don't stack)
        e.preventDefault()
        handlePasteRef.current()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        // Ctrl/Cmd+D = duplicate selection in place (copy + paste, clipboard preserved)
        if (!selectionRef.current.length) return
        e.preventDefault()
        handleDuplicateSelectionRef.current()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '[')) {
        // Ctrl+] / Ctrl+[ = forward/backward; add Shift for front/back
        if (!selectionRef.current.length) return
        e.preventDefault()
        const mode = e.key === ']'
          ? (e.shiftKey ? 'front' : 'forward')
          : (e.shiftKey ? 'back' : 'backward')
        reorderLayerRef.current(mode)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // handleDelete / reorderLayer are defined below; reach them through refs to avoid ordering churn.
  const handleDeleteRef = useRef(() => {})
  const reorderLayerRef = useRef(() => {})
  const handleCopyRef = useRef(() => {})
  const handlePasteRef = useRef(() => {})
  const handleDuplicateSelectionRef = useRef(() => {})

  // In-app widget clipboard: deep copies of the widgets captured on Ctrl+C.
  // pasteCount drives a growing offset so repeated pastes cascade instead of
  // landing on top of each other.
  const clipboardRef = useRef([])
  const pasteCountRef = useRef(0)

  // DnD handlers
  const handleDragStart = useCallback((e) => {
    const d = e.active.data.current
    if (d?.isPalette) setActivePalette(d.type)
    else if (d?.isLibrary) {
      const it = libraryItems.find(x => String(x.id) === String(d.itemId))
      setActivePalette(it ? it.name : 'item')
    }
  }, [libraryItems])

  const handleDragEnd = useCallback((e) => {
    setActivePalette(null)
    const d = e.active.data.current
    if (!canvasRef.current || (!d?.isPalette && !d?.isLibrary)) return
    const rect = canvasRef.current.getBoundingClientRect()
    const dropX = snapV(Math.max(0, (e.activatorEvent?.clientX ?? 0) + e.delta.x - rect.left))
    const dropY = snapV(Math.max(0, (e.activatorEvent?.clientY ?? 0) + e.delta.y - rect.top))

    // Library item → insert a fresh-id copy of every saved widget, anchored at the
    // drop point (saved positions are relative to the group's origin).
    if (d.isLibrary) {
      const item = libraryItems.find(x => String(x.id) === String(d.itemId))
      if (!item || !Array.isArray(item.widgets) || !item.widgets.length) return
      const stamp = Date.now()
      const baseZ = widgets.length
      const added = item.widgets.map((w, i) => {
        const copy = JSON.parse(JSON.stringify(w))
        const width = copy.width ?? 100
        const height = copy.height ?? 40
        return {
          ...copy,
          id: `${copy.type}_${stamp}_${i}`,
          x: Math.max(0, Math.min(dropX + (copy.x || 0), canvasWidth - width)),
          y: Math.max(0, Math.min(dropY + (copy.y || 0), canvasHeight - height)),
          width, height,
          zIndex: baseZ + i + 1,
        }
      })
      setWidgets(ws => [...ws, ...added])
      setSelectedIds(added.map(w => w.id))
      return
    }

    // Built-in palette widget → single new widget with default props/size.
    const type = d.type
    const sz = DEFAULT_SIZE[type] ?? { w: 100, h: 40 }
    const nw = {
      id: `${type}_${Date.now()}`,
      type,
      x: Math.min(dropX, canvasWidth - sz.w),
      y: Math.min(dropY, canvasHeight - sz.h),
      width: sz.w,
      height: sz.h,
      zIndex: widgets.length + 1,
      props: { ...DEFAULT_PROPS[type] },
    }
    setWidgets(ws => [...ws, nw])
    setSelectedIds([nw.id])
  }, [widgets.length, canvasWidth, canvasHeight, snapV, libraryItems])

  // Begin a mouse interaction on a widget. Resolves selection synchronously
  // (via refs) and, when a drag should follow, snapshots the positions of every
  // widget that will move. Returns { drag: boolean }.
  const beginInteraction = useCallback((id, additive) => {
    const cur = selectionRef.current
    if (additive) {
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
      selectionRef.current = next
      setSelectedIds(next)
      return { drag: false } // shift/ctrl-click toggles selection, no drag
    }
    // Keep an existing multi-selection if the grabbed widget belongs to it;
    // otherwise select just this one.
    let next = cur
    if (!(cur.includes(id) && cur.length > 1)) {
      next = [id]
      selectionRef.current = next
      setSelectedIds(next)
    }
    const snapshot = {}
    widgetsRef.current.forEach(w => { if (next.includes(w.id)) snapshot[w.id] = { x: w.x, y: w.y } })
    moveSnapshotRef.current = snapshot
    return { drag: true }
  }, [])

  // Rubber-band (marquee) selection: press on empty canvas and drag a box; every
  // widget the box touches is selected on release. Shift/Ctrl/Cmd adds to the
  // existing selection instead of replacing it. A plain click (no drag) clears.
  const handleCanvasMouseDown = useCallback((e) => {
    if (e.button !== 0 || e.target !== canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    const baseSel = additive ? selectionRef.current.slice() : []
    if (!additive) { selectionRef.current = []; setSelectedIds([]) }
    const x0 = e.clientX - rect.left
    const y0 = e.clientY - rect.top
    setMarquee({ x0, y0, x1: x0, y1: y0 })
    const onMove = (ev) => {
      const x1 = ev.clientX - rect.left
      const y1 = ev.clientY - rect.top
      setMarquee({ x0, y0, x1, y1 })
      const box = {
        left: Math.min(x0, x1), right: Math.max(x0, x1),
        top: Math.min(y0, y1), bottom: Math.max(y0, y1),
      }
      const hit = widgetsRef.current
        .filter(w => box.left < w.x + w.width && box.right > w.x &&
                     box.top < w.y + w.height && box.bottom > w.y)
        .map(w => w.id)
      const next = additive ? Array.from(new Set([...baseSel, ...hit])) : hit
      selectionRef.current = next
      setSelectedIds(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setMarquee(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Move all snapshotted (selected) widgets by the drag delta.
  const handleGroupMove = useCallback((dx, dy) => {
    const snapshot = moveSnapshotRef.current
    setWidgets(ws => ws.map(w => {
      const s = snapshot[w.id]
      if (!s) return w
      return { ...w, x: Math.max(0, snapV(s.x + dx)), y: Math.max(0, snapV(s.y + dy)) }
    }))
  }, [snapV])

  const handleResize = useCallback((id, width, height) => {
    setWidgets(ws => ws.map(w => w.id === id ? { ...w, width, height } : w))
  }, [])

  // Group resize: snapshot the selection's bounding box and every selected
  // widget's geometry at mousedown. Returns the snapshot (with the group's
  // starting size) so the handle can derive a scale factor, or null if fewer
  // than two widgets are selected.
  const beginGroupResize = useCallback(() => {
    const sel = selectionRef.current
    const sw = widgetsRef.current.filter(w => sel.includes(w.id))
    if (sw.length < 2) return null
    const left   = Math.min(...sw.map(w => w.x))
    const top    = Math.min(...sw.map(w => w.y))
    const right  = Math.max(...sw.map(w => w.x + w.width))
    const bottom = Math.max(...sw.map(w => w.y + w.height))
    const g = {}
    sw.forEach(w => { g[w.id] = { x: w.x, y: w.y, width: w.width, height: w.height } })
    resizeSnapshotRef.current = { left, top, w0: Math.max(1, right - left), h0: Math.max(1, bottom - top), widgets: g }
    return resizeSnapshotRef.current
  }, [])

  // Scale every snapshotted widget about the selection's top-left corner. Both
  // position offset and size scale by the same factors, so the group keeps its
  // relative layout while growing/shrinking as a whole.
  const handleGroupResize = useCallback((scaleX, scaleY) => {
    const snap = resizeSnapshotRef.current
    if (!snap) return
    const { left, top, widgets: g } = snap
    setWidgets(ws => ws.map(w => {
      const s = g[w.id]
      if (!s) return w
      return {
        ...w,
        x: Math.max(0, Math.round(left + (s.x - left) * scaleX)),
        y: Math.max(0, Math.round(top + (s.y - top) * scaleY)),
        width:  Math.max(10, Math.round(s.width  * scaleX)),
        height: Math.max(8,  Math.round(s.height * scaleY)),
      }
    }))
  }, [])

  const handleWidgetChange = useCallback((updated) => {
    // Functional updater form: apply to the single selected widget. Lets several
    // prop edits fired in the same tick (e.g. the symbol picker setting both
    // plcAddress and dataType) compose instead of clobbering each other.
    if (typeof updated === 'function') {
      const id = selectionRef.current.length === 1 ? selectionRef.current[0] : null
      if (id == null) return
      setWidgets(ws => ws.map(w => w.id === id ? updated(w) : w))
      return
    }
    setWidgets(ws => ws.map(w => w.id === updated.id ? updated : w))
  }, [])

  // Apply a widget-mutator to every selected widget (multi-selection common-prop
  // editing). Reads the live selection from the ref so it stays current.
  const handleMultiChange = useCallback((mutate) => {
    const set = new Set(selectionRef.current)
    setWidgets(ws => ws.map(w => (set.has(w.id) ? mutate(w) : w)))
  }, [])

  const handleDelete = useCallback((id) => {
    // If an explicit id is given (context menu) delete just that; otherwise
    // delete the whole current selection.
    const targets = id != null ? [id] : selectionRef.current
    if (targets.length === 0) return
    const set = new Set(targets)
    setWidgets(ws => ws.filter(w => !set.has(w.id)))
    setSelectedIds(ids => ids.filter(x => !set.has(x)))
  }, [])
  handleDeleteRef.current = handleDelete

  const handleDuplicate = useCallback((id) => {
    const src = widgets.find(w => w.id === id)
    if (!src) return
    const nw = { ...src, id: `${src.type}_${Date.now()}`, x: src.x + 20, y: src.y + 20, zIndex: widgets.length + 2 }
    setWidgets(ws => [...ws, nw])
    setSelectedIds([nw.id])
  }, [widgets])

  // ---- Copy / paste (Ctrl/Cmd+C, Ctrl/Cmd+V) ----
  // Copy snapshots the current selection into an in-app clipboard. Paste inserts
  // fresh-id copies, preserving the widgets' relative layout and cascading a small
  // offset on each successive paste. Mirrors the library-drop insertion logic.
  const handleCopy = useCallback(() => {
    const ids = selectionRef.current
    const sel = widgetsRef.current.filter(w => ids.includes(w.id))
    if (!sel.length) return
    clipboardRef.current = sel.map(w => JSON.parse(JSON.stringify(w)))
    pasteCountRef.current = 0
  }, [])
  handleCopyRef.current = handleCopy

  const pasteWidgets = useCallback((clip, off) => {
    if (!clip || !clip.length) return
    const stamp = Date.now()
    const baseZ = widgetsRef.current.length
    const added = clip.map((w, i) => {
      const copy = JSON.parse(JSON.stringify(w))
      const width = copy.width ?? 100
      const height = copy.height ?? 40
      return {
        ...copy,
        id: `${copy.type}_${stamp}_${i}`,
        x: Math.max(0, Math.min(snapV((copy.x ?? 0) + off), canvasWidth - width)),
        y: Math.max(0, Math.min(snapV((copy.y ?? 0) + off), canvasHeight - height)),
        zIndex: baseZ + i + 1,
      }
    })
    setWidgets(ws => [...ws, ...added])
    setSelectedIds(added.map(w => w.id))
  }, [snapV, canvasWidth, canvasHeight])

  const handlePaste = useCallback(() => {
    if (!clipboardRef.current.length) return
    pasteCountRef.current += 1
    pasteWidgets(clipboardRef.current, 20 * pasteCountRef.current)
  }, [pasteWidgets])
  handlePasteRef.current = handlePaste

  // Ctrl/Cmd+D — duplicate the selection in place without disturbing the clipboard.
  const handleDuplicateSelection = useCallback(() => {
    const ids = selectionRef.current
    const sel = widgetsRef.current.filter(w => ids.includes(w.id))
    if (!sel.length) return
    pasteWidgets(sel.map(w => JSON.parse(JSON.stringify(w))), 20)
  }, [pasteWidgets])
  handleDuplicateSelectionRef.current = handleDuplicateSelection

  // ---- Alignment / distribution across the current selection ----
  const alignSelected = useCallback((mode) => {
    const ids = selectionRef.current
    const sel = widgetsRef.current.filter(w => ids.includes(w.id))
    if (sel.length < 2) return
    const minX = Math.min(...sel.map(w => w.x))
    const maxR = Math.max(...sel.map(w => w.x + w.width))
    const minY = Math.min(...sel.map(w => w.y))
    const maxB = Math.max(...sel.map(w => w.y + w.height))
    const cX = (minX + maxR) / 2
    const cY = (minY + maxB) / 2
    const set = new Set(ids)
    setWidgets(ws => ws.map(w => {
      if (!set.has(w.id)) return w
      switch (mode) {
        case 'left':    return { ...w, x: Math.max(0, snapV(minX)) }
        case 'hcenter': return { ...w, x: Math.max(0, snapV(cX - w.width / 2)) }
        case 'right':   return { ...w, x: Math.max(0, snapV(maxR - w.width)) }
        case 'top':     return { ...w, y: Math.max(0, snapV(minY)) }
        case 'vcenter': return { ...w, y: Math.max(0, snapV(cY - w.height / 2)) }
        case 'bottom':  return { ...w, y: Math.max(0, snapV(maxB - w.height)) }
        default:        return w
      }
    }))
  }, [snapV])

  // Evenly space selected widgets by their centres along one axis.
  const distributeSelected = useCallback((axis) => {
    const ids = selectionRef.current
    const sel = widgetsRef.current.filter(w => ids.includes(w.id))
    if (sel.length < 3) return
    const isH = axis === 'h'
    const c = w => (isH ? w.x + w.width / 2 : w.y + w.height / 2)
    const sorted = [...sel].sort((a, b) => c(a) - c(b))
    const first = c(sorted[0]), last = c(sorted[sorted.length - 1])
    const step = (last - first) / (sorted.length - 1)
    const pos = {}
    sorted.forEach((w, i) => {
      const centre = first + step * i
      pos[w.id] = isH
        ? { x: Math.max(0, snapV(centre - w.width / 2)) }
        : { y: Math.max(0, snapV(centre - w.height / 2)) }
    })
    setWidgets(ws => ws.map(w => (pos[w.id] ? { ...w, ...pos[w.id] } : w)))
  }, [snapV])

  // Reorder the stacking of the current selection (or an explicit id list).
  // mode: 'front' | 'back' | 'forward' | 'backward'. zIndex is normalised to a
  // contiguous 1..n stack after every operation so one-step moves stay reliable.
  const reorderLayer = useCallback((mode, idsArg) => {
    const ids = (idsArg && idsArg.length ? idsArg : selectionRef.current) || []
    if (!ids.length) return
    setWidgets(ws => {
      const ordered = ws.slice().sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1))
      const sel = new Set(ids)
      let arr
      if (mode === 'front') {
        arr = [...ordered.filter(w => !sel.has(w.id)), ...ordered.filter(w => sel.has(w.id))]
      } else if (mode === 'back') {
        arr = [...ordered.filter(w => sel.has(w.id)), ...ordered.filter(w => !sel.has(w.id))]
      } else {
        arr = ordered.slice()
        const isSel = arr.map(w => sel.has(w.id))
        if (mode === 'forward') {
          for (let i = arr.length - 2; i >= 0; i--) {
            if (isSel[i] && !isSel[i + 1]) {
              const w = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = w
              const s = isSel[i]; isSel[i] = isSel[i + 1]; isSel[i + 1] = s
            }
          }
        } else { // backward
          for (let i = 1; i < arr.length; i++) {
            if (isSel[i] && !isSel[i - 1]) {
              const w = arr[i]; arr[i] = arr[i - 1]; arr[i - 1] = w
              const s = isSel[i]; isSel[i] = isSel[i - 1]; isSel[i - 1] = s
            }
          }
        }
      }
      const zmap = new Map(arr.map((w, i) => [w.id, i + 1]))
      return ws.map(w => ({ ...w, zIndex: zmap.get(w.id) ?? w.zIndex }))
    })
  }, [])
  reorderLayerRef.current = reorderLayer

  // Save commits this page to the live runtime AND refreshes the server's
  // runtime.hmiproj mirror, so "Save" always saves the whole runtime.
  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      await pagesApi.update(pageName, {
        ...meta,
        definition: { widgets, canvasWidth, canvasHeight, showGrid },
      })
      await projectApi.save()                      // refresh the server runtime mirror
      savedSnapshotRef.current = snapshotOf(widgets, canvasWidth, canvasHeight, meta, showGrid)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(null), 2500)
      return true
    } catch (e) {
      setSaveMsg('Error: ' + (e.response?.data?.error ?? e.message))
      return false
    } finally {
      setSaving(false)
    }
  }

  // Preview opens the server-rendered runtime (/monitor), which reflects only the
  // last SAVED definition — so if there are unsaved edits, offer to save first.
  const goPreview = () => navigate(`/monitor/${pageName}`)
  const handlePreview = () => {
    if (dirty) setPreviewPrompt(true)
    else goPreview()
  }
  const saveThenPreview = async () => {
    const ok = await handleSave()
    setPreviewPrompt(false)
    if (ok) goPreview()
  }

  const handleNewPage = async (name) => {
    try {
      await pagesApi.create({ name, definition: { widgets: [], canvasWidth: 1024, canvasHeight: 768 } })
      // Close the modal before navigating: EditorPage stays mounted across the
      // route change and renders NewPageModal in the editor view too, so a
      // still-open modal would re-appear (and re-prompt) on the new page.
      setShowNewModal(false)
      navigate(`/edit/editor/${name}`)
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error ?? e.message))
    }
  }

  // Grid background
  const gridBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Cpath d='M 20 0 L 0 0 0 20' fill='none' stroke='%23e5e7eb' stroke-width='0.4'/%3E%3C/svg%3E")`

  // ---- Render: page list ----
  if (!pageName) {
    return (
      <div className="h-full overflow-auto bg-[#F3F6F9]">
        <PageList onNew={() => setShowNewModal(true)} />
        {showNewModal && <NewPageModal onConfirm={handleNewPage} onClose={() => setShowNewModal(false)} />}
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-[#1677ff] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error) return (
    <div className="flex items-center justify-center h-screen">
      <div className="panel p-8 text-center max-w-sm">
        <p className="text-red-600 mb-4 text-sm">{error}</p>
        <button onClick={() => navigate('/edit/editor')} className="btn-secondary">Back to Pages</button>
      </div>
    </div>
  )

  // ---- Render: editor ----
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-screen overflow-hidden bg-[#F3F6F9]">

        {/* Toolbar */}
        <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 shrink-0 z-20 h-12">
          <button onClick={() => navigate('/edit/editor')}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <span className="font-mono text-sm font-medium text-[#1677ff]">{pageName}</span>
          <button onClick={() => setShowMetaModal(true)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Metadata">
            <Settings size={13} />
          </button>

          <div className="w-px h-4 bg-gray-200" />
          {/* View options */}
          <ViewToggle active={showGrid} onClick={() => setShowGrid(g => !g)} icon={Grid2X2}
            title={showGrid ? 'Hide grid (also hidden at runtime — save to apply)' : 'Show grid (also shown at runtime — save to apply)'} />
          <ViewToggle active={snapEnabled} onClick={() => setSnapEnabled(s => !s)} icon={Magnet}
            title={snapEnabled ? 'Snap to grid: on' : 'Snap to grid: off'} />

          <div className="w-px h-4 bg-gray-200" />
          {/* Alignment (needs ≥2 selected) */}
          <div className="flex items-center" title={selectionCount < 2 ? 'Select 2+ widgets to align' : undefined}>
            <AlignBtn onClick={() => alignSelected('left')}    icon={AlignStartVertical}   title="Align left"           disabled={selectionCount < 2} />
            <AlignBtn onClick={() => alignSelected('hcenter')} icon={AlignCenterVertical}  title="Align horizontal centers" disabled={selectionCount < 2} />
            <AlignBtn onClick={() => alignSelected('right')}   icon={AlignEndVertical}     title="Align right"          disabled={selectionCount < 2} />
            <div className="w-px h-4 bg-gray-100 mx-0.5" />
            <AlignBtn onClick={() => alignSelected('top')}     icon={AlignStartHorizontal} title="Align top"            disabled={selectionCount < 2} />
            <AlignBtn onClick={() => alignSelected('vcenter')} icon={AlignCenterHorizontal} title="Align vertical centers" disabled={selectionCount < 2} />
            <AlignBtn onClick={() => alignSelected('bottom')}  icon={AlignEndHorizontal}   title="Align bottom"         disabled={selectionCount < 2} />
            <div className="w-px h-4 bg-gray-100 mx-0.5" />
            <AlignBtn onClick={() => distributeSelected('h')} icon={AlignHorizontalDistributeCenter} title="Distribute horizontally" disabled={selectionCount < 3} />
            <AlignBtn onClick={() => distributeSelected('v')} icon={AlignVerticalDistributeCenter}   title="Distribute vertically"   disabled={selectionCount < 3} />
          </div>

          <div className="w-px h-4 bg-gray-200" />
          {/* Layer order (needs ≥1 selected) */}
          <div className="flex items-center" title={selectionCount < 1 ? 'Select a widget to reorder' : undefined}>
            <AlignBtn onClick={() => reorderLayer('front')}    icon={BringToFront} title="Bring to front" disabled={selectionCount < 1} />
            <AlignBtn onClick={() => reorderLayer('forward')}  icon={ArrowUp}      title="Bring forward"  disabled={selectionCount < 1} />
            <AlignBtn onClick={() => reorderLayer('backward')} icon={ArrowDown}    title="Send backward"  disabled={selectionCount < 1} />
            <AlignBtn onClick={() => reorderLayer('back')}     icon={SendToBack}   title="Send to back"   disabled={selectionCount < 1} />
          </div>

          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span>Canvas</span>
            <input type="number" className="input-field w-16 text-xs py-0.5 text-center" value={canvasWidth}
              onChange={e => setCanvasWidth(Number(e.target.value))} step={10} />
            <span>×</span>
            <input type="number" className="input-field w-16 text-xs py-0.5 text-center" value={canvasHeight}
              onChange={e => setCanvasHeight(Number(e.target.value))} step={10} />
          </div>
          <div className="w-px h-4 bg-gray-200" />
          {saveMsg && (
            <span className={`text-xs font-medium ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
              {saveMsg}
            </span>
          )}
          <button onClick={handlePreview}
            className="btn-secondary flex items-center gap-1.5 py-1 text-xs px-3">
            <Eye size={12} /> Preview
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary flex items-center gap-1.5 py-1 text-xs px-3 disabled:opacity-60">
            <Save size={12} /> {saving ? 'Saving…' : dirty ? 'Save *' : 'Save'}
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel */}
          <aside className="w-[190px] shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Palette</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {PALETTE_CATEGORIES.map(cat => {
                const items = PALETTE_ITEMS.filter(i => i.category === cat.key)
                if (!items.length) return null
                return (
                  <div key={cat.key} className="space-y-1.5">
                    <div className="px-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{cat.label}</div>
                    {items.map(item => <PaletteItem key={item.type} item={item} />)}
                  </div>
                )
              })}

              {/* Library — saved, reusable widgets / groups. */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Library</span>
                  <button onClick={() => setLibManagerOpen(true)} title="Manage library"
                    className="text-gray-400 hover:text-[#1677ff] transition-colors p-0.5">
                    <Settings size={11} />
                  </button>
                </div>
                {libraryItems.length === 0
                  ? <p className="px-1 text-[9px] text-gray-400 leading-snug">Right-click a widget → “Save to Library”.</p>
                  : libraryItems.map(item => <LibraryPaletteItem key={item.id} item={item} />)}
              </div>
            </div>
            <div className="px-3 py-2 border-t border-gray-200 shrink-0">
              <p className="text-[9px] text-gray-400 text-center">Drag onto canvas</p>
            </div>
          </aside>

          {/* Canvas */}
          <main className="flex-1 overflow-auto bg-[#F3F6F9] flex items-start justify-center p-6">
            <div
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              style={{
                width: canvasWidth, height: canvasHeight,
                position: 'relative', flexShrink: 0,
                backgroundImage: showGrid ? gridBg : undefined,
                backgroundSize: '20px 20px',
              }}
              className="bg-white border border-gray-200 shadow-2xl"
            >
              {widgets
                .slice().sort((a,b) => (a.zIndex ?? 1) - (b.zIndex ?? 1))
                .map(w => (
                  <CanvasWidget key={w.id} widget={w}
                    isSelected={selectedIds.includes(w.id)}
                    showResizeHandle={selectionCount < 2}
                    snapEnabled={snapEnabled}
                    onBeginInteraction={beginInteraction}
                    onGroupMove={handleGroupMove}
                    onResize={handleResize}
                    onContextMenu={(e, id) => {
                      if (!selectionRef.current.includes(id)) setSelectedIds([id])
                      setContextMenu({ x: e.clientX, y: e.clientY, widgetId: id })
                    }}
                  />
                ))
              }
              {selectionCount >= 2 && (
                <GroupResizeOverlay
                  widgets={selectedWidgets}
                  snapEnabled={snapEnabled}
                  onBegin={beginGroupResize}
                  onResize={handleGroupResize}
                />
              )}
              {activePalette && (
                <div className="absolute inset-0 border-2 border-dashed border-[#1677ff]/40 pointer-events-none flex items-center justify-center">
                  <span className="text-[#1677ff]/60 text-sm font-medium">Drop {activePalette} here</span>
                </div>
              )}
              {marquee && (
                <div style={{
                  position: 'absolute', pointerEvents: 'none', zIndex: 9998,
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                  background: 'rgba(22,119,255,0.08)',
                  border: '1px solid #1677ff',
                }} />
              )}
            </div>
          </main>

          {/* Right Panel */}
          <aside className="w-[270px] shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
            <PropsPanel
              widget={selectedWidget}
              multiCount={selectionCount}
              selection={selectedWidgets}
              onChange={handleWidgetChange}
              onMultiChange={handleMultiChange}
              onDelete={() => handleDelete()}
              onBrowse={handleBrowse}
              pageOptions={pageOptions}
            />
          </aside>
        </div>
      </div>

      <DragOverlay>
        {activePalette && (
          <div className="px-3 py-2 rounded border bg-white border-[#1677ff] text-xs text-[#1677ff] shadow-xl">
            + {activePalette}
          </div>
        )}
      </DragOverlay>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          onCopy={handleCopy}
          onPaste={handlePaste}
          canPaste={clipboardRef.current.length > 0}
          onDuplicate={() => handleDuplicate(contextMenu.widgetId)}
          onSaveToLibrary={() => openSaveToLibrary(contextMenu.widgetId)}
          onDelete={() => handleDelete(contextMenu.widgetId)}
          onLayer={(mode) => {
            const ids = selectionRef.current.includes(contextMenu.widgetId)
              ? selectionRef.current : [contextMenu.widgetId]
            reorderLayer(mode, ids)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showMetaModal && (
        <MetaModal meta={meta} onSave={setMeta} onClose={() => setShowMetaModal(false)} />
      )}

      {showNewModal && (
        <NewPageModal onConfirm={handleNewPage} onClose={() => setShowNewModal(false)} />
      )}

      {assetPicker && (
        <AssetPickerModal
          filter={assetPicker.filter}
          onSelect={url => { assetPicker.callback(url); setAssetPicker(null) }}
          onClose={() => setAssetPicker(null)}
        />
      )}

      {saveLibTarget && (
        <SaveToLibraryModal
          widgets={saveLibTarget}
          categories={[...new Set(libraryItems.map(it => it.category || 'General'))].sort()}
          onClose={() => setSaveLibTarget(null)}
          onSaved={() => { setSaveLibTarget(null); reloadLibrary() }}
        />
      )}

      {libManagerOpen && (
        <LibraryManagerModal
          items={libraryItems}
          onChanged={reloadLibrary}
          onClose={() => setLibManagerOpen(false)}
        />
      )}

      {previewPrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewPrompt(false)}>
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md shadow-2xl animate-fade-in"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">Unsaved changes</h3>
              <button onClick={() => setPreviewPrompt(false)} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="p-5 text-sm text-gray-600 leading-relaxed">
              This page has unsaved changes. The preview shows the last <strong>saved</strong> version,
              so save first to preview your latest edits.
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setPreviewPrompt(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => { setPreviewPrompt(false); goPreview() }}
                className="btn-secondary">Preview anyway</button>
              <button onClick={saveThenPreview} disabled={saving} className="btn-primary disabled:opacity-60">
                {saving ? 'Saving…' : 'Save & Preview'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  )
}
