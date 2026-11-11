/**
 * textio — CSV export/import of every translatable text in the system in ONE
 * file, so an operator or translator can export a single spreadsheet, edit it
 * offline (Excel/LibreOffice), and re-import. The file carries both:
 *
 *   • widget texts        (page, widget_id, prop, <lang>…)  pulled from / pushed
 *     back into the translatable props inside each page definition.
 *   • alarm translations  — emitted as sentinel rows under the reserved page
 *     name `__alarms__`, so a single schema (page, widget_id, prop, <lang>…)
 *     covers both: page=__alarms__, widget_id=<alarm_code>, prop=description.
 *   • composite-alarm lists — the shared text lists composite alarms draw from,
 *     under page `__alarmlist__`: widget_id=<list name>, prop=<row number>.
 *
 * Export columns follow the active languages (config/conf.json); import accepts
 * any column whose header is a known catalogue language code, so a file authored
 * with extra languages still round-trips. Alarm severity is NOT part of this
 * file (it is not a translation) — it stays editable on the Alarms page.
 *
 * All routes are admin-only; writes additionally require level ≥ 2 (same bar as
 * creating an alarm definition in the web app).
 */
const express = require('express');
const store = require('../store');
const scanner = require('../scanner');
const { authMiddleware, requireAdmin, requireLevel } = require('../auth');
const { activeCodes, defaultLanguage, CATALOGUE_CODES } = require('../i18n/languages');
const { TRANSLATABLE_PROPS } = require('../i18n/translatableProps');
const { toCsv, parseCsv } = require('../services/csv');

const router = express.Router();
router.use(authMiddleware, requireAdmin);

// Send a string as a downloadable CSV file.
function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// Read the CSV payload from either a raw text/csv body or a JSON { csv } body.
function readCsvBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body.csv === 'string') return req.body.csv;
  return null;
}

// Coerce a translatable prop value into a { code: text } map.
function toLangMap(value, defLang) {
  if (value == null || value === '') return {};
  if (typeof value === 'object') return { ...value };
  return { [defLang]: String(value) };
}

function parseDef(def) {
  if (def == null) return { widgets: [] };
  try { return typeof def === 'string' ? JSON.parse(def) : def; }
  catch { return { widgets: [] }; }
}

// Map a header row to column indices; language columns = any header that is a
// known catalogue code (case-insensitive).
function indexHeader(header) {
  const H = header.map((h) => String(h).trim().toLowerCase());
  const langCols = [];
  H.forEach((h, i) => { if (CATALOGUE_CODES.includes(h)) langCols.push({ code: h, idx: i }); });
  return { H, langCols };
}

// Reserved `page` values that mark a row as something other than a widget text.
//   __alarms__    : alarm translation   — widget_id = alarm_code, prop = 'description'
//   __alarmlist__ : composite-alarm list entry — widget_id = list name, prop = row number (1-based)
const ALARMS_PAGE = '__alarms__';
const ALARMLIST_PAGE = '__alarmlist__';

// ── Widget texts + alarm translations ────────────────────────────────────────

