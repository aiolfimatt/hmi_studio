/**
 * i18n language catalogue — shared by every backend module that stores or
 * serves multilingual text (alarms today; recipes/batches later).
 *
 * The legacy `monitor` supported up to 7 configurable languages (lang.txt).
 * We mirror that: a fixed catalogue of 7 well-known codes, with the *active*
 * subset (and default) chosen in config/conf.json:
 *
 *   "languages": ["it","en","fr"],   // order = display order; omit for all 7
 *   "default_language": "it"          // fallback when a translation is missing
 *
 * If conf omits these, all 7 are active and the first one is the default.
 */
const conf = require('../../../config/conf.json');

// Canonical catalogue (code → native label + flag emoji). Order here is the
// legacy default order; conf.languages can re-order / restrict it.
const CATALOGUE = [
  { code: 'en', label: 'English',    flag: '🇬🇧' },
  { code: 'it', label: 'Italiano',   flag: '🇮🇹' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch',    flag: '🇩🇪' },
  { code: 'es', label: 'Español',    flag: '🇪🇸' },
  { code: 'pt', label: 'Português',  flag: '🇵🇹' },
  { code: 'ru', label: 'Русский',    flag: '🇷🇺' },
];

const CATALOGUE_CODES = CATALOGUE.map((l) => l.code);
const byCode = Object.fromEntries(CATALOGUE.map((l) => [l.code, l]));

// Active languages = conf.languages filtered to the catalogue (keeps order),
// or the full catalogue when conf omits / empties the list.
function activeLanguages() {
  const wanted = Array.isArray(conf.languages) ? conf.languages : [];
  const valid = wanted.filter((c) => byCode[c]);
  const codes = valid.length ? valid : CATALOGUE_CODES;
  return codes.map((c) => byCode[c]);
}

function activeCodes() {
  return activeLanguages().map((l) => l.code);
}

function defaultLanguage() {
  const codes = activeCodes();
  const wanted = conf.default_language;
  return codes.includes(wanted) ? wanted : codes[0];
}

// Resolve a { code: text } map to a single string for `lang`, falling back to
// the default language, then the first non-empty translation.
function resolveText(map, lang) {
  if (map == null) return '';
  if (typeof map === 'string') return map;
  const def = defaultLanguage();
  return (
    map[lang] ||
    map[def] ||
    Object.values(map).find((v) => v) ||
    ''
  );
}

module.exports = {
  CATALOGUE,
  CATALOGUE_CODES,
  activeLanguages,
  activeCodes,
  defaultLanguage,
  resolveText,
};
