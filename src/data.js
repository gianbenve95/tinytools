'use strict';
// Strumenti per JSON / CSV / .env

const isObj = v => v && typeof v === 'object';
const parseJSON = (t, what = 'JSON') => { try { return JSON.parse(t); } catch (e) { throw new Error(`${what} non valido: ${e.message}`); } };

function flatten(v, prefix = '', out = {}) {
  if (Array.isArray(v) ? v.length === 0 : isObj(v) && Object.keys(v).length === 0) { out[prefix || ''] = v; return out; }
  if (Array.isArray(v)) v.forEach((x, i) => flatten(x, `${prefix}[${i}]`, out));
  else if (isObj(v)) for (const k of Object.keys(v)) flatten(v[k], prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = v;
  return out;
}
const tokens = p => { const t = []; p.replace(/([^.\[\]]+)|\[(-?\d+|\*)\]/g, (m, k, i) => { t.push(k !== undefined ? k : i === '*' ? '*' : +i); }); return t; };
function unflatten(flat) {
  let root;
  for (const [key, val] of Object.entries(flat)) {
    const t = tokens(key); if (!t.length) { root = val; continue; }
    if (root === undefined) root = typeof t[0] === 'number' ? [] : {};
    let cur = root;
    t.forEach((k, i) => {
      if (i === t.length - 1) { cur[k] = val; return; }
      if (cur[k] === undefined || !isObj(cur[k])) cur[k] = typeof t[i + 1] === 'number' ? [] : {};
      cur = cur[k];
    });
  }
  return root;
}
const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;

function parseCSV(text, delim = ',') {
  const rows = []; let row = [], f = '', q = false, i = 0;
  text = text.replace(/^﻿/, '');
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const csvCell = (v, d) => { if (v === null || v === undefined) return ''; const s = isObj(v) ? JSON.stringify(v) : String(v); return new RegExp(`[${d}"\\n\\r]`).test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const num = s => (s !== '' && s !== null && !isNaN(+s) ? +s : NaN);
const guess = s => s === 'true' ? true : s === 'false' ? false : s === '' ? s : !isNaN(num(s)) ? +s : s;

function query(data, path) {
  let cur = [data];
  for (const t of tokens(path)) {
    const next = [];
    for (const c of cur) {
      if (t === '*') { if (isObj(c)) next.push(...Object.values(c)); }
      else if (typeof t === 'number' && Array.isArray(c)) { const x = c[t < 0 ? c.length + t : t]; if (x !== undefined) next.push(x); }
      else if (isObj(c) && t in c) next.push(c[t]);
    }
    cur = next;
  }
  return cur;
}

const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r4 = n => Math.round(n * 1e4) / 1e4;

module.exports = {
  'json-flatten': { desc: 'Appiattisce JSON annidato in chiavi a.b[0].c', usage: '[--file=x.json]', fn: (a, o, io) => flatten(parseJSON(io.text())) },
  'json-unflatten': { desc: 'Operazione inversa di json-flatten', usage: '[--file=flat.json]', fn: (a, o, io) => unflatten(parseJSON(io.text())) },
  'json-sort': { desc: 'Ordina ricorsivamente le chiavi di un JSON', usage: '[--file=x.json] [--indent=2]', fn: (a, o, io) => JSON.stringify(sortKeys(parseJSON(io.text())), null, o.indent === undefined ? 2 : +o.indent) },
  csv2json: {
    desc: 'CSV -> JSON (intestazioni, --delim, --types per numeri/booleani)', usage: '[--file=x.csv] [--delim=;] [--types] [--no-header]',
    fn: (a, o, io) => {
      const rows = parseCSV(io.text(), o.delim === '\\t' ? '\t' : o.delim || ',').filter(r => !(r.length === 1 && r[0] === ''));
      const conv = x => (o.types ? guess(x) : x);
      if (o['no-header']) return rows.map(r => r.map(conv));
      const [h, ...body] = rows; return body.map(r => Object.fromEntries(h.map((k, i) => [k, conv(r[i] === undefined ? '' : r[i])])));
    },
  },
  json2csv: {
    desc: 'JSON (array di oggetti) -> CSV', usage: '[--file=x.json] [--delim=,]',
    fn: (a, o, io) => {
      const d = o.delim || ',', data = parseJSON(io.text()); if (!Array.isArray(data)) throw new Error('Serve un array di oggetti');
      const cols = [...new Set(data.flatMap(r => Object.keys(r)))];
      return [cols.map(c => csvCell(c, d)).join(d), ...data.map(r => cols.map(c => csvCell(r[c], d)).join(d))].join('\n');
    },
  },
  'json-query': {
    desc: 'Estrae valori con percorsi: a.b[0].c, a[*].x, a[-1]', usage: '<percorso> [--file=x.json]',
    fn: (a, o, io) => { if (!a.length) throw new Error('Manca il percorso'); const data = parseJSON(a[1] ? io.file(1) : o.file ? io.text() : io.stdin()); const r = query(data, a[0]); return r.length === 1 ? r[0] : r; },
  },
  env2json: {
    desc: 'File .env -> JSON (commenti, export, virgolette)', usage: '[--file=.env]',
    fn: (a, o, io) => {
      const out = {};
      for (let line of io.text().split(/\r?\n/)) {
        line = line.trim(); if (!line || line.startsWith('#')) continue;
        const m = /^(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(line); if (!m) continue;
        let v = m[2];
        if (/^"/.test(v)) v = v.replace(/^"(.*?)"(\s*#.*)?$/, '$1').replace(/\\n/g, '\n').replace(/\\"/g, '"');
        else if (/^'/.test(v)) v = v.replace(/^'(.*?)'(\s*#.*)?$/, '$1');
        else v = v.replace(/\s+#.*$/, '').trim();
        out[m[1]] = v;
      }
      return out;
    },
  },
  'json-diff': {
    desc: 'Differenze strutturali tra due file JSON', usage: 'a.json b.json',
    fn: (a, o, io) => {
      if (a.length < 2) throw new Error('Servono due file');
      const x = flatten(parseJSON(io.file(0))), y = flatten(parseJSON(io.file(1))), out = [];
      const same = (p, q) => JSON.stringify(p) === JSON.stringify(q);
      for (const k of Object.keys(x)) if (!(k in y)) out.push(`- ${k}: ${JSON.stringify(x[k])}`); else if (!same(x[k], y[k])) out.push(`~ ${k}: ${JSON.stringify(x[k])} -> ${JSON.stringify(y[k])}`);
      for (const k of Object.keys(y)) if (!(k in x)) out.push(`+ ${k}: ${JSON.stringify(y[k])}`);
      return out.join('\n') || 'Nessuna differenza';
    },
  },
  jsonl: {
    desc: 'JSON Lines <-> array JSON (--to=array|lines)', usage: '--to=array [--file=x.jsonl]',
    fn: (a, o, io) => {
      const t = io.text();
      if (o.to === 'lines') return parseJSON(t).map(x => JSON.stringify(x)).join('\n');
      return t.split('\n').filter(l => l.trim()).map((l, i) => parseJSON(l, `Riga ${i + 1}`));
    },
  },
  'csv-stats': {
    desc: 'Statistiche per colonne numeriche di un CSV', usage: '[--col=prezzo] [--file=x.csv] [--delim=;]',
    fn: (a, o, io) => {
      const [h, ...rows] = parseCSV(io.text(), o.delim || ',').filter(r => !(r.length === 1 && r[0] === '')), out = {};
      h.forEach((name, i) => {
        if (o.col && o.col !== name) return;
        const v = rows.map(r => num(r[i])).filter(n => !isNaN(n)); if (!v.length) return;
        const sum = v.reduce((p, c) => p + c, 0);
        out[name] = { count: v.length, sum: r4(sum), mean: r4(sum / v.length), min: Math.min(...v), max: Math.max(...v), median: median(v) };
      });
      if (!Object.keys(out).length) throw new Error('Nessuna colonna numerica trovata');
      return out;
    },
  },
};