// GET /api/textio/texts  → texts.csv
// One row per translatable prop that currently holds text, across all pages,
// followed by one row per alarm definition (its per-language descriptions).
router.get('/texts', async (req, res) => {
  try {
    const codes = activeCodes();
    const defLang = defaultLanguage();
    const rows = store.pages.all().slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const header = ['page', 'widget_id', 'prop', ...codes];
    const data = [];
    for (const pg of rows) {
      const def = parseDef(pg.definition);
      for (const w of def.widgets || []) {
        const props = TRANSLATABLE_PROPS[w.type];
        if (!props) continue;
        for (const key of props) {
          if (!(key in (w.props || {}))) continue;
          const map = toLangMap(w.props[key], defLang);
          if (!Object.values(map).some((v) => v != null && String(v) !== '')) continue;
          data.push([pg.name, w.id, key, ...codes.map((c) => map[c] ?? '')]);
        }
      }
    }
    // Append alarm translations so the single file covers alarms too.
    const alarms = store.alarmDefinitions.all().slice()
      .sort((a, b) => (a.alarm_code || 0) - (b.alarm_code || 0));
    for (const a of alarms) {
      data.push([ALARMS_PAGE, a.alarm_code, 'description', ...codes.map((c) => a[`description_${c}`] ?? '')]);
    }
    // Append composite-alarm list entries (one row per entry, row number 1-based).
    const lists = store.alarmLists.all().slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    for (const list of lists) {
      (list.entries || []).forEach((entry, i) => {
        data.push([ALARMLIST_PAGE, list.name, i + 1, ...codes.map((c) => entry[c] ?? '')]);
      });
    }
    sendCsv(res, 'texts.csv', toCsv(header, data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/textio/texts  body: raw CSV or { csv }
// Match widget texts by (page, widget_id, prop), and alarm translations by
// alarm_code (rows whose page is the __alarms__ sentinel). Language columns
// present in the file are authoritative for those languages (empty cell clears
// that language); languages absent from the file are preserved. Alarm rows for
// an unknown code insert a new definition (severity defaults to 'warning').
router.post('/texts', requireLevel(2), async (req, res) => {
  const csv = readCsvBody(req);
  if (!csv) return res.status(400).json({ error: 'No CSV content' });

  const table = parseCsv(csv);
  if (table.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });

  const [header, ...dataRows] = table;
  const { H, langCols } = indexHeader(header);
  const idxPage = H.indexOf('page');
  const idxWid = H.indexOf('widget_id');
  const idxProp = H.indexOf('prop');
  if (idxPage < 0 || idxWid < 0 || idxProp < 0) {
    return res.status(400).json({ error: 'CSV must have page, widget_id and prop columns' });
  }
  if (!langCols.length) {
    return res.status(400).json({ error: 'CSV has no recognised language columns' });
  }

  const defLang = defaultLanguage();
  const cell = (row, i) => (i >= 0 && i < row.length ? String(row[i]) : '');

  // Group incoming edits by page name.
  const byPage = new Map();
  dataRows.forEach((row, n) => {
    const page = cell(row, idxPage).trim();
    const wid = cell(row, idxWid).trim();
    const prop = cell(row, idxProp).trim();
    if (!page || !wid || !prop) return;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push({ wid, prop, row, line: n + 2 });
  });

  const result = { pagesUpdated: 0, propsUpdated: 0, alarmsInserted: 0, alarmsUpdated: 0, listsUpdated: 0, skipped: 0, warnings: [] };

  try {
    for (const [pageName, edits] of byPage) {
      // Composite-alarm lists: widget_id = list name, prop = 1-based row number.
      // Rows are grouped per list; each row's languages merge into that entry
      // (empty cell clears a language, absent language is preserved). An unknown
      // list name creates a new list; entries grow to fit the highest row.
      if (pageName === ALARMLIST_PAGE) {
        const byList = new Map();
        for (const e of edits) {
          if (!byList.has(e.wid)) byList.set(e.wid, []);
          byList.get(e.wid).push(e);
        }
        for (const [listName, listEdits] of byList) {
          try {
            const existing = store.alarmLists.find((l) => l.name === listName);
            const entries = existing ? (existing.entries || []).map((x) => ({ ...x })) : [];
            for (const { prop, row, line } of listEdits) {
              const rowNo = parseInt(prop, 10);
              if (!Number.isInteger(rowNo) || rowNo < 1) {
                result.skipped++; result.warnings.push(`Line ${line}: invalid list row '${prop}'`); continue;
              }
              const i = rowNo - 1;
              while (entries.length <= i) entries.push({});
              const next = { ...entries[i] };
              for (const { code, idx } of langCols) {
                const val = cell(row, idx);
                if (val === '') delete next[code];
                else next[code] = val;
              }
              entries[i] = next;
            }
            if (existing) store.alarmLists.update((l) => l.id === existing.id, { entries });
            else store.alarmLists.insert({ name: listName, entries });
            result.listsUpdated++;
          } catch (listErr) {
            result.skipped += listEdits.length;
            result.warnings.push(`List '${listName}': ${listErr.message}`);
          }
        }
        continue;
      }

      // Alarm translations: widget_id = alarm_code, prop = description. Upsert
      // the per-language descriptions; severity is not touched here.
      if (pageName === ALARMS_PAGE) {
        for (const { wid, row, line } of edits) {
          const alarmCode = parseInt(wid, 10);
          if (!Number.isInteger(alarmCode)) {
            result.skipped++; result.warnings.push(`Line ${line}: invalid alarm code '${wid}'`); continue;
          }
          try {
            const existing = store.alarmDefinitions.find((r) => r.alarm_code === alarmCode);
            if (existing) {
              const patch = {};
              for (const { code, idx } of langCols) {
                const val = cell(row, idx);
                patch[`description_${code}`] = val === '' ? null : val;
              }
              store.alarmDefinitions.update((r) => r.id === existing.id, patch);
              result.alarmsUpdated++;
            } else {
              const row2 = { alarm_code: alarmCode, severity: 'warning' };
              for (const { code, idx } of langCols) {
                const val = cell(row, idx);
                row2[`description_${code}`] = val === '' ? null : val;
              }
              store.alarmDefinitions.insert(row2);
              result.alarmsInserted++;
            }
          } catch (rowErr) {
            result.skipped++;
            result.warnings.push(`Line ${line} (alarm ${alarmCode}): ${rowErr.message}`);
          }
        }
        continue;
      }

      const pageRow = store.pages.find((p) => p.name === pageName);
      if (!pageRow) {
        result.skipped += edits.length;
        result.warnings.push(`Page '${pageName}' not found — ${edits.length} row(s) skipped`);
        continue;
      }
      const def = parseDef(pageRow.definition);
      const widgets = def.widgets || [];
      let pageDirty = false;

      for (const { wid, prop, row, line } of edits) {
        const w = widgets.find((x) => String(x.id) === wid);
        if (!w) { result.skipped++; result.warnings.push(`Line ${line}: widget '${wid}' not on page '${pageName}'`); continue; }
        const allowed = TRANSLATABLE_PROPS[w.type];
        if (!allowed || !allowed.includes(prop)) {
          result.skipped++; result.warnings.push(`Line ${line}: '${prop}' is not a text prop of ${w.type}`); continue;
        }

        const before = JSON.stringify(w.props?.[prop] ?? null);
        const next = toLangMap(w.props?.[prop], defLang);
        for (const { code, idx } of langCols) {
          const val = cell(row, idx);
          if (val === '') delete next[code];
          else next[code] = val;
        }
        const newVal = Object.keys(next).length ? next : '';
        if (JSON.stringify(newVal) === before) continue; // no change

        w.props = w.props || {};
        w.props[prop] = newVal;
        pageDirty = true;
        result.propsUpdated++;
      }

      if (pageDirty) {
        store.pages.update((p) => p.id === pageRow.id, { definition: def, updated_at: store.now() });
        scanner.invalidatePage(pageName);
        result.pagesUpdated++;
      }
    }
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message, ...result }); }
});

module.exports = router;
