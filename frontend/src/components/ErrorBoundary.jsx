import React from 'react'
import { reportClientError } from '../utils/clientLog'

/**
 * ErrorBoundary — catches render/lifecycle errors in its subtree so a single
 * failing component no longer unmounts the whole React root (which left the app
 * stuck on a blank screen until a full reload — the "blank even if I go back"
 * symptom).
 *
 * Two uses:
 *   - top level (App): a full-screen fallback with the error and a reload button,
 *     so the operator/designer always sees *something* and can recover.
 *   - per widget (editor canvas + runtime monitor): a compact inline box — pass
 *     `compact` and a `label` (the widget type) — so one broken widget shows an
 *     error in place while the rest of the page renders normally.
 *
 * `resetKeys` resets the boundary when any key changes (e.g. the active page), so
 * navigating away clears a previous error without a manual reload.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    const tag = this.props.label ? `(${this.props.label}) ` : ''
    // Surface to the console so the full component stack is available for debugging.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', tag, error, info?.componentStack)
    // Forward to the backend diagnostic log so operator-side crashes are captured.
    reportClientError({
      level: 'error',
      message: `[ErrorBoundary] ${tag}${error?.message || error}`,
      stack: error?.stack,
      context: info?.componentStack,
    })
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prevProps) {
    // Clear the error when the reset keys change (e.g. the user navigates to a
    // different page), so the subtree is given a fresh chance to render.
    if (this.state.error && prevProps.resetKeys !== this.props.resetKeys) {
      const prev = prevProps.resetKeys ?? []
      const next = this.props.resetKeys ?? []
      if (prev.length !== next.length || next.some((k, i) => k !== prev[i])) {
        this.setState({ error: null })
      }
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const message = error?.message || String(error)

    // Compact inline fallback — used for a single widget on the canvas/monitor.
    if (this.props.compact) {
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded border border-dashed border-red-300 bg-red-50 px-1 text-center"
          title={message}
        >
          <span className="text-[10px] font-semibold text-red-600 leading-tight">⚠ Widget error</span>
          {this.props.label && (
            <span className="text-[9px] font-mono text-red-400 leading-tight truncate max-w-full">{this.props.label}</span>
          )}
        </div>
      )
    }

    // Full-screen fallback — top-level recovery UI.
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#F3F6F9] p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">⚠️</div>
        <h2 className="text-lg font-semibold text-gray-800">Something went wrong</h2>
        <p className="max-w-xl font-mono text-sm text-red-600 break-words">{message}</p>
        {error?.stack && (
          <pre className="max-h-48 max-w-2xl overflow-auto rounded bg-white p-3 text-left text-[11px] leading-snug text-gray-500 shadow-inner">
            {error.stack}
          </pre>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-[#1677ff] px-4 py-1.5 text-sm font-medium text-white hover:brightness-110"
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
