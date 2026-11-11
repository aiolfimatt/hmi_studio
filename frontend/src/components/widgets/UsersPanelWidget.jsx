import React from 'react'
import { Users, Plus, Edit2, Trash2, Lock } from 'lucide-react'
import UsersPage from '../../pages/UsersPage'

/**
 * UsersPanelWidget — embeds the full User Management page (UsersPage) as a
 * placeable "special page" widget.
 *
 * Runtime: binds UsersPage to the RUNTIME operator credential (`auth`, the
 * in-memory cred from MonitorPage's login prompt) — NOT the shared /edit
 * session. So it reflects whoever logged in at runtime, and requires that
 * operator to hold the `manageUsers` capability. When no sufficient credential
 * is held it shows a locked prompt that opens the runtime login.
 *
 * Editor: renders a lightweight static preview instead of the live page, so the
 * canvas doesn't fire user/group API calls or mount modals while designing.
 */

const SAMPLE_ROWS = [
  { username: 'admin',    full_name: 'Administrator', group: 'Admins',    active: true },
  { username: 'operator', full_name: 'Line Operator', group: 'Operators', active: true },
  { username: 'service',  full_name: 'Service Tech',  group: 'Service',   active: false },
]

function EditorPreview() {
  return (
    <div className="w-full h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm select-none flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Users size={16} className="text-[#1677ff]" /> User Management
        </span>
        <span className="flex items-center gap-1 rounded bg-[#1677ff] px-2 py-1 text-[10px] font-medium text-white">
          <Plus size={11} /> Add User
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              {['Username', 'Full Name', 'Group', 'Status', ''].map((h, i) => (
                <th key={i} className="text-left px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ROWS.map(r => (
              <tr key={r.username} className={`border-b border-gray-100 ${!r.active ? 'opacity-50' : ''}`}>
                <td className="px-3 py-1.5 font-mono font-semibold text-gray-800">{r.username}</td>
                <td className="px-3 py-1.5 text-gray-700">{r.full_name}</td>
                <td className="px-3 py-1.5 text-gray-700">{r.group}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${r.active
                    ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                    : 'text-gray-500 bg-gray-100 border border-gray-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${r.active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    {r.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1 text-gray-400">
                    <Edit2 size={11} /><Trash2 size={11} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Runtime locked state — shown when no operator credential with the manageUsers
// capability is held. The button opens the runtime login prompt (onLogin).
function LockedPanel({ onLogin }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 rounded-lg border border-gray-200 bg-white shadow-sm p-8 text-center">
      <Lock size={30} className="text-gray-400" />
      <p className="text-sm text-gray-500 max-w-xs">
        User management requires an operator with the “Manage Users” permission.
      </p>
      {onLogin && (
        <button onClick={onLogin} className="btn-primary flex items-center gap-2 text-sm">
          <Users size={14} /> Log in
        </button>
      )}
    </div>
  )
}

export default function UsersPanelWidget({ editor = false, auth = null, onLogin }) {
  if (editor) return <EditorPreview />
  // Runtime: require a held credential with manageUsers; otherwise prompt.
  if (!auth?.token || !auth?.canManageUsers) return <LockedPanel onLogin={onLogin} />
  return (
    <div className="w-full h-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <UsersPage auth={auth} />
    </div>
  )
}
