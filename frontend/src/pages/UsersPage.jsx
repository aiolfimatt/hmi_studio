import React, { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import {
  Users, Plus, Edit2, Trash2, X, Check, Eye, EyeOff,
  ShieldCheck, UserCheck, UserX, Lock, Unlock, AlertTriangle
} from 'lucide-react'
import { users as usersApi, groups as groupsApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}
// "YYYY-MM-DD HH:MM:SS" | ISO → "YYYY-MM-DD" for <input type=date>
function toDateInput(s) { return s ? String(s).slice(0, 10) : '' }

const EMPTY_FORM = {
  username: '', password: '', full_name: '', email: '',
  group: null, password_never_expires: false, password_expires_at: '',
}

// ---------------------------------------------------------------------------
// User Modal
// ---------------------------------------------------------------------------
function UserModal({ initial, groups, onConfirm, onClose }) {
  const isEdit = !!initial
  const [form, setForm] = useState(initial
    ? { ...EMPTY_FORM, ...initial, password: '', password_expires_at: toDateInput(initial.password_expires_at) }
    : { ...EMPTY_FORM, group: groups[0]?.id ?? null })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.username) return setErr('Username is required')
    if (!isEdit && !form.password) return setErr('Password is required')
    setSaving(true); setErr(null)
    try {
      const payload = {
        username: form.username, full_name: form.full_name, email: form.email,
        group: form.group, password_never_expires: !!form.password_never_expires,
        password_expires_at: form.password_never_expires ? null : (form.password_expires_at || null),
      }
      if (form.password) payload.password = form.password
      await onConfirm(payload)
      onClose()
    } catch (e) {
      setErr(e.response?.data?.error ?? e.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">{isEdit ? 'Edit User' : 'Add User'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-600">{err}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Username *</label>
              <input type="text" className="input-field" value={form.username}
                onChange={e => set('username', e.target.value)} disabled={isEdit} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{isEdit ? 'New Password' : 'Password *'}</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} className="input-field pr-8"
                  value={form.password} onChange={e => set('password', e.target.value)}
                  placeholder={isEdit ? 'Leave blank to keep' : ''} />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                  {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Full Name</label>
            <input type="text" className="input-field" value={form.full_name ?? ''}
              onChange={e => set('full_name', e.target.value)} />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input type="email" className="input-field" value={form.email ?? ''}
              onChange={e => set('email', e.target.value)} />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Group</label>
            <select className="input-field" value={form.group ?? ''}
              onChange={e => set('group', e.target.value === '' ? null : Number(e.target.value))}>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">The group determines what this user can access and manage.</p>
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={!!form.password_never_expires}
                onChange={e => set('password_never_expires', e.target.checked)} />
              Password never expires
            </label>
            <div className={form.password_never_expires ? 'opacity-40 pointer-events-none' : ''}>
              <label className="block text-xs text-gray-500 mb-1">Password expires on</label>
              <input type="date" className="input-field" value={form.password_expires_at ?? ''}
                onChange={e => set('password_expires_at', e.target.value)} />
              <p className="text-[10px] text-gray-400 mt-1">Leave blank to use the configured lifetime. Changing the password resets this.</p>
            </div>
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
export default function UsersPage({ auth = null }) {
  // The /edit route uses the shared session (useAuth + api/client). The runtime
  // `users_panel` widget injects `auth` = the in-memory operator credential, so
  // this page acts as whoever logged in AT RUNTIME — not a stale /edit session.
  const authCtx = useAuth()
  const canManageUsers = auth ? !!auth.canManageUsers : authCtx.canManageUsers
  const me = auth ? (auth.user ?? true) : authCtx.user
  // Whether the current operator is a full administrator (editMode). A
  // non-administrator user-manager may not touch administrator accounts.
  const amAdmin = auth ? !!auth.isAdmin : !!authCtx.isAdmin

  // API bound to the correct token: a scoped client for the runtime credential
  // (deliberately WITHOUT the shared client's global 401→/edit redirect), else
  // the shared /edit-session client.
  const api = useMemo(() => {
    if (auth?.token) {
      const c = axios.create({ baseURL: '/api', headers: { Authorization: `Bearer ${auth.token}` } })
      return {
        listUsers:  () => c.get('/users').then(r => r.data),
        listGroups: () => c.get('/groups').then(r => r.data),
        create:     (d) => c.post('/users', d).then(r => r.data),
        update:     (id, d) => c.put(`/users/${id}`, d).then(r => r.data),
        unlock:     (id) => c.post(`/users/${id}/unlock`).then(r => r.data),
        remove:     (id) => c.delete(`/users/${id}`).then(r => r.data),
      }
    }
    return {
      listUsers:  usersApi.list,  listGroups: groupsApi.list,
      create:     usersApi.create, update: usersApi.update,
      unlock:     usersApi.unlock, remove: usersApi.deleteUser,
    }
  }, [auth?.token])

  const [userList, setUserList] = useState([])
  const [groupList, setGroupList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const groupName = useCallback(
    (id) => groupList.find(g => Number(g.id) === Number(id))?.name ?? null,
    [groupList]
  )

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([api.listUsers(), api.listGroups().catch(() => [])])
      .then(([u, g]) => {
        setUserList(Array.isArray(u) ? u : (u.users ?? []))
        setGroupList(Array.isArray(g) ? g : [])
      })
      .catch(e => setError(e.response?.data?.error ?? e.message))
      .finally(() => setLoading(false))
  }, [api])
  useEffect(() => { load() }, [load])

  const handleCreate = async (form) => { await api.create(form); load() }
  const handleUpdate = async (form) => { await api.update(modal.data.id, form); load() }
  const handleToggleActive = async (u) => { await api.update(u.id, { is_active: !u.is_active }); load() }
  const handleDelete = async (id) => { await api.remove(id); load() }
  const handleUnlock = async (id) => { await api.unlock(id); load() }

  if (me && !canManageUsers) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center p-8">
        <ShieldCheck size={32} className="text-red-500" />
        <p className="text-sm text-gray-500">Access restricted — the “manage users” capability is required</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
            <Users size={20} className="text-[#1677ff]" /> User Management
          </h1>
          <p className="text-xs text-gray-500 mt-1">Manage accounts, group assignment and password expiry</p>
        </div>
        <button onClick={() => setModal({ mode: 'create', data: null })}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Add User
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600 mb-4">{error}</div>}

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : userList.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={32} className="text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Username','Full Name','Group','Password','Status','Created','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userList.map(u => {
                  const isSelf = u.id === me?.id || u.username === me?.username
                  const gName = groupName(u.group)
                  // An administrator account that a non-administrator may not touch.
                  const protectedAdmin = !amAdmin && u.is_admin
                  return (
                    <tr key={u.id} className={`border-b border-gray-200 hover:bg-gray-100 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">
                        {u.username}
                        {isSelf && <span className="ml-2 text-[9px] text-[#1677ff] bg-[#e6f0ff] border border-blue-200 rounded px-1">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{u.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        {u.orphaned ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-amber-700 bg-amber-50 border border-amber-200" title="This user's group is not in the loaded project">
                            <AlertTriangle size={9} /> orphaned
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-gray-700">{gName ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.password_never_expires
                          ? <span className="text-gray-400">never expires</span>
                          : (u.password_expires_at ? `expires ${fmtDate(u.password_expires_at)}` : '—')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${u.is_active
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                              : 'text-gray-500 bg-gray-100 border border-gray-200'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {u.locked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-red-600 bg-red-50 border border-red-200" title="Locked due to failed attempts">
                              <Lock size={9} /> Locked
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        {protectedAdmin ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400"
                            title="Administrator account — only an administrator can modify it">
                            <ShieldCheck size={12} /> admin-protected
                          </span>
                        ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setModal({ mode: 'edit', data: u })}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700" title="Edit">
                            <Edit2 size={12} />
                          </button>
                          {u.locked && (
                            <button onClick={() => handleUnlock(u.id)}
                              className="p-1.5 rounded hover:bg-emerald-50 text-gray-500 hover:text-emerald-600" title="Unlock account">
                              <Unlock size={12} />
                            </button>
                          )}
                          <button onClick={() => handleToggleActive(u)}
                            className={`p-1.5 rounded transition-colors ${u.is_active
                                ? 'hover:bg-amber-50 text-gray-500 hover:text-amber-600'
                                : 'hover:bg-emerald-50 text-gray-500 hover:text-emerald-600'}`}
                            title={u.is_active ? 'Deactivate' : 'Activate'} disabled={isSelf}>
                            {u.is_active ? <UserX size={12} /> : <UserCheck size={12} />}
                          </button>
                          <button onClick={() => setConfirm({
                              message: `Delete user "${u.username}"? This cannot be undone.`,
                              action: () => handleDelete(u.id)
                            })}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-30"
                            title="Delete" disabled={isSelf}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.mode === 'create' && (
        <UserModal groups={groupList} onConfirm={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <UserModal initial={modal.data} groups={groupList} onConfirm={handleUpdate} onClose={() => setModal(null)} />
      )}
      {confirm && (
        <ConfirmDialog message={confirm.message} onConfirm={confirm.action} onClose={() => setConfirm(null)} />
      )}
    </div>
  )
}
