import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Shield, Plus, Edit2, Trash2, X, Check, GitBranch, Users as UsersIcon, Settings, ScrollText } from 'lucide-react'
import { groups as groupsApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

// ---------------------------------------------------------------------------
// Closure / cycle helpers (mirror backend services/groups.js for live UI feedback)
// ---------------------------------------------------------------------------
function indexById(list) {
  const m = new Map()
  for (const g of list) m.set(Number(g.id), g)
  return m
}
function closureOf(id, index) {
  if (!index.has(Number(id))) return []
  const out = [], seen = new Set(), stack = [Number(id)]
  while (stack.length) {
    const cur = stack.pop()
    if (seen.has(cur)) continue
    seen.add(cur)
    const g = index.get(cur)
    if (!g) continue
    out.push(cur)
    for (const inc of g.includes || []) stack.push(Number(inc))
  }
  return out
}
// Would adding `candidate` to `selfId`'s includes (given the current proposed
// includes) create a cycle? i.e. is selfId reachable from candidate?
function createsCycle(list, selfId, proposedIncludes, candidate) {
  const index = indexById(list)
  index.set(Number(selfId), { id: Number(selfId), includes: [...proposedIncludes, candidate] })
  const seen = new Set(), stack = [Number(candidate)]
  while (stack.length) {
    const cur = stack.pop()
    if (cur === Number(selfId)) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    const g = index.get(cur)
    if (!g) continue
    for (const inc of g.includes || []) stack.push(Number(inc))
  }
  return false
}

// ---------------------------------------------------------------------------
// Group modal
// ---------------------------------------------------------------------------
function GroupModal({ initial, allGroups, onConfirm, onClose }) {
  const isEdit = !!initial
  const [form, setForm] = useState(initial
    ? { name: initial.name, includes: [...(initial.includes || [])], manageUsers: !!initial.manageUsers, editMode: !!initial.editMode, viewAudit: !!initial.viewAudit }
    : { name: '', includes: [], manageUsers: false, editMode: false, viewAudit: false })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const selfId = initial?.id
  // Other groups eligible to be included (exclude self; exclude ones that would cycle).
  const candidates = allGroups.filter(g => g.id !== selfId)

  const toggleInclude = (gid) => {
    setErr(null)
    setForm(f => {
      if (f.includes.includes(gid)) return { ...f, includes: f.includes.filter(x => x !== gid) }
      if (selfId && createsCycle(allGroups, selfId, f.includes, gid)) {
        setErr('That would create a cycle in the hierarchy')
        return f
      }
      return { ...f, includes: [...f.includes, gid] }
    })
  }

  // Preview the effective closure (direct + inherited) for the current selection.
  const closurePreview = useMemo(() => {
    const virtual = [...allGroups.filter(g => g.id !== selfId), { id: selfId ?? -1, includes: form.includes }]
    const ids = closureOf(selfId ?? -1, indexById(virtual)).filter(x => x !== (selfId ?? -1))
    const byId = indexById(allGroups)
    return ids.map(x => byId.get(x)?.name).filter(Boolean)
  }, [form.includes, allGroups, selfId])

  const submit = async () => {
    if (!form.name.trim()) return setErr('Name is required')
    setSaving(true); setErr(null)
    try { await onConfirm({ ...form, name: form.name.trim() }); onClose() }
    catch (e) { setErr(e.response?.data?.error ?? e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">{isEdit ? 'Edit Group' : 'Add Group'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-600">{err}</div>}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Name *</label>
            <input type="text" className="input-field" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            {initial?.builtin && <p className="text-[10px] text-amber-600 mt-1">Built-in group — rename with care.</p>}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><GitBranch size={12} /> Inherits from</label>
            {candidates.length === 0 ? (
              <p className="text-[11px] text-gray-400">No other groups to inherit from.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {candidates.map(g => {
                  const on = form.includes.includes(g.id)
                  return (
                    <button key={g.id} type="button" onClick={() => toggleInclude(g.id)}
                      className={`text-[11px] rounded-full px-2.5 py-1 border transition-colors ${on
                        ? 'bg-[#1677ff] text-white border-[#1677ff]'
                        : 'bg-gray-50 text-gray-600 border-gray-300 hover:border-[#1677ff]'}`}>
                      {g.name}
                    </button>
                  )
                })}
              </div>
            )}
            {closurePreview.length > 0 && (
              <p className="text-[10px] text-gray-400 mt-1.5">Effective access (incl. inherited): {closurePreview.join(', ')}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.editMode}
                onChange={e => setForm(f => ({ ...f, editMode: e.target.checked }))} />
              <Settings size={13} className="text-gray-500" /> Edit mode (access the designer / management area)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.manageUsers}
                onChange={e => setForm(f => ({ ...f, manageUsers: e.target.checked }))} />
              <UsersIcon size={13} className="text-gray-500" /> Manage users (create/remove, assign groups — at runtime)
            </label>
            <label className={`flex items-center gap-2 text-xs text-gray-700 ${form.editMode ? 'opacity-60' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={form.viewAudit || form.editMode} disabled={form.editMode}
                onChange={e => setForm(f => ({ ...f, viewAudit: e.target.checked }))} />
              <ScrollText size={13} className="text-gray-500" /> View audit trail (runtime audit widget{form.editMode ? ' — included with edit mode' : ''})
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-60">
            {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={13} />}
            {isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6"><p className="text-sm text-gray-800">{message}</p></div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => { onConfirm(); onClose() }} className="btn-danger flex items-center gap-2">
            <Trash2 size={12} /> Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function GroupsPage() {
  const { isAdmin } = useAuth()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    groupsApi.list()
      .then(d => setList(Array.isArray(d) ? d : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const byId = useMemo(() => indexById(list), [list])

  const handleCreate = async (form) => { await groupsApi.create(form); load() }
  const handleUpdate = async (id, form) => { await groupsApi.update(id, form); load() }
  const handleDelete = async (id) => {
    try { await groupsApi.remove(id); load() }
    catch (e) { setError(e.response?.data?.error ?? e.message) }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center p-8">
        <Shield size={32} className="text-red-500" />
        <p className="text-sm text-gray-500">Edit-mode access required</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-[#1677ff]" /> Groups
          </h1>
          <p className="text-xs text-gray-500 mt-1">Named access groups, inheritance hierarchy and capabilities. Groups travel with the project.</p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Add Group
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600 mb-4">{error}</div>}

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <Shield size={32} className="text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No groups defined</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Name', 'Inherits from', 'Capabilities', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(g => (
                  <tr key={g.id} className="border-b border-gray-200 hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {g.name}
                      {g.builtin && <span className="ml-2 text-[9px] text-gray-500 bg-gray-100 border border-gray-200 rounded px-1">built-in</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(g.includes || []).length === 0
                          ? <span className="text-xs text-gray-400">— isolated</span>
                          : (g.includes || []).map(id => (
                            <span key={id} className="text-[10px] rounded-full px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-600">
                              {byId.get(Number(id))?.name ?? `#${id}`}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {g.editMode && <span className="text-[10px] rounded-full px-2 py-0.5 bg-[#e6f0ff] border border-blue-200 text-[#1677ff]">editMode</span>}
                        {g.manageUsers && <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700">manageUsers</span>}
                        {g.viewAudit && !g.editMode && <span className="text-[10px] rounded-full px-2 py-0.5 bg-violet-50 border border-violet-200 text-violet-700">viewAudit</span>}
                        {!g.editMode && !g.manageUsers && !g.viewAudit && <span className="text-xs text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModal({ mode: 'edit', data: g })}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700" title="Edit">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => setConfirm({ message: `Delete group "${g.name}"?`, action: () => handleDelete(g.id) })}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Delete">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.mode === 'create' && (
        <GroupModal allGroups={list} onConfirm={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <GroupModal initial={modal.data} allGroups={list}
          onConfirm={(form) => handleUpdate(modal.data.id, form)} onClose={() => setModal(null)} />
      )}
      {confirm && (
        <ConfirmDialog message={confirm.message} onConfirm={confirm.action} onClose={() => setConfirm(null)} />
      )}
    </div>
  )
}
