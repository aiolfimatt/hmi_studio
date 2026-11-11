import React, { useState, useEffect, useCallback } from 'react'
import {
  FlaskConical, Plus, Edit2, Trash2, X, Check,
  Play, RefreshCw, AlertCircle, ChevronDown, ChevronUp,
  Copy, Download
} from 'lucide-react'
import { recipes as recipesApi, plc as plcApi } from '../api/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

function tryParseJson(str) {
  try { return { ok: true, val: JSON.parse(str) } }
  catch (e) { return { ok: false, err: e.message } }
}

// ---------------------------------------------------------------------------
// JSON Editor with validation
// ---------------------------------------------------------------------------
function JsonEditor({ value, onChange }) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? {}, null, 2))
  const [err, setErr] = useState(null)

  const handleChange = (text) => {
    setRaw(text)
    const res = tryParseJson(text)
    if (res.ok) { setErr(null); onChange(res.val) }
    else setErr(res.err)
  }

  return (
    <div>
      <textarea
        className={`w-full font-mono text-xs bg-white border rounded-md px-3 py-2 resize-y
          text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 transition-colors
          ${err ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
        rows={10}
        value={raw}
        onChange={e => handleChange(e.target.value)}
        spellCheck={false}
      />
      {err && (
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-red-600">
          <AlertCircle size={10} /> {err}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recipe Modal
// ---------------------------------------------------------------------------
const EMPTY_FORM = { name: '', parameters: {} }

function RecipeModal({ initial, onConfirm, onClose }) {
  const isEdit = !!initial
  const [form, setForm] = useState(initial
    ? { ...initial, parameters: initial.parameters ?? {} }
    : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name) return setErr('Recipe name is required')
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
          <h3 className="text-sm font-semibold text-gray-800">{isEdit ? `Edit Recipe: ${initial.name}` : 'New Recipe'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-600">{err}</div>}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Recipe Name *</label>
            <input type="text" className="input-field" value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="e.g. Recipe A" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Parameters (JSON)</label>
            <JsonEditor value={form.parameters} onChange={v => set('parameters', v)} />
            <p className="text-[10px] text-gray-400 mt-1.5">
              Keys should match PLC tag addresses. Example: {"{"}"DB1.DBW0": 100, "DB1.DBW2": 50{"}"}
            </p>
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
// Apply Recipe Modal
// ---------------------------------------------------------------------------
function ApplyModal({ recipe, onClose }) {
  const [applying, setApplying] = useState(false)
  const [progress, setProgress] = useState([]) // [{key, status: 'pending'|'ok'|'error', error}]
  const [done, setDone] = useState(false)

  const entries = Object.entries(recipe.parameters ?? {})

  const handleApply = async () => {
    setApplying(true)
    setProgress(entries.map(([k]) => ({ key: k, status: 'pending' })))
    const results = []
    for (const [key, value] of entries) {
      try {
        await plcApi.write(key, value)
        results.push({ key, status: 'ok' })
      } catch (e) {
        results.push({ key, status: 'error', error: e.response?.data?.error ?? e.message })
      }
      setProgress([...results, ...entries.slice(results.length).map(([k]) => ({ key: k, status: 'pending' }))])
    }
    setProgress(results)
    setApplying(false)
    setDone(true)
  }

  const successCount = progress.filter(p => p.status === 'ok').length
  const errorCount = progress.filter(p => p.status === 'error').length

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={!applying ? onClose : undefined}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Apply Recipe</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {recipe.name}
            </p>
          </div>
          {!applying && <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>}
        </div>
        <div className="p-5">
          {progress.length === 0 ? (
            <div>
              <p className="text-sm text-gray-700 mb-3">
                This will write {entries.length} parameter{entries.length !== 1 ? 's' : ''} to the machine.
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                {entries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-1 border-b border-gray-200 last:border-0">
                    <span className="text-xs font-mono text-gray-500">{k}</span>
                    <span className="text-xs font-mono text-gray-800">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {progress.map(p => (
                <div key={p.key} className="flex items-center gap-2 py-1">
                  {p.status === 'pending' && (
                    <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                  {p.status === 'ok' && <Check size={12} className="text-emerald-500 shrink-0" />}
                  {p.status === 'error' && <X size={12} className="text-red-500 shrink-0" />}
                  <span className="text-xs font-mono text-gray-500 flex-1 truncate">{p.key}</span>
                  {p.status === 'error' && <span className="text-[10px] text-red-600 truncate max-w-32">{p.error}</span>}
                </div>
              ))}
            </div>
          )}

          {done && (
            <div className={`mt-3 p-3 rounded-lg border text-xs
              ${errorCount === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {errorCount === 0
                ? `All ${successCount} parameters applied successfully`
                : `${successCount} ok, ${errorCount} failed`}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary" disabled={applying}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button onClick={handleApply} disabled={applying || entries.length === 0}
              className="btn-primary flex items-center gap-2 disabled:opacity-60">
              {applying ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
              {applying ? 'Applying…' : 'Apply'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recipe Row (expandable)
// ---------------------------------------------------------------------------
function RecipeRow({ recipe, onEdit, onDelete, onApply }) {
  const [expanded, setExpanded] = useState(false)
  const paramCount = Object.keys(recipe.parameters ?? {}).length

  return (
    <>
      <tr className={`border-b border-gray-200 hover:bg-gray-100 transition-colors ${expanded ? 'bg-gray-50' : ''}`}>
        <td className="px-4 py-3">
          <button onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-2 text-left group">
            {expanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
            <span className="text-sm font-semibold text-gray-800 group-hover:text-[#1677ff] transition-colors">{recipe.name}</span>
          </button>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-500">{paramCount} parameter{paramCount !== 1 ? 's' : ''}</span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{recipe.created_by || '—'}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(recipe.created_at)}</td>
        <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(recipe.updated_at)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button onClick={() => onApply(recipe)}
              className="p-1.5 rounded hover:bg-emerald-50 text-gray-500 hover:text-emerald-600 transition-colors" title="Apply to machine">
              <Play size={12} />
            </button>
            <button onClick={() => onEdit(recipe)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors" title="Edit">
              <Edit2 size={12} />
            </button>
            <button onClick={() => onDelete(recipe)}
              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-200">
          <td colSpan={7} className="px-4 pb-3 pt-0">
            <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              {paramCount === 0 ? (
                <p className="text-xs text-gray-400">No parameters defined</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {Object.entries(recipe.parameters).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between bg-white rounded px-2 py-1.5 border border-gray-200">
                      <span className="text-[10px] font-mono text-gray-500 truncate mr-1">{k}</span>
                      <span className="text-[10px] font-mono font-semibold text-gray-800 shrink-0">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function RecipesPage() {
  const [recipeList, setRecipeList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // null | { mode, data }
  const [applyModal, setApplyModal] = useState(null) // recipe
  const [confirmDel, setConfirmDel] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    recipesApi.list()
      .then(data => setRecipeList(Array.isArray(data) ? data : (data.recipes ?? [])))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (form) => { await recipesApi.create(form); load() }
  const handleUpdate = async (form) => { await recipesApi.update(modal.data.id, form); load() }
  const handleDelete = async (id) => { await recipesApi.deleteRecipe(id); load() }

  const filtered = recipeList

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
            <FlaskConical size={20} className="text-emerald-500" /> Recipe Management
          </h1>
          <p className="text-xs text-gray-500 mt-1">Parameter sets for machine process configuration</p>
        </div>
        <button onClick={() => setModal({ mode: 'create', data: null })}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> New Recipe
        </button>
      </div>

      {/* Count */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-400">{filtered.length} recipe{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600 mb-4">{error}</div>
      )}

      {/* Table */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FlaskConical size={32} className="text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No recipes found</p>
            <button onClick={() => setModal({ mode: 'create', data: null })}
              className="btn-primary mt-4 mx-auto flex items-center gap-2 text-xs">
              <Plus size={12} /> Create Recipe
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Name','Parameters','Created By','Created','Updated','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <RecipeRow
                    key={r.id}
                    recipe={r}
                    onEdit={rec => setModal({ mode: 'edit', data: rec })}
                    onDelete={rec => setConfirmDel(rec)}
                    onApply={rec => setApplyModal(rec)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal?.mode === 'create' && <RecipeModal onConfirm={handleCreate} onClose={() => setModal(null)} />}
      {modal?.mode === 'edit' && <RecipeModal initial={modal.data} onConfirm={handleUpdate} onClose={() => setModal(null)} />}
      {applyModal && <ApplyModal recipe={applyModal} onClose={() => setApplyModal(null)} />}
      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="bg-white border border-gray-200 rounded-xl max-w-sm w-full p-5 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-800 mb-4">
              Delete recipe <strong className="text-red-600">"{confirmDel.name}"</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDel(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
              <button onClick={() => { handleDelete(confirmDel.id); setConfirmDel(null) }}
                className="btn-danger text-xs py-1.5 flex items-center gap-1.5">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
