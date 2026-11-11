import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp, theme } from 'antd'
import itIT from 'antd/locale/it_IT'
import App from './App'
import { reportClientError } from './utils/clientLog'
import './index.css'

// Catch errors that escape the React tree (event handlers, async callbacks,
// non-React code) and forward them to the backend diagnostic log. React render
// errors are handled by ErrorBoundary; these cover everything else.
window.addEventListener('error', (e) => {
  reportClientError({
    level: 'error',
    message: e.message || 'window.onerror',
    stack: e.error?.stack,
    context: `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`,
  })
})
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  reportClientError({
    level: 'error',
    message: r?.message || String(r) || 'unhandledrejection',
    stack: r?.stack,
    context: 'unhandledrejection',
  })
})

// Light Ant Design theme matching the RTS software that shares this HMI
// environment: antd default blue, system font stack, white containers and a
// light-gray body, with larger control heights/fonts for touch panels.
const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, ' +
  'Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'

const hmiTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1677ff',
    colorBgBase: '#ffffff',
    colorBgLayout: '#F3F6F9',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorder: '#d9d9d9',
    colorText: '#1f1f1f',
    borderRadius: 8,
    fontSize: 15,
    controlHeight: 40,
    fontFamily: SYSTEM_FONT,
  },
  components: {
    Layout: { siderBg: '#ffffff', headerBg: '#F3F6F9', bodyBg: '#F3F6F9' },
    Menu: { itemSelectedBg: '#e6f0ff', itemSelectedColor: '#1677ff' },
    Table: { headerBg: '#F3F6F9', rowHoverBg: '#f5f7fa' },
    Modal: { contentBg: '#ffffff', headerBg: '#ffffff' },
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={hmiTheme} locale={itIT}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
)
