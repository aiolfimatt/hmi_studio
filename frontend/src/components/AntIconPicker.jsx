import React, { useState } from 'react'
import { X } from 'lucide-react'
import { ANT_ICON_NAMES, ANT_ICONS, toAntIconValue } from './widgets/antIcons'

/**
 * AntIconPicker — modal grid of the curated Ant Design icon set.
 * Props:
 *   onPick(value)  — called with `ant:<Name>` when an icon is chosen
 *   onClose()
 */
export default function AntIconPicker({ onPick, onClose }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const names = needle
    ? ANT_ICON_NAMES.filter(n => n.toLowerCase().includes(needle))
    : ANT_ICON_NAMES

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[560px] max-w-[92vw] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">Choose an icon</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>
        <div className="p-3 border-b border-gray-100">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search icons…"
            className="input-field w-full text-sm" />
        </div>
        <div className="p-3 overflow-auto grid grid-cols-8 gap-1.5">
          {names.map(name => {
            const Cmp = ANT_ICONS[name]
            return (
              <button key={name} title={name} onClick={() => { onPick(toAntIconValue(name)); onClose() }}
                className="aspect-square flex items-center justify-center rounded border border-gray-200
                  text-gray-600 hover:border-[#1677ff] hover:text-[#1677ff] hover:bg-[#e6f0ff] transition-colors">
                <Cmp style={{ fontSize: 20 }} />
              </button>
            )
          })}
          {names.length === 0 && (
            <p className="col-span-8 text-center text-xs text-gray-400 py-6">No icons match “{q}”.</p>
          )}
        </div>
      </div>
    </div>
  )
}
