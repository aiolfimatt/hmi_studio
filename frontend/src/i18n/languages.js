/**
 * Frontend language catalogue — mirrors backend/src/i18n/languages.js.
 * The *active* subset + default arrive at runtime from GET /api/i18n/config;
 * this catalogue provides labels/flags for any code the backend returns and a
 * sensible fallback when the config endpoint is unreachable.
 */
export const CATALOGUE = [
  { code: 'en', label: 'English',    flag: '🇬🇧' },
  { code: 'it', label: 'Italiano',   flag: '🇮🇹' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch',    flag: '🇩🇪' },
  { code: 'es', label: 'Español',    flag: '🇪🇸' },
  { code: 'pt', label: 'Português',  flag: '🇵🇹' },
  { code: 'ru', label: 'Русский',    flag: '🇷🇺' },
]

export const CATALOGUE_BY_CODE = Object.fromEntries(CATALOGUE.map((l) => [l.code, l]))

// Fallback used before /api/i18n/config resolves (or if it fails): all 7, EN default.
export const DEFAULT_LANGUAGES = CATALOGUE
export const DEFAULT_LANGUAGE = 'en'
