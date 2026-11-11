import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { EditorLockProvider } from './contexts/EditorLockContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ExternalFrameProvider } from './contexts/ExternalFrameContext'
import Layout from './components/Layout'
import LanguageSelector from './components/LanguageSelector'
import VirtualKeyboard from './components/keyboard/VirtualKeyboard'
import { pages as pagesApi, system as systemApi } from './api/client'

// Pages
import LoginPage   from './pages/LoginPage'
import MonitorPage from './pages/MonitorPage'
import EditorPage  from './pages/EditorPage'
import UsersPage   from './pages/UsersPage'
import GroupsPage  from './pages/GroupsPage'
import AlarmsPage  from './pages/AlarmsPage'
import RecipesPage from './pages/RecipesPage'

// ---------------------------------------------------------------------------
// Spinner — shared loading state
// ---------------------------------------------------------------------------
function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#F3F6F9]">
      <div className="flex items-center gap-3 text-gray-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#1677ff]" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Runtime (operator) — no login, no chrome, no side menu.
// ---------------------------------------------------------------------------
function RuntimeShell() {
  // App + loaded-project version (public endpoint — runtime has no login).
  const [ver, setVer] = useState(null)
  useEffect(() => {
    systemApi.version().then(setVer).catch(() => setVer(null))
  }, [])

  const progVersion = ver?.programVersion

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', background: '#F3F6F9' }}>
      {/* Global runtime language switcher (legacy: flag selector) */}
      <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 50 }}>
        <LanguageSelector variant="floating" />
      </div>
      <div id="app-content" style={{ height: '100%', width: '100%', overflow: 'auto' }}>
        <Outlet />
      </div>
      {/* Version badge — app + loaded project version, unobtrusive bottom-right. */}
      {ver && (
        <div style={{
          position: 'fixed', bottom: 6, right: 10, zIndex: 40,
          fontSize: 11, color: '#9ca3af', pointerEvents: 'none',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>
          {`HMI Studio${ver.app ? ` v${ver.app}` : ''}`}
          {progVersion ? ` · ${progVersion}` : ''}
        </div>
      )}
    </div>
  )
}

// Resolve the configured home page and jump straight to it.
function RuntimeHome() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, name: null })

  useEffect(() => {
    pagesApi.getHome()
      .then(d => setState({ loading: false, name: d?.name ?? null }))
      .catch(() => setState({ loading: false, name: null }))
  }, [])

  useEffect(() => {
    if (!state.loading && state.name) navigate(`/monitor/${state.name}`, { replace: true })
  }, [state, navigate])

  if (state.loading) return <Spinner />
  if (!state.name) return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h2 className="text-base font-semibold text-gray-700">Nessuna pagina configurata</h2>
      <p className="text-sm text-gray-400">Accedi alla modalità modifica (<code>/edit</code>) per creare pagine HMI.</p>
    </div>
  )
  return <Spinner />
}

// ---------------------------------------------------------------------------
// Edit mode (admin only)
// ---------------------------------------------------------------------------
// Entry point at /edit: admins go straight to the editor, everyone else logs in.
function EditEntry() {
  const { isAdmin, loading } = useAuth()
  if (loading) return <Spinner />
  if (isAdmin) return <Navigate to="/edit/editor" replace />
  return <LoginPage />
}

// Guards the edit subtree — bounces non-admins back to the /edit login. The
// EditorLockProvider enforces that only one client at a time may use the editor:
// any further admin client is shown a read-only "editor in use" screen until the
// holder leaves.
function AdminRoute() {
  const { isAdmin, loading } = useAuth()
  if (loading) return <Spinner />
  if (!isAdmin) return <Navigate to="/edit" replace />
  return (
    <EditorLockProvider>
      <Outlet />
    </EditorLockProvider>
  )
}

function LayoutWrapper() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

// ---------------------------------------------------------------------------
// App — top-level router tree
// ---------------------------------------------------------------------------
export default function App() {
  // Reset the top-level boundary on navigation so an error on one page doesn't
  // leave every other page stuck behind the fallback.
  const location = useLocation()
  return (
    <AuthProvider>
      <LanguageProvider>
      <ExternalFrameProvider>
      <VirtualKeyboard />
      <ErrorBoundary resetKeys={[location.pathname]}>
      <Routes>
        {/* ── Runtime (public) ── */}
        <Route element={<RuntimeShell />}>
          <Route index element={<RuntimeHome />} />
          <Route path="monitor/:pageName" element={<MonitorPage />} />
        </Route>

        {/* ── Edit mode (admin only) ── */}
        <Route path="/edit" element={<EditEntry />} />
        <Route element={<AdminRoute />}>
          <Route element={<LayoutWrapper />}>
            <Route path="edit/editor"           element={<EditorPage />} />
            <Route path="edit/editor/:pageName" element={<EditorPage />} />
            <Route path="edit/users"            element={<UsersPage />} />
            <Route path="edit/groups"           element={<GroupsPage />} />
            <Route path="edit/alarms"           element={<AlarmsPage />} />
            <Route path="edit/recipes"          element={<RecipesPage />} />
          </Route>
        </Route>

        {/* Catch-all → runtime home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
      </ExternalFrameProvider>
      </LanguageProvider>
    </AuthProvider>
  )
}
