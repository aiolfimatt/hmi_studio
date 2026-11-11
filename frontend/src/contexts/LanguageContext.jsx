import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { DEFAULT_LANGUAGES, DEFAULT_LANGUAGE, CATALOGUE_BY_CODE } from '../i18n/languages'

/**
 * LanguageContext — the single source of truth for the active UI/runtime
 * language across the whole app (runtime monitor AND the designer preview).
 *
 *   lang        — currently selected language code
 *   setLang     — switch language (persisted to localStorage)
 *   languages   — active languages [{code,label,flag}] from /api/i18n/config
 *   defaultLang — fallback code for missing translations
 *   ready       — config loaded
 */
const LanguageContext = createContext(null)

const LANG_KEY = 'hmi_lang'

export function LanguageProvider({ children }) {
  const [languages, setLanguages]   = useState(DEFAULT_LANGUAGES)
  const [defaultLang, setDefaultLang] = useState(DEFAULT_LANGUAGE)
  const [lang, setLangState]        = useState(() => localStorage.getItem(LANG_KEY) || DEFAULT_LANGUAGE)
  const [ready, setReady]           = useState(false)

  // Load active language configuration (public endpoint).
  useEffect(() => {
    axios.get('/api/i18n/config')
      .then(({ data }) => {
        const list = Array.isArray(data?.languages) && data.languages.length
          ? data.languages
          : DEFAULT_LANGUAGES
        const def = data?.default || list[0]?.code || DEFAULT_LANGUAGE
        setLanguages(list)
        setDefaultLang(def)
        // If the stored/initial language is not among the active set, fall back.
        setLangState((cur) => (list.some((l) => l.code === cur) ? cur : def))
      })
      .catch(() => { /* keep catalogue defaults */ })
      .finally(() => setReady(true))
  }, [])

  const setLang = useCallback((code) => {
    setLangState(code)
    localStorage.setItem(LANG_KEY, code)
  }, [])

  // Enrich active languages with catalogue labels/flags if the backend omitted them.
  const enriched = languages.map((l) =>
    l.label ? l : { ...CATALOGUE_BY_CODE[l.code], ...l }
  )

  const value = { lang, setLang, languages: enriched, defaultLang, ready }
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  // Safe fallback so widget components can render outside a provider (tests, etc.)
  if (!ctx) return { lang: DEFAULT_LANGUAGE, setLang: () => {}, languages: DEFAULT_LANGUAGES, defaultLang: DEFAULT_LANGUAGE, ready: true }
  return ctx
}

export default LanguageContext
