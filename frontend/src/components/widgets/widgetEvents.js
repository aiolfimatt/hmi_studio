import { useNavigate } from 'react-router-dom'
import { useExternalFrame } from '../../contexts/ExternalFrameContext'
import { isGroupProtected } from '../../utils/access'

/**
 * Shared widget event model — mirrors the legacy `tipo_evento` event types
 * for clickable widgets (button, pixmap, eventbox, toggle_pixmap).
 *
 * Event types (widgetProps.onClick):
 *   'navigate'     — cambia forma: go to targetPage
 *   'return'       — torna indietro: go back to the previous form (never gated)
 *   'navigate_url' — go to a custom URL. urlMode picks how:
 *                      'overlay' (default, kiosk-safe) — full-screen iframe inside
 *                                HMI Studio with a "back" button; HMI stays mounted
 *                      'same'    — replace the current tab (browser Back to return)
 *                      'newtab'  — window.open (no return needed; not usable in kiosk)
 *   'write'        — modify PLC: write writeValue to writeAddress
 *   'script'       — run a server-side script by name (data/scripts/<scriptName>.js)
 *   'session'      — unified login/logout: logs IN when no operator is held,
 *                    logs OUT when one is (based on `loggedIn`). Lets one button
 *                    show a different icon/label per state (ButtonWidget).
 *   'login'        — (legacy) open the operator credential prompt (onSession('login'))
 *   'logout'       — (legacy) clear the held operator credential (onSession('logout'))
 *
 * Condition / effect (apply to every event EXCEPT the session toggles):
 *   - `conditionAddress` — when set, an ADS BOOL read live before the action; the
 *     action runs ONLY when that bit is true. Needs runtimeApi.condition.
 *   - `effectAddress` / `effectValue` — when set, written to the ADS BOOL AFTER the
 *     action actually ran ("set a flag if performed"). Needs runtimeApi.effect.
 *   Both are no-ops without a runtimeApi (e.g. the editor preview), so clicks in
 *   the designer still behave predictably.
 *
 * session/login/logout act on the runtime's in-memory operator credential
 * (MonitorPage's `cred`), not the admin AuthContext session; they do nothing where
 * no session handler is wired (e.g. the editor preview).
 *
 * Returns DOM handlers ({ onClick }).
 */

// Normalise a user-entered URL: bare hosts (e.g. "example.com") get https://
// so window.open / location doesn't treat them as an app-relative path.
// Leaves absolute URLs, protocol-relative (//), app-relative (/) and
// non-http schemes (mailto:, tel:, …) untouched.
function normaliseUrl(raw) {
  const url = String(raw || '').trim()
  if (!url) return ''
  if (/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return url
  return `https://${url}`
}

export function useWidgetEvent({ widgetProps = {}, onWrite, onSession, runtimeApi = {}, requestAccess, readOnly = false, value, loggedIn = false }) {
  const navigate = useNavigate()
  const { openExternalUrl } = useExternalFrame()
  const {
    onClick          = 'navigate',
    targetPage       = '',
    url              = '',
    urlMode          = 'overlay',
    writeAddress     = '',
    writeValue       = '',
    editGroup        = null,
    scriptName       = '',
    conditionAddress = '',
    effectAddress    = '',
    effectValue      = 1,
  } = widgetProps

  const coerce = v => (v === '' || v === null || isNaN(Number(v)) ? v : Number(v))

  // Gate an action behind the widget's editGroup. With no group set — or no
  // access resolver wired (e.g. the editor preview) — the action runs directly.
  // Resolves to whether the action actually ran (so the `effect` only fires on
  // a performed action). Writes gate downstream in MonitorPage.handleWrite.
  const gated = (fn) => {
    if (!isGroupProtected(editGroup) || !requestAccess) { fn(); return Promise.resolve(true) }
    return Promise.resolve(requestAccess(editGroup)).then(ok => { if (ok) { fn(); return true } return false })
  }

  // Run the configured action. Returns a boolean (or a Promise of one) that is
  // true when the action was actually performed.
  const perform = () => {
    switch (onClick) {
      case 'navigate':
        if (!targetPage) return false
        return gated(() => navigate(`/monitor/${targetPage}`))
      case 'return':
        // Go back to the previous form in history. Never gated.
        navigate(-1)
        return true
      case 'navigate_url': {
        const dest = normaliseUrl(url)
        if (!dest) return false
        return gated(() => {
          if (urlMode === 'newtab') {
            window.open(dest, '_blank', 'noopener,noreferrer')
          } else if (urlMode === 'same') {
            window.location.assign(dest)
          } else {
            // 'overlay' (default) — kiosk-safe: show inside HMI Studio. Falls back
            // to same-tab nav if the overlay provider isn't mounted (editor preview).
            if (openExternalUrl) openExternalUrl(dest)
            else window.location.assign(dest)
          }
        })
      }
      case 'write':
        // Modify PLC: access prompt (if protected) is handled by MonitorPage.
        onWrite?.(coerce(writeValue), writeAddress)
        return true
      case 'script':
        if (!scriptName) return false
        return gated(() => runtimeApi.script?.({ name: scriptName, editGroup }))
      case 'session':
        onSession?.(loggedIn ? 'logout' : 'login')
        return false
      case 'login':
        onSession?.('login')
        return false
      case 'logout':
        onSession?.('logout')
        return false
      default:
        return false
    }
  }

  return {
    onClick: async () => {
      if (readOnly) return

      // Session toggles and no-ops bypass the condition/effect machinery.
      const isSession = onClick === 'session' || onClick === 'login' || onClick === 'logout'
      if (isSession || onClick === 'none') { perform(); return }

      // Condition: run only when the configured ADS BOOL reads true.
      if (conditionAddress && runtimeApi.condition) {
        const ok = await runtimeApi.condition(conditionAddress)
        if (!ok) return
      }

      const performed = await perform()

      // Effect: set the configured ADS BOOL once the action actually ran.
      if (performed && effectAddress && runtimeApi.effect) {
        await runtimeApi.effect(effectAddress, effectValue)
      }
    },
  }
}

export const EVENT_OPTIONS = [
  { value: 'write',        label: 'Modify PLC (write value)' },
  { value: 'navigate_url', label: 'Go to URL' },
  { value: 'return',       label: 'Return (previous page)' },
  { value: 'navigate',     label: 'Go to page' },
  { value: 'script',       label: 'Execute script' },
  { value: 'session',      label: 'Log in / out (operator)' },
  // Legacy single-direction variants — kept so older pages still edit correctly;
  // new buttons should use the unified 'session' action above.
  { value: 'login',        label: 'Log in only (legacy)' },
  { value: 'logout',       label: 'Log out only (legacy)' },
]
