import React, { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

/**
 * GraphWidget — time-series line chart of PLC values
 * Props:
 *   widgetProps: { label, color, yMin, yMax, timeWindowSec, plcAddress }
 *   value: incoming numeric value from Socket.IO
 */

const MAX_POINTS = 300

function formatTs(ts) {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export default function GraphWidget({ widgetProps = {}, value }) {
  const {
    label        = '',
    color        = '#3b82f6',
    yMin         = 0,
    yMax         = 100,
    timeWindowSec = 60,
  } = widgetProps

  const [history, setHistory] = useState([])
  const prevValueRef = useRef(undefined)

  useEffect(() => {
    if (value === undefined || value === null) return
    if (value === prevValueRef.current) return
    prevValueRef.current = value

    const now = Date.now()
    const cutoff = now - timeWindowSec * 1000

    setHistory(prev => {
      const next = [...prev, { ts: now, value: Number(value) }]
        .filter(p => p.ts >= cutoff)
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next
    })
  }, [value, timeWindowSec])

  // Purge old data points even when value doesn't change
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - timeWindowSec * 1000
      setHistory(prev => prev.filter(p => p.ts >= cutoff))
    }, 5000)
    return () => clearInterval(id)
  }, [timeWindowSec])

  const currentVal = history.length > 0 ? history[history.length - 1].value : null
  const formatted  = currentVal !== null
    ? (Number.isInteger(currentVal) ? currentVal : currentVal.toFixed(2))
    : '—'

  const domain = [
    yMin !== undefined && yMin !== '' ? Number(yMin) : 'auto',
    yMax !== undefined && yMax !== '' ? Number(yMax) : 'auto',
  ]

  return (
    <div className="w-full h-full flex flex-col gap-1 overflow-hidden">
      {/* Header row */}
      <div className="flex items-baseline justify-between shrink-0 px-0.5">
        {label && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 truncate">
            {label}
          </span>
        )}
        <span
          className="font-mono text-sm font-semibold ml-auto"
          style={{ color }}
        >
          {formatted}
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {history.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[10px] text-gray-400 font-mono">Awaiting data…</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                vertical={false}
              />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTs}
                tick={{ fill: '#4b5563', fontSize: 8, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={domain}
                tick={{ fill: '#4b5563', fontSize: 8, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#1f2937',
                  padding: '4px 8px',
                }}
                itemStyle={{ color }}
                labelFormatter={ts => formatTs(Number(ts))}
                formatter={v => [typeof v === 'number' ? v.toFixed(3) : v, '']}
                separator=""
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
