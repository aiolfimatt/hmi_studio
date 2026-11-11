import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'

// ── Single-client editor lock (client side) ─────────────────────────────────
// The designer / admin area may be used by only ONE client at a time (its saves
// are last-write-wins). We hold a global lock over Socket.IO: while an admin is
// anywhere under /edit this provider keeps a socket open, acquires the lock, and
// renders a blocking screen for any client that doesn't hold it. Closing the tab
// (or a crash) drops the socket, so the backend releases the lock automatically.

const EditorLockContext = createContext(null)

export function EditorLockProvider({ children }) {
  const { token } = useAuth()
  // 'connecting' → socket not yet granted; 'granted' → we hold the lock;
  // 'locked' → someone else holds it; 'error' → socket/auth failure.
  const [status, setStatus] = useState('connecting')
  const [holder, setHolder] = useState(null)
  const heldRef = useRef(false)

  useEffect(() => {
    if (!token) return

    const socket = io('/', {
      transports: ['websocket', 'polling'],
      auth: { token },
    })

    const acquire = () => {
      socket.emit('editor:acquire', (res) => {
        if (res?.ok) {
          heldRef.current = true
          setHolder(null)
          setStatus('granted')
        } else if (res?.locked) {
          heldRef.current = false
          setHolder(res.holder)
          setStatus('locked')
        } else {
          heldRef.current = false
          setStatus('error')
        }
      })
    }

    socket.on('connect', () => {
      heldRef.current = false
      setStatus('connecting')
      acquire()
    })

    // Broadcast on every lock change. If we already hold it, ignore. Otherwise
    // reflect the new holder, or grab the lock the moment it frees up.
    socket.on('editor:lock_state', (state) => {
      if (heldRef.current) return
      if (state?.locked) {
        setHolder(state)
        setStatus('locked')
      } else {
        acquire()
      }
    })

    socket.on('disconnect', () => {
      heldRef.current = false
      setStatus('connecting')
    })
    socket.on('connect_error', () => {
      heldRef.current = false
      setStatus('error')
    })

    return () => {
      socket.emit('editor:release')
      socket.disconnect()
      heldRef.current = false
    }
  }, [token])

  if (status === 'granted') {
    return (
      <EditorLockContext.Provider value={{ status, holder }}>
        {children}
      </EditorLockContext.Provider>
    )
  }

  return <LockScreen status={status} holder={holder} />
}

function LockScreen({ status, holder }) {
  const connecting = status === 'connecting'
  const error = status === 'error'

  return (
    <div className="flex h-screen items-center justify-center bg-[#F3F6F9] p-6">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        {connecting ? (
          <>
            <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-[#1677ff]" />
            <p className="text-sm text-gray-500">Connecting to the editor…</p>
          </>
        ) : error ? (
          <>
            <h2 className="mb-2 text-base font-semibold text-gray-800">Editor unavailable</h2>
            <p className="text-sm text-gray-500">
              Could not reach the editor service. Check the connection and reload the page.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2 className="mb-2 text-base font-semibold text-gray-800">Editor in use</h2>
            <p className="text-sm text-gray-600">
              The editor is currently open by{' '}
              <span className="font-medium text-gray-900">{holder?.username || 'another user'}</span>.
            </p>
            <p className="mt-3 text-xs text-gray-400">
              Only one client can edit at a time. You'll enter automatically as soon as it's free.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export function useEditorLock() {
  return useContext(EditorLockContext)
}

export default EditorLockContext
