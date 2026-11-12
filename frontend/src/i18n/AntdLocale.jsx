import React from 'react'
import { useLocation } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import itIT from 'antd/locale/it_IT'
import frFR from 'antd/locale/fr_FR'
import deDE from 'antd/locale/de_DE'
import esES from 'antd/locale/es_ES'
import ptPT from 'antd/locale/pt_PT'
import ruRU from 'antd/locale/ru_RU'
import { useLanguage } from '../contexts/LanguageContext'

// Ant Design's built-in texts (password show/hide, OK/Cancel, "no data",
// pagination, pickers) follow the operator language on runtime pages. The edit
// app stays English like the rest of the designer UI.
const ANTD_LOCALES = { en: enUS, it: itIT, fr: frFR, de: deDE, es: esES, pt: ptPT, ru: ruRU }

export default function AntdLocale({ children }) {
  const { lang } = useLanguage()
  const { pathname } = useLocation()
  const isEdit = pathname === '/edit' || pathname.startsWith('/edit/')
  const locale = isEdit ? enUS : (ANTD_LOCALES[lang] || enUS)
  // Nested ConfigProvider: inherits the theme from main.jsx, overrides the locale.
  return <ConfigProvider locale={locale}>{children}</ConfigProvider>
}
