'use strict';
// Parser e serializzatore CSV condivisi (RFC 4180: virgolette, "" escape, CRLF)
function parse(text, delim = ',') {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}
const cell = (v, d) => { const s = v === null || v === undefined ? '' : String(v); return new RegExp(`[${d === '\t' ? '\\t' : d}"\\n\\r]`).test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const stringify = (rows, d = ',') => rows.map(r => r.map(v => cell(v, d)).join(d)).join('\n');
const delimOf = o => (o.delim === '\\t' || o.delim === 'tab' ? '\t' : o.delim && o.delim !== true ? String(o.delim) : ',');
function load(io, o) { const rows = parse(io.text(), delimOf(o)); if (!rows.length) throw new Error('CSV vuoto'); return { head: rows[0], body: rows.slice(1), d: delimOf(o) }; }
function colIndex(head, c, what = 'colonna') { if (c === undefined || c === true) throw new Error(`Manca ${what}`); const n = +c; if (Number.isInteger(n) && String(c).trim() !== '' && n >= 1 && n <= head.length && !head.includes(String(c))) return n - 1; const i = head.indexOf(String(c)); if (i < 0) throw new Error(`Colonna non trovata: ${c}`); return i; }
const isNum = s => s !== '' && s !== undefined && !isNaN(+s);
const cmp = (x, y) => (isNum(x) && isNum(y) ? +x - +y : String(x).localeCompare(String(y), 'it'));
module.exports = { parse, stringify, delimOf, load, colIndex, isNum, cmp };
