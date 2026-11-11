import React, { createContext, useContext, useState, useCallback } from 'react'
import { ArrowLeft, RotateCw } from 'lucide-react'

/**
 * ExternalFrameContext — lets any clickable widget open a custom URL *inside*
 * HMI Studio as a full-screen iframe overlay, with an in-app "back" button.
 *
 * This is the kiosk-safe way to do the `navigate_url` event: the browser has no
 * tabs and no Back button, so we never leave the HMI page. HMI Studio stays
 * mounted underneath the overlay and returning is a single tap.
 *
 * Note: sites that send `X-Frame-Options: DENY/SAMEORIGIN` or a restrictive
 * `Content-Security-Policy: frame-ancestors` will refuse to render in the
 * iframe (blank frame). That's a property of the target site, not a bug here —
 * typical for internal machine dashboards it works fine.
 */
const ExternalFrameContext = createContext({ openExternalUrl: () => {} })

export function useExternalFrame() {
  return useContext(ExternalFrameContext)
}

export function ExternalFrameProvider({ children }) {
  const [url, setUrl] = useState(null)
  // key forces the iframe to remount on reload
  const [nonce, setNonce] = useState(0)

  const openExternalUrl = useCallback(u => { if (u) { setUrl(u); setNonce(n => n + 1) } }, [])
  const close  = useCallback(() => setUrl(null), [])
  const reload = useCallback(() => setNonce(n => n + 1), [])

  return (
    <ExternalFrameContext.Provider value={{ openExternalUrl }}>
      {children}
      {url && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-white">
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[#1677ff] text-white shadow-md shrink-0">
            <button
              onClick={close}
              className="flex items-center gap-1.5 rounded bg-white/15 hover:bg-white/25 active:scale-95 px-3 py-1.5 text-sm font-medium transition-all"
            >
              <ArrowLeft size={16} /> Torna a HMI Studio
            </button>
            <span className="text-xs text-white/70 font-mono truncate flex-1 text-center px-2">{url}</span>
            <button
              onClick={reload}
              title="Ricarica"
              className="flex items-center gap-1.5 rounded bg-white/15 hover:bg-white/25 active:scale-95 px-2.5 py-1.5 text-sm transition-all shrink-0"
            >
              <RotateCw size={15} />
            </button>
          </div>
          <iframe
            key={nonce}
            src={url}
            title="Contenuto esterno"
            className="flex-1 w-full border-0"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
          />
        </div>
      )}
    </ExternalFrameContext.Provider>
  )
}
