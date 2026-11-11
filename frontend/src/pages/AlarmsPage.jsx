import React, { useState, useEffect, useCallback } from 'react'
import {
  Bell, BellOff, CheckCircle, XCircle, AlertTriangle,
  Info, AlertOctagon, Plus, Edit2, Trash2, X, Check,
  RefreshCw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Clock, Filter
} from 'lucide-react'
import { io } from 'socket.io-client'
import { alarms as alarmsApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { resolveText } from '../i18n/resolve'

// Build a { code: text } map from an alarm row's description_<code> columns.
function alarmDescMap(a) {
  const map = {}
  for (const k of Object.keys(a)) {
    if (k.startsWith('description_')) map[k.slice(12)] = a[k]
  }
  return map
}
// Resolve an alarm description for the active language, with graceful fallback.
function alarmDesc(a, lang, defaultLang) {
  return resolveText(alarmDescMap(a), lang, defaultLang) || a.description || a.alarm_code
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const SEVERITY_META = {
  info:     { icon: Info,          color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   dot: 'bg-blue-500',   label: 'Info'     },
  warning:  { icon: AlertTriangle, color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500', label: 'Warning'  },
  error:    { icon: AlertOctagon,  color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500', label: 'Error'    },
  critical: { icon: XCircle,       color: 'text-red-700',    bg: 'bg-red-50 border-red-200',     dot: 'bg-red-500',    label: 'Critical' },
}

function SeverityBadge({ severity }) {
  const m = SEVERITY_META[severity] ?? SEVERITY_META.info
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${m.color} ${m.bg}`}>
      <Icon size={9} />{m.label}
    </span>
  )
}

function fmtDate(s) {
  if (!s) return 'â€”'
  return new Date(s).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' })
}

function elapsed(s) {
  if (!s) return ''
  const ms = Date.now() - new Date(s).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

const PAGE_SIZE = 100

// ---------------------------------------------------------------------------
// Alarm Definition Modal
// ---------------------------------------------------------------------------
const EMPTY_DEF = { alarm_code: '', severity: 'warning' }
const PART_DATA_TYPES = ['INT16', 'INT32', 'UINT16', 'UINT32']

// Normalise a definition into the modal's working form, ensuring the composite
// fields always exist (two part slots), whether creating or editing.
function initDefForm(initial) {
  const base = initial ? { ...initial } : { ...EMPTY_DEF }
  const parts = Array.isArray(base.composite_parts) ? base.composite_parts.slice(0, 2) : []
  while (parts.length < 2) parts.push({ list_id: '', address: '', data_type: 'INT16' })
  return {
    ...base,
    composite: !!base.composite,
    composite_parts: parts.map(p => ({ list_id: p.list_id ?? '', address: p.address ?? '', data_type: p.data_type || 'INT16' })),
    composite_index_base: base.composite_index_base === 0 ? 0 : 1,
    composite_separator: typeof base.composite_separator === 'string' ? base.composite_separator : ' — ',
    composite_include_base: !!base.composite_include_base,
  }
}

function DefinitionModal({ initial, onConfirm, onClose }) {
  const { languages, defaultLang } = useLanguage()
  const isEdit = !!initial
  const [form, setForm] = useState(() => initDefForm(initial))
  const [lists, setLists] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setPart = (i, k, v) => setForm(f => ({
    ...f,
    composite_parts: f.composite_parts.map((p, j) => (j === i ? { ...p, [k]: v } : p)),
  }))

  useEffect(() => {
    alarmsApi.listLists().then(d => setLists(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!form.alarm_code) return setErr('Alarm code is required')
    setSaving(true); setErr(null)
    try {
      await onConfirm(form)
      onClose()
    } catch (e) {
      setErr(e.response?.data?.error ?? e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-lg shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">{isEdit ? 'Edit Alarm Definition' : 'Add Alarm Definition'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {err && <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-600">{err}</div>}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Alarm Code *</label>
            <input type="text" className="input-field font-mono" value={form.alarm_code}
              onChange={e => set('alarm_code', e.target.value.toUpperCase())} placeholder="ALM_001" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Severity</label>
            <select className="input-field" value={form.severity} onChange={e => set('severity', e.target.value)}>
              {Object.entries(SEVERITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-500">Descrizioni (per lingua)</label>
            {languages.map(l => (
              <div key={l.code} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-center" title={l.label}>{l.flag}</span>
                <input type="text" className="input-field flex-1"
                  value={form[`description_${l.code}`] ?? ''}
                  onChange={e => set(`description_${l.code}`, e.target.value)}
                  placeholder={l.code === defaultLang ? 'Alarm descriptionâ€¦' : ''} />
              </div>
            ))}
          </div>

          {/* Composite alarm — assemble the description from two shared lists,
              each indexed by a value read from the PLC when the alarm fires. */}
          <label className="flex items-center gap-2 pt-1 text-xs font-medium text-gray-700">
            <input type="checkbox" checked={form.composite}
              onChange={e => set('composite', e.target.checked)} />
            Composite alarm (compose description from two lists)
          </label>

          {form.composite && (
            <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
              <p className="text-[11px] text-gray-500 leading-snug">
                When this alarm fires, two row-numbers are read from the PLC; each picks an entry
                from its list and the entries are joined into the shown description.
              </p>
              {lists.length === 0 && (
                <p className="text-[11px] text-amber-700">No text lists defined yet — create them in the “Alarm Text Lists” section below.</p>
              )}
              {[0, 1].map(i => (
                <div key={i} className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-gray-600">Part {i + 1}</label>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <select className="input-field text-xs" value={form.composite_parts[i].list_id}
                      onChange={e => setPart(i, 'list_id', e.target.value)}>
                      <option value="">— list —</option>
                      {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <input className="input-field text-xs font-mono" placeholder="PLC address (e.g. 2030)"
                      value={form.composite_parts[i].address}
                      onChange={e => setPart(i, 'address', e.target.value)} />
                    <select className="input-field text-xs" value={form.composite_parts[i].data_type}
                      onChange={e => setPart(i, 'data_type', e.target.value)}>
                      {PART_DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Row numbering</label>
                  <select className="input-field text-xs" value={form.composite_index_base}
                    onChange={e => set('composite_index_base', Number(e.target.value))}>
                    <option value={1}>1-based (PLC 1 = first row)</option>
                    <option value={0}>0-based (PLC 0 = first row)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Separator</label>
                  <input className="input-field text-xs" value={form.composite_separator}
                    onChange={e => set('composite_separator', e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={form.composite_include_base}
                  onChange={e => set('composite_include_base', e.target.checked)} />
                Prepend the alarm’s own description to the composed text
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-60">
            {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={13} />}
            {isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alarm Definitions (collapsible section, admin only)
// ---------------------------------------------------------------------------
function AlarmDefinitions() {
  const { user } = useAuth()
  const { lang, defaultLang } = useLanguage()
  const [open, setOpen] = useState(false)
  const [defs, setDefs] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    alarmsApi.listDefinitions()
      .then(data => setDefs(Array.isArray(data) ? data : (data.definitions ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  if (!user || !user.capabilities?.editMode) return null

  const handleCreate = async (form) => { await alarmsApi.createDefinition(form); load() }
  const handleUpdate = async (form) => { await alarmsApi.updateDefinition(modal.data.id, form); load() }
  const handleDelete = async (id) => { await alarmsApi.deleteDefinition(id); load() }

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-700">Alarm Definitions</span>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{defs.length} defined</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          <div className="flex items-center justify-end gap-2 p-3 border-b border-gray-200">
            <button onClick={() => setModal({ mode: 'create', data: null })}
              className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
              <Plus size={12} /> Add Definition
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    {['Code','Severity','Description','Actions'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {defs.map(d => (
                    <tr key={d.id} className="border-b border-gray-200 hover:bg-gray-100 transition-colors">
                      <td className="px-3 py-2.5 font-mono font-semibold text-gray-700">
                        {d.alarm_code}
                        {d.composite && (
                          <span className="ml-1.5 align-middle inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border border-blue-200 bg-blue-50 text-blue-700 font-sans">composite</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><SeverityBadge severity={d.severity} /></td>
                      <td className="px-3 py-2.5 text-gray-700 max-w-xs truncate">
                        {d.composite ? <span className="text-gray-400 italic">composed at runtime from lists</span> : alarmDesc(d, lang, defaultLang)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setModal({ mode: 'edit', data: d })}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                            <Edit2 size={11} />
                          </button>
                          <button onClick={() => setConfirm({ id: d.id, code: d.alarm_code })}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {defs.length === 0 && (
                <div className="py-8 text-center text-sm text-gray-500">No alarm definitions yet</div>
              )}
            </div>
          )}
        </div>
      )}

      {modal?.mode === 'create' && <DefinitionModal onConfirm={handleCreate} onClose={() => setModal(null)} />}
      {modal?.mode === 'edit' && <DefinitionModal initial={modal.data} onConfirm={handleUpdate} onClose={() => setModal(null)} />}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white border border-gray-200 rounded-xl max-w-sm w-full p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-800 mb-4">Delete alarm definition <strong className="font-mono text-red-600">{confirm.code}</strong>?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
              <button onClick={() => { handleDelete(confirm.id); setConfirm(null) }} className="btn-danger text-xs py-1.5 flex items-center gap-1.5">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alarm Text List Modal (shared lists used by composite alarms)
// ---------------------------------------------------------------------------
function ListModal({ initial, onConfirm, onClose }) {
  const { languages, defaultLang } = useLanguage()
  const isEdit = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [entries, setEntries] = useState(() =>
    (initial?.entries?.length ? initial.entries.map(e => ({ ...e })) : [{}]))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const setCell = (i, code, v) => setEntries(es => es.map((e, j) => (j === i ? { ...e, [code]: v } : e)))
  const addRow = () => setEntries(es => [...es, {}])
  const removeRow = (i) => setEntries(es => es.filter((_, j) => j !== i))

  const handleSubmit = async () => {
    if (!name.trim()) return setErr('List name is required')
    setSaving(true); setErr(null)
    try {
      await onConfirm({ name: name.trim(), entries })
      onClose()
    } catch (e) {
      setErr(e.response?.data?.error ?? e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-2xl shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">{isEdit ? 'Edit Text List' : 'Add Text List'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-600">{err}</div>}
          <div>
            <label className="block text-xs text-gray-500 mb-1">List Name *</label>
            <input type="text" className="input-field" value={name}
              onChange={e => setName(e.target.value)} placeholder="motors" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Entries (row number = value read from the PLC)</label>
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto border border-gray-200 rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 w-10 text-left text-[10px] font-bold text-gray-500">#</th>
                    {languages.map(l => (
                      <th key={l.code} className="px-2 py-2 text-left text-[10px] font-bold text-gray-500" title={l.label}>{l.flag} {l.code.toUpperCase()}</th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-gray-400 font-mono">{i + 1}</td>
                      {languages.map(l => (
                        <td key={l.code} className="px-1 py-1">
                          <input className="input-field text-xs py-1" value={e[l.code] ?? ''}
                            onChange={ev => setCell(i, l.code, ev.target.value)}
                            placeholder={l.code === defaultLang ? '…' : ''} />
                        </td>
                      ))}
                      <td className="px-1 py-1 text-center">
                        <button onClick={() => removeRow(i)}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addRow} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5 mt-2">
              <Plus size={12} /> Add row
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-60">
            {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={13} />}
            {isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alarm Text Lists (collapsible section, admin only)
// ---------------------------------------------------------------------------
function AlarmLists() {
  const { user } = useAuth()
  const { lang, defaultLang } = useLanguage()
  const [open, setOpen] = useState(false)
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    alarmsApi.listLists()
      .then(d => setLists(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  if (!user || !user.capabilities?.editMode) return null

  const handleCreate = async (form) => { await alarmsApi.createList(form); load() }
  const handleUpdate = async (form) => { await alarmsApi.updateList(modal.data.id, form); load() }
  const handleDelete = async (id) => { await alarmsApi.deleteList(id); load() }

  const preview = (l) => resolveText(l.entries?.[0] ?? null, lang, defaultLang)

  return (
    <div className="panel overflow-hidden mt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-700">Alarm Text Lists</span>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{lists.length} list{lists.length === 1 ? '' : 's'}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          <div className="flex items-center justify-between gap-2 p-3 border-b border-gray-200">
            <span className="text-[11px] text-gray-500">Reusable text lists for composite alarms (e.g. a “motors” list and a “causes” list).</span>
            <button onClick={() => setModal({ mode: 'create', data: null })}
              className="btn-primary text-xs py-1.5 flex items-center gap-1.5 shrink-0">
              <Plus size={12} /> Add List
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    {['Name', 'Entries', 'First entry', 'Actions'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lists.map(l => (
                    <tr key={l.id} className="border-b border-gray-200 hover:bg-gray-100 transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-gray-700">{l.name}</td>
                      <td className="px-3 py-2.5 text-gray-500">{l.entries?.length ?? 0}</td>
                      <td className="px-3 py-2.5 text-gray-700 max-w-xs truncate">{preview(l)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setModal({ mode: 'edit', data: l })}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                            <Edit2 size={11} />
                          </button>
                          <button onClick={() => setConfirm({ id: l.id, name: l.name })}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lists.length === 0 && (
                <div className="py-8 text-center text-sm text-gray-500">No text lists yet</div>
              )}
            </div>
          )}
        </div>
      )}

      {modal?.mode === 'create' && <ListModal onConfirm={handleCreate} onClose={() => setModal(null)} />}
      {modal?.mode === 'edit' && <ListModal initial={modal.data} onConfirm={handleUpdate} onClose={() => setModal(null)} />}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white border border-gray-200 rounded-xl max-w-sm w-full p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-800 mb-4">Delete text list <strong className="text-red-600">{confirm.name}</strong>? Composite alarms referencing it will fall back to their generic description.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
              <button onClick={() => { handleDelete(confirm.id); setConfirm(null) }} className="btn-danger text-xs py-1.5 flex items-center gap-1.5">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function AlarmsPage() {
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
            <Bell size={20} className="text-red-500" /> Alarms
          </h1>
          <p className="text-xs text-gray-500 mt-1">Alarm definitions and composite text lists</p>
        </div>
      </div>

      {/* Alarm Definitions */}
      <AlarmDefinitions />

      {/* Shared text lists for composite alarms */}
      <AlarmLists />
    </div>
  )
}
