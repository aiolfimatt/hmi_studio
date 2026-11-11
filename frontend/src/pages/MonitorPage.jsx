import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { Modal, Form, Input, Button, Alert, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { Layers, WifiOff, AlertTriangle, Lock } from 'lucide-react'

import { pages as pagesApi, alarms as alarmsApi, groups as groupsApi } from '../api/client'
import WidgetRenderer from '../components/widgets/WidgetRenderer'
import AlarmPopup from '../components/widgets/AlarmPopup'
import ScriptRunPopup from '../components/widgets/ScriptRunPopup'
import { byAlarmPriority } from '../components/widgets/alarmSeverity'
import { useLanguage } from '../contexts/LanguageContext'
import { t } from '../i18n/uiStrings'
import { editGroupList, hasGroupAccess } from '../utils/access'
import axios from 'axios'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RECONNECT_DELAY = 3_000

// Activity signals that reset the runtime operator's inactivity timer.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']

// ---------------------------------------------------------------------------
// Credential prompt — the runtime has no session, so a protected action asks for
// credentials on the spot. `validate(user)` returns an error string when the
// authenticated user may NOT perform the action (insufficient group / missing
// capability), else null. The granted credential (token + group closure +
// capabilities) is held in memory for the rest of the session (never persisted).
// ---------------------------------------------------------------------------
function PasswordPrompt({ open, title, message, validate, onCancel, onGranted }) {
  const { lang, defaultLang } = useLanguage()
  const tt = useCallback((k, vars) => t(k, lang, defaultLang, vars), [lang, defaultLang])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Pending forced password change: { username, password (old), token } or null.
  const [expired, setExpired] = useState(null)
  const [form] = Form.useForm()
  const [pwForm] = Form.useForm()

  useEffect(() => { if (open) { setError(''); setExpired(null); form.resetFields() } }, [open, form])

  // Apply the capability/group gate and, if it passes, grant access.
  const grant = (data) => {
    const user = data?.user ?? {}
    const err = validate ? validate(user) : null
    if (err) { setError(err); return false }
    onGranted({
      token: data.token,
      accessGroups: user.accessGroups ?? [],
      capabilities: user.capabilities ?? { editMode: false, manageUsers: false },
      user,
    })
    return true
  }

  const onFinish = async ({ username, password }) => {
    setError('')
    setLoading(true)
    try {
      const uname = username.trim()
      // Raw axios so the shared client's 401 redirect can't fire here.
      const { data } = await axios.post('/api/auth/login', { username: uname, password })
      // Expired password: no access yet. Hold the temp token and let the operator
      // change the password inline, then re-authenticate and proceed.
      if (data?.mustChangePassword) {
        setError(''); setExpired({ username: uname, password, token: data.token }); pwForm.resetFields()
        return
      }
      grant(data)
    } catch (err) {
      setError(err?.response?.data?.error || tt('invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  const onChangePassword = async ({ new_password, confirm }) => {
    if (new_password !== confirm) { setError(tt('passwordsDoNotMatch')); return }
    setError(''); setLoading(true)
    try {
      // Change with the not-yet-committed temp token, then re-login with the new
      // password (now not expired) and run the original grant logic.
      await axios.post(
        '/api/auth/change-password',
        { old_password: expired.password, new_password },
        { headers: { Authorization: `Bearer ${expired.token}` } },
      )
      const { data } = await axios.post('/api/auth/login', { username: expired.username, password: new_password })
      setExpired(null)
      grant(data)
    } catch (err) {
      setError(err?.response?.data?.error || tt('invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      maskClosable={!expired}
      title={<span className="flex items-center gap-2">
        <Lock size={16} /> {expired ? tt('changePasswordTitle') : (title || tt('protectedOperation'))}
      </span>}
      destroyOnClose
    >
      {expired ? (
        <>
          <p className="text-sm text-gray-500 mb-3">{tt('passwordExpired')}</p>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
          <Form form={pwForm} layout="vertical" onFinish={onChangePassword} requiredMark={false} disabled={loading}>
            <Form.Item label={tt('newPassword')} name="new_password" rules={[{ required: true, message: tt('enterNewPassword') }]}>
              <Input.Password prefix={<LockOutlined />} autoFocus autoComplete="new-password" />
            </Form.Item>
            <Form.Item label={tt('confirmNewPassword')} name="confirm" rules={[{ required: true, message: tt('confirmNewPasswordMsg') }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Button type="primary" htmlType="submit" block loading={loading}>{tt('changeAndContinue')}</Button>
            </Form.Item>
          </Form>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">{message || tt('enterCredentialsParam')}</p>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} disabled={loading}>
            <Form.Item label={tt('user')} name="username" rules={[{ required: true, message: tt('enterUsername') }]}>
              <Input prefix={<UserOutlined />} autoFocus autoComplete="off" />
            </Form.Item>
            <Form.Item label={tt('password')} name="password" rules={[{ required: true, message: tt('enterPassword') }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="off" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Button type="primary" htmlType="submit" block loading={loading}>{tt('confirm')}</Button>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  )
}

// Alarm history-ids the operator has already closed this session. Module-scoped
// so it survives the MonitorCanvas remount on page navigation (the component is
// keyed by pageName) — a standing alarm stays closed instead of re-popping on
// every page change. A re-triggered alarm gets a fresh id and pops again.
const dismissedAlarms = new Set()

// Empty runtime credential — the logged-out state.
const EMPTY_CRED = { token: null, accessGroups: [], capabilities: { editMode: false, manageUsers: false }, username: '', group: null }

// ---------------------------------------------------------------------------
// MonitorCanvas — the live runtime viewer for a specific page
// ---------------------------------------------------------------------------
function MonitorCanvas({ pageName, cred, setCred, plcValues, socketState, activeAlarms, alarmsLoaded }) {
  const navigate      = useNavigate()
  const { lang, defaultLang } = useLanguage()
  const tt = useCallback((k, vars) => t(k, lang, defaultLang, vars), [lang, defaultLang])

  // State. Live PLC values, socket connection state and the active-alarm list are
  // owned by MonitorPage (which stays mounted across page changes) and arrive as
  // props, so one socket is reused across navigation. This component holds only
  // per-page view state.
  const [pageData,    setPageData]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [pageError,   setPageError]   = useState(null)
  const [writeStatus, setWriteStatus] = useState(null) // { ok: bool, msg: string }
  const [scale,       setScale]       = useState(1)     // form fit-to-viewport scale

  // Popup/dismissal state for the active alarms (the list itself is a prop).
  // `dismissed` holds history ids already popped & closed so a standing alarm
  // doesn't re-open; a re-triggered alarm gets a fresh id.
  const [popupAlarm,   setPopupAlarm]   = useState(null)
  const [dismissed,    setDismissed]    = useState(() => [...dismissedAlarms])

  // In-memory runtime credential (from the password prompt). Never persisted.
  // accessGroups = the logged user's group closure; capabilities = {editMode, manageUsers};
  // username/group identify the holder for 'logged user' (session) labels.
  // NOTE: `cred`/`setCred` live in MonitorPage (the stable route component), NOT
  // here — MonitorCanvas is keyed by pageName and remounts on every page change,
  // which would otherwise log the operator out whenever they navigate.
  const [pending,  setPending]  = useState(null) // action awaiting a password prompt
  const [groupNames, setGroupNames] = useState({}) // id→name, for naming the required group in the prompt
  const [scriptRun, setScriptRun] = useState(null) // { runId, name, status, message, logs } — "execute script" waiting/result popup

  const writeTimerRef = useRef(null)
  const wrapRef       = useRef(null)
  const authResolverRef = useRef(null)  // resolves the pending requestAccess() gate

  // Load page definition (public endpoint — no auth needed at runtime)
  useEffect(() => {
    setLoading(true)
    setPageError(null)
    pagesApi.get(pageName)
      .then(data => setPageData(data))
      .catch(e  => setPageError(e.response?.data?.error ?? e.message ?? tt('loadError')))
      .finally(() => setLoading(false))
  }, [pageName])

  // Group id→name (public) so a protected-write prompt can name the required group.
  useEffect(() => {
    groupsApi.names()
      .then(rows => setGroupNames(Object.fromEntries((rows || []).map(g => [g.id, g.name]))))
      .catch(() => { /* names are a nicety; the prompt still works without them */ })
  }, [])

  // Drop dismissed ids once their alarm truly clears, so a re-trigger (new id)
  // pops again. Guard on a real snapshot so the initial empty state on remount
  // doesn't wipe standing dismissals (which would re-pop on every page change).
  useEffect(() => {
    if (!alarmsLoaded.current) return
    const activeIds = new Set(activeAlarms.map(a => a.id))
    for (const id of dismissedAlarms) if (!activeIds.has(id)) dismissedAlarms.delete(id)
    setDismissed(d => d.filter(id => activeIds.has(id)))
  }, [activeAlarms])

  // Auto-close the popup if its alarm was resolved on the PLC.
  useEffect(() => {
    if (popupAlarm && !activeAlarms.some(a => a.id === popupAlarm.id)) setPopupAlarm(null)
  }, [activeAlarms, popupAlarm])

  // When idle, surface the highest-priority not-yet-dismissed alarm.
  useEffect(() => {
    if (popupAlarm) return
    const next = activeAlarms.filter(a => !dismissed.includes(a.id)).sort(byAlarmPriority)[0]
    if (next) setPopupAlarm(next)
  }, [activeAlarms, dismissed, popupAlarm])

  // Closing the popup dismisses every alarm active right now — only the first
  // (highest-priority) one pops; the rest stay in the cycling banner instead of
  // popping one after another. A newly-triggered alarm (fresh id) still pops once.
  const closePopup = useCallback(() => {
    setDismissed(prev => {
      const ids = new Set(prev)
      if (popupAlarm) ids.add(popupAlarm.id)
      for (const a of activeAlarms) ids.add(a.id)
      ids.forEach(id => dismissedAlarms.add(id))
      return [...ids]
    })
    setPopupAlarm(null)
  }, [popupAlarm, activeAlarms])

  // Post a write, optionally carrying the granted credential. Raw axios so the
  // shared client's global 401 redirect can't hijack a protected-write refusal.
  const postWrite = useCallback(async (job, token, comment) => {
    clearTimeout(writeTimerRef.current)
    const { widgetId, address, value, widgetProps, dataType: dataTypeOverride } = job
    try {
      await axios.post('/api/plc/write', {
        address,
        dataType    : dataTypeOverride ?? widgetProps?.dataType ?? 'REAL',
        value,
        pageName,
        widgetLabel : widgetProps?.label       ?? widgetProps?.text ?? widgetId,
        editGroup   : widgetProps?.editGroup ?? null,
        comment     : comment || undefined,
      }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      setWriteStatus({ ok: true, msg: tt('valueWritten', { addr: address, val: value }) })
    } catch (e) {
      const msg = e.response?.data?.error ?? e.message ?? 'Write error'
      setWriteStatus({ ok: false, msg })
    }
    writeTimerRef.current = setTimeout(() => setWriteStatus(null), 3000)
  }, [pageData, pageName, tt])

  // Write handler.
  //  - Entry writes carry their own confirmation + comment in the widget popup
  //    (ValueEntryDialog), so here they write straight through — only prompting
  //    for credentials when the parameter is protected and no sufficient
  //    credential is held yet (the comment is remembered across that prompt).
  //  - Other widgets (toggle/button) keep the direct flow, prompting for a
  //    password only when protected.
  // True when the held credential can write an object tagged with `editGroup`
  // (unprotected when empty, else the credential must hold ANY one of the groups).
  const hasGroup = useCallback(
    (editGroup) => hasGroupAccess(cred.accessGroups, editGroup),
    [cred.accessGroups]
  )

  // Human-readable list of the groups a prompt is asking for (OR semantics).
  const nameGroups = useCallback(
    (ids) => (ids || []).map((id) => groupNames[id] ?? `#${id}`).join(' / '),
    [groupNames]
  )

  const handleWrite = useCallback((widgetId, address, value, widgetProps, type, meta) => {
    if (!pageData) return
    const need = widgetProps?.editGroup ?? null
    // meta.dataType lets a widget override the column/cell PLC type (grid struct
    // columns carry their own type, distinct from the widget-level dataType).
    const job = { widgetId, address, value, widgetProps, dataType: meta?.dataType }
    const comment = (type === 'entry' || type === 'grid') ? meta?.comment : undefined
    if (hasGroup(need)) {
      postWrite(job, cred.token, comment)
    } else {
      setPending({ job, needGroups: editGroupList(need), mode: 'auth', comment })
    }
  }, [pageData, cred.token, hasGroup, postWrite])

  // Access gate used BEFORE a widget opens its editor (entry popup). Resolves
  // true immediately when the held credential already suffices, otherwise shows
  // the login prompt and resolves once a sufficient credential is granted (or
  // false if the operator cancels).
  const requestAccess = useCallback((editGroup) => {
    if (hasGroup(editGroup)) return Promise.resolve(true)
    return new Promise((resolve) => {
      authResolverRef.current = resolve
      setPending({ needGroups: editGroupList(editGroup), mode: 'gate' })
    })
  }, [hasGroup])

  // Transient status toast (reuses the write-status banner slot).
  const flash = useCallback((msg, ok = true) => {
    clearTimeout(writeTimerRef.current)
    setWriteStatus({ ok, msg })
    writeTimerRef.current = setTimeout(() => setWriteStatus(null), 3000)
  }, [])

  // Operator login/logout button actions (widgetEvents → onSession).
  //  - 'login'  opens the credential prompt so an operator can authenticate up
  //    front (any valid account; no group requirement).
  //  - 'logout' clears the held in-memory credential ("change operator"); the
  //    next protected action re-prompts.
  const handleSession = useCallback((kind) => {
    if (kind === 'logout') {
      // Record the operator logout server-side (best-effort) before dropping the
      // held credential.
      if (cred.token) axios.post('/api/auth/logout', {}, { headers: { Authorization: `Bearer ${cred.token}` } }).catch(() => {})
      setCred(EMPTY_CRED)
      flash(tt('loggedOut'))
    } else if (kind === 'login') {
      setPending({ mode: 'login' })
    }
  }, [cred.token, setCred, flash, tt])

  // Runtime API for the richer button events (condition gate, effect flag,
  // server-side script). Passed to every WidgetRenderer and consumed by
  // widgetEvents. The held operator credential (if any) rides along for access
  // checks + trace. Raw axios keeps the shared client's 401 redirect from
  // hijacking a refusal.
  const runtimeApi = useMemo(() => {
    const authHeader = () => (cred.token ? { headers: { Authorization: `Bearer ${cred.token}` } } : undefined)
    return {
      // Condition: read an ADS BOOL live; the action runs only when it is true.
      // A read error denies (false) so a misconfigured condition fails safe.
      condition: async (address) => {
        if (!address) return true
        try {
          const { data } = await axios.post('/api/plc/cond-read', { address }, authHeader())
          return !!data?.value
        } catch { return false }
      },
      // Effect: set an ADS BOOL after the action ran (unprotected system write).
      effect: async (address, value) => {
        if (!address) return
        try {
          await axios.post('/api/plc/write', {
            address, dataType: 'BOOL', value: Number(value) ? 1 : 0,
            pageName, widgetLabel: `effect:${address}`,
          }, authHeader())
        } catch (e) {
          flash(e.response?.data?.error ?? e.message ?? 'Effect write failed', false)
        }
      },
      // Execute a server-side script by name (data/scripts/<name>.js). Opens the
      // waiting popup immediately, tracks the run to completion, and reports the
      // standard outcome (ok / error / aborted). A client-assigned runId lets the
      // operator abort it from the popup (see abortScript). Non-blocking so the
      // event's effect flag still fires on dispatch like the other actions.
      script: ({ name, editGroup }) => {
        const runId = (window.crypto?.randomUUID?.() || `r${Date.now()}_${Math.round(Math.random() * 1e9)}`)
        setScriptRun({ runId, name, status: 'running', message: '', logs: [] })
        axios.post('/api/plc/run-script', {
          name, runId, pageName, widgetLabel: `script:${name}`, editGroup: editGroup ?? null,
        }, authHeader())
          .then(({ data }) => {
            const status = data?.aborted ? 'aborted' : (data?.ok ? 'ok' : 'error')
            setScriptRun(r => (r && r.runId === runId)
              ? { ...r, status, message: data?.message || '', logs: data?.logs || [] } : r)
          })
          .catch(e => {
            const msg = e.response?.data?.error ?? e.message ?? 'Script failed'
            setScriptRun(r => (r && r.runId === runId) ? { ...r, status: 'error', message: msg } : r)
          })
      },
    }
  }, [cred.token, pageName, flash, tt])

  // Abort an in-flight script from the waiting popup (cooperative — see
  // scriptRunner). The held run-script request then returns with aborted:true,
  // which flips the popup to its final state.
  const abortScript = useCallback((runId) => {
    if (!runId) return
    // Only engage from 'running' — if the run just completed, leave the terminal
    // state (ok/error) in place rather than reverting the popup to "aborting".
    setScriptRun(r => (r && r.runId === runId && r.status === 'running') ? { ...r, status: 'aborting' } : r)
    axios.post(`/api/plc/run-script/${runId}/abort`, {},
      cred.token ? { headers: { Authorization: `Bearer ${cred.token}` } } : undefined)
      .catch(() => { /* if it already finished, the run response settles the popup */ })
  }, [cred.token])

  // Current operator for 'logged user' (session) labels. groupNames resolves the
  // held credential's group id to its display name.
  const session = useMemo(
    () => ({ username: cred.username, groupName: cred.group != null ? (groupNames[cred.group] ?? `#${cred.group}`) : '' }),
    [cred.username, cred.group, groupNames]
  )

  // Runtime credential handed to the users_panel widget so in-HMI user admin
  // runs as the RUNTIME operator (not a stale /edit session) and is gated on
  // their manageUsers capability.
  const userAdmin = useMemo(
    () => ({
      token: cred.token,
      canManageUsers: !!cred.capabilities?.manageUsers,
      isAdmin: !!cred.capabilities?.editMode, // full admin may touch admin accounts
      user: { username: cred.username, group: cred.group },
    }),
    [cred.token, cred.capabilities, cred.username, cred.group]
  )

  // Derived canvas settings
  const definition   = pageData?.definition ?? {}
  const widgets      = definition.widgets      ?? []
  const canvasWidth  = definition.canvasWidth  ?? 800
  const canvasHeight = definition.canvasHeight ?? 600
  // Grid overlay follows the page's saved preference (editor "Show grid" toggle).
  // Default on so pages saved before this setting existed look unchanged.
  const showGrid     = definition.showGrid !== false

  // Scale the form to fit the viewport (like the legacy fullscreen monitor).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const compute = () => {
      const availW = el.clientWidth
      const availH = el.clientHeight
      if (!availW || !availH) return
      const s = Math.min(availW / canvasWidth, availH / canvasHeight)
      setScale(s > 0 && isFinite(s) ? s : 1)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    window.addEventListener('resize', compute)
    return () => { ro.disconnect(); window.removeEventListener('resize', compute) }
  }, [canvasWidth, canvasHeight, loading, pageError])

  // ---- Loading state ----
  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-500">{tt('loadingPage')}</span>
      </div>
    </div>
  )

  // ---- Error state ----
  if (pageError) return (
    <div className="flex items-center justify-center h-full">
      <div className="panel p-8 text-center max-w-sm">
        <AlertTriangle size={28} className="text-red-500 mx-auto mb-3" />
        <p className="text-sm text-red-600 mb-1 font-medium">{tt('loadError')}</p>
        <p className="text-xs text-gray-400 mb-5">{pageError}</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => navigate('/')} className="btn-secondary text-xs py-1.5">
            {tt('home')}
          </button>
          <button onClick={() => window.location.reload()} className="btn-primary text-xs py-1.5">
            {tt('retry')}
          </button>
        </div>
      </div>
    </div>
  )

  // ---- Runtime view: only the form, scaled to fit the screen ----
  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden bg-[#F3F6F9] flex items-center justify-center">

      {/* Offline indicator (only when PLC/socket comms drop) */}
      {socketState === 'offline' && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-[11px] text-red-600 shadow-sm">
          <WifiOff size={12} /> PLC offline
        </div>
      )}

      {/* Client-limit screen — the server refused the connection because the
          maximum number of runtime screens is already connected. */}
      {socketState === 'limit' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#F3F6F9]/95 p-6">
          <div className="max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <WifiOff size={24} className="text-amber-600" />
            </div>
            <h2 className="mb-2 text-base font-semibold text-gray-800">Maximum number of clients reached</h2>
            <p className="text-sm text-gray-500">
              Too many screens are connected right now. This screen will connect automatically as soon as a slot is free.
            </p>
          </div>
        </div>
      )}

      {/* Write status toast */}
      {writeStatus && (
        <div className={[
          'absolute top-3 left-1/2 -translate-x-1/2 z-20 text-xs font-mono px-3 py-1.5 rounded shadow-sm animate-fade-in border',
          writeStatus.ok
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-red-50 text-red-600 border-red-200'
        ].join(' ')}>
          {writeStatus.msg}
        </div>
      )}

      {/* ---- The form ---- */}
      <div
        className="relative bg-white border border-gray-200 shadow-2xl shrink-0"
        style={{
          width          : canvasWidth,
          height         : canvasHeight,
          transform      : `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Subtle grid overlay — only when the page has it enabled */}
          {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Cpath d='M 20 0 L 0 0 0 20' fill='none' stroke='%23e5e7eb' stroke-width='0.5'/%3E%3C/svg%3E")`,
              backgroundSize: '20px 20px',
            }}
          />
          )}

          {/* Empty canvas hint */}
          {widgets.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <Layers size={32} className="text-gray-300" />
              <p className="text-xs text-gray-400 font-mono">Nessun widget configurato</p>
            </div>
          )}

          {/* Widgets */}
          {widgets
            .slice()
            .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1))
            .map(widget => (
              <WidgetRenderer
                key={widget.id}
                widget={widget}
                values={plcValues}
                alarms={activeAlarms}
                onWrite={(widgetId, address, value, wp, type, meta) =>
                  handleWrite(widgetId, address, value, wp, type, meta)
                }
                onSession={handleSession}
                runtimeApi={runtimeApi}
                session={session}
                requestAccess={requestAccess}
                userAdmin={userAdmin}
                readOnly={false}
                isSelected={false}
                onSelect={undefined}
              />
            ))
          }
        </div>

      {/* Credential prompt — protected writes (entry/toggle/button) and the
          user-admin surface. The entry comment, captured in the widget popup,
          rides through on `pending`. */}
      <PasswordPrompt
        open={!!pending}
        title={pending?.mode === 'login' ? tt('login')
          : tt('protectedParameter')}
        message={pending?.mode === 'login'
          ? tt('loginPromptMsg')
          : (pending?.needGroups?.length
              ? tt('enterCredentials', { need: nameGroups(pending.needGroups) })
              : tt('enterCredentialsParam'))}
        validate={(u) => {
          if (pending?.mode === 'login') return null // any valid account may log in
          const needs = pending?.needGroups || []
          return hasGroupAccess(u.accessGroups, needs)
            ? null : tt('insufficientLevel', { need: nameGroups(needs) })
        }}
        onCancel={() => {
          // A cancelled gate must resolve the waiting requestAccess() promise.
          if (pending?.mode === 'gate') { authResolverRef.current?.(false); authResolverRef.current = null }
          setPending(null)
        }}
        onGranted={({ token, accessGroups, capabilities, user: grantedUser }) => {
          setCred({ token, accessGroups, capabilities, username: grantedUser?.username ?? '', group: grantedUser?.group ?? null })
          const mode = pending?.mode
          // Explicit login button: just hold the credential and confirm.
          if (mode === 'login') {
            setPending(null)
            flash(tt('loggedInAs', { user: grantedUser?.username ?? grantedUser?.full_name ?? '' }))
            return
          }
          // Gate flow: let the widget proceed to open its editor.
          if (mode === 'gate') {
            authResolverRef.current?.(true); authResolverRef.current = null
            setPending(null)
            return
          }
          // Direct-write flow (toggle/button/entry): commit the queued job.
          const job = pending?.job
          const comment = pending?.comment
          setPending(null)
          if (job) postWrite(job, token, comment)
        }}
      />

      {/* Full-screen alarm popup — appears when an alarm triggers */}
      <AlarmPopup alarm={popupAlarm} lang={lang} defaultLang={defaultLang} onClose={closePopup} />

      {/* "Execute script" waiting / result popup — spinner + abort while running,
          then the standard ok / error / aborted outcome. */}
      <ScriptRunPopup run={scriptRun} onAbort={abortScript} onClose={() => setScriptRun(null)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// MonitorPage — runtime entry (always driven by :pageName)
// ---------------------------------------------------------------------------
export default function MonitorPage() {
  const { pageName } = useParams()
  const { lang, defaultLang } = useLanguage()

  // The operator credential lives here so it persists across page navigations:
  // MonitorCanvas is keyed by pageName and remounts on every change, but this
  // component stays mounted for the whole /monitor/:pageName route.
  const [cred, setCred] = useState(EMPTY_CRED)

  // Live PLC values, socket connection state and the active-alarm list also live
  // here (not in the per-page MonitorCanvas) so a SINGLE socket is reused across
  // page navigation — previously MonitorCanvas, keyed by pageName, tore down and
  // reconnected the socket on every page change, adding a full handshake +
  // re-subscribe + initial read to each navigation.
  const [plcValues,   setPlcValues]   = useState({})
  const [socketState, setSocketState] = useState('connecting') // 'connecting' | 'online' | 'offline' | 'limit'
  const [activeAlarms, setActiveAlarms] = useState([])
  const alarmsLoadedRef = useRef(false) // true once a real active-alarm snapshot has arrived
  const socketRef = useRef(null)

  // Pull the current active alarms (public, no-auth endpoint for the runtime).
  const refreshAlarms = useCallback(() => {
    alarmsApi.listActivePublic()
      .then(rows => { alarmsLoadedRef.current = true; setActiveAlarms(Array.isArray(rows) ? rows : []) })
      .catch(() => { /* transient; next event/poll retries */ })
  }, [])

  // One socket for the whole runtime session — created once and reused across
  // pages. Connection state, incoming values and alarm-change pushes are handled
  // here; the active page is (un)subscribed by the effect below.
  useEffect(() => {
    setSocketState('connecting')
    refreshAlarms()   // initial snapshot before the socket connects

    const socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionDelay: RECONNECT_DELAY,
      // Identify as a runtime screen so the backend can enforce
      // conf.max_runtime_clients (admin/editor sockets are not counted).
      auth: { role: 'runtime' },
    })
    socketRef.current = socket
    let limitRetry = null

    socket.on('connect', () => { setSocketState('online'); refreshAlarms() })
    socket.on('disconnect', () => setSocketState('offline'))
    socket.on('connect_error', (err) => {
      // The server refuses the handshake when the client cap is reached. Such
      // middleware rejections don't auto-reconnect, so retry manually until a
      // slot frees up; any other error is a plain offline/transport failure.
      if (err?.message === 'client_limit_reached') {
        setSocketState('limit')
        if (limitRetry) clearTimeout(limitRetry)
        limitRetry = setTimeout(() => socket.connect(), RECONNECT_DELAY)
      } else {
        setSocketState('offline')
      }
    })
    socket.on('plc_values', (data) => {
      if (data && typeof data === 'object') setPlcValues(prev => ({ ...prev, ...data }))
    })
    // Backend alarmWatcher pushes this on every PLC-driven trigger/clear.
    socket.on('alarms_changed', refreshAlarms)

    return () => {
      if (limitRetry) clearTimeout(limitRetry)
      socket.disconnect()
      socketRef.current = null
    }
  }, [refreshAlarms])

  // (Re)subscribe to the active page whenever it changes or the socket (re)connects.
  // On a page change the cleanup unsubscribes the previous page and the values are
  // cleared, so the previous page's cells don't linger until the new snapshot lands;
  // the backend emits a fresh full snapshot on subscribe.
  useEffect(() => { setPlcValues({}) }, [pageName])
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || socketState !== 'online' || !pageName) return
    socket.emit('subscribe_page', pageName)
    return () => { socket.emit('unsubscribe_page', pageName) }
  }, [pageName, socketState])

  // ---------------------------------------------------------------------------
  // Inactivity auto-logout — RUNTIME operator credential only.
  //
  // The idle window comes from backend config (security.auto_logout_s, surfaced
  // as auto_logout_ms; 0 = disabled). While a credential is held, any user
  // activity resets the timer; after the window of no activity the credential is
  // dropped and protected widgets re-lock. The /edit admin session is NOT subject
  // to this — only the operator session on the runtime expires.
  // ---------------------------------------------------------------------------
  const [autoLogoutMs, setAutoLogoutMs] = useState(0)

  // Pull the window once an operator holds a credential (the config route needs
  // a valid token, which the runtime only has after login).
  useEffect(() => {
    if (!cred.token) { setAutoLogoutMs(0); return }
    let cancelled = false
    axios
      .get('/api/system/config', { headers: { Authorization: `Bearer ${cred.token}` } })
      .then(r => { if (!cancelled) setAutoLogoutMs(Number(r.data?.auto_logout_ms) || 0) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [cred.token])

  useEffect(() => {
    if (!cred.token || autoLogoutMs <= 0) return
    let timer = null
    let last = 0
    const expire = () => {
      // Idle timeout is also a logout — record it server-side (best-effort).
      if (cred.token) axios.post('/api/auth/logout', {}, { headers: { Authorization: `Bearer ${cred.token}` } }).catch(() => {})
      setCred(EMPTY_CRED)
      message.info(t('sessionExpired', lang, defaultLang))
    }
    const arm = () => { clearTimeout(timer); timer = setTimeout(expire, autoLogoutMs) }
    const onActivity = () => {
      const now = Date.now()
      // Throttle: at most one re-arm per second to avoid churn on mousemove.
      if (now - last < 1000) return
      last = now
      arm()
    }
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    arm()
    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity))
      clearTimeout(timer)
    }
  }, [cred.token, autoLogoutMs, lang, defaultLang])

  if (!pageName) return <Navigate to="/" replace />
  return (
    <MonitorCanvas
      key={pageName}
      pageName={pageName}
      cred={cred}
      setCred={setCred}
      plcValues={plcValues}
      socketState={socketState}
      activeAlarms={activeAlarms}
      alarmsLoaded={alarmsLoadedRef}
    />
  )
}
