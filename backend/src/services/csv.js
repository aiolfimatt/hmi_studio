/**
 * Minimal, dependency-free CSV (RFC-4180-ish) serializer + parser used by the
 * text import/export feature (alarm definitions and widget texts). Handles
 * quoting of fields containing commas, quotes or newlines, escaped double
 * quotes ("") inside quoted fields, CRLF or LF line endings, and a leading BOM.
 */

// Quote a single field when it contains a comma, quote, CR or LF.
function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Serialize a header row + array-of-array data rows to a CSV string. A UTF-8
// BOM is prepended so Excel opens accented/other-alphabet text correctly.
function toCsv(header, rows) {
  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Parse a CSV string into an array of string arrays (one per non-empty row).
function parseCsv(text) {
  if (text == null) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushRow(); i++; continue; }
    field += c; i++;
  }
  // Flush the trailing field/row if the file didn't end with a newline.
  if (field !== '' || row.length) pushRow();

  // Drop fully-empty rows (e.g. a blank trailing line).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

module.exports = { csvEscape, toCsv, parseCsv };
