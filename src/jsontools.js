'use strict';
// Strumenti JSON avanzati
const fs = require('fs');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const parse = (t, what = 'JSON') => { try { return JSON.parse(t); } catch (e) { throw new Error(`${what} non valido: ${e.message}`); } };
const toks = p => { const t = []; String(p).replace(/([^.\[\]]+)|\[(\d+)\]/g, (m, k, i) => { t.push(k !== undefined ? k : +i); }); return t; };
const getp = (o, p) => toks(p).reduce((c, k) => (c === undefined || c === null ? undefined : c[k]), o);
function setp(o, p, v) { const t = toks(p); let c = o; t.forEach((k, i) => { if (i === t.length - 1) c[k] = v; else { if (c[k] === undefined) c[k] = typeof t[i + 1] === 'number' ? [] : {}; c = c[k]; } }); }
function delp(o, p) { const t = toks(p), last = t.pop(); const c = t.reduce((x, k) => (x === undefined || x === null ? undefined : x[k]), o); if (c !== undefined && c !== null) { if (Array.isArray(c)) c.splice(last, 1); else delete c[last]; } }
const clone = v => JSON.parse(JSON.stringify(v));
const merge = (a, b, arr) => { if (isObj(a) && isObj(b)) { const r = { ...a }; for (const k of Object.keys(b)) r[k] = k in a ? merge(a[k], b[k], arr) : b[k]; return r; } if (arr === 'concat' && Array.isArray(a) && Array.isArray(b)) return [...a, ...b]; return b; };
const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const num = s => s !== '' && !isNaN(+s);
const cmp = (x, y) => (typeof x === 'number' && num(String(y)) ? x - +y : String(x).localeCompare(String(y)));
function where(expr) {
  const m = /^\s*(.+?)\s*(>=|<=|!=|~|=|>|<|\^=|\$=|\*=)\s*(.*?)\s*$/.exec(expr); if (!m) throw new Error('Condizione non valida: ' + expr); const [, path, op, v] = m, re = op === '~' ? new RegExp(v, 'i') : null;
  return it => { const x = getp(it, path); if (x === undefined) return false; const s = typeof x === 'object' ? JSON.stringify(x) : String(x); switch (op) { case '=': return num(v) && typeof x === 'number' ? x === +v : s === v; case '!=': return num(v) && typeof x === 'number' ? x !== +v : s !== v; case '>': return cmp(x, v) > 0; case '>=': return cmp(x, v) >= 0; case '<': return cmp(x, v) < 0; case '<=': return cmp(x, v) <= 0; case '~': return re.test(s); case '^=': return s.startsWith(v); case '$=': return s.endsWith(v); case '*=': return s.includes(v); } };
}
function validate(v, s, p, errs) {
  if (s === true || s === undefined) return; if (s === false) { errs.push(`${p || '$'}: non ammesso`); return; }
  if (s.anyOf) { if (!s.anyOf.some(x => { const e = []; validate(v, x, p, e); return !e.length; })) errs.push(`${p || '$'}: non corrisponde a nessuna alternativa di anyOf`); }
  if (s.enum && !s.enum.some(x => JSON.stringify(x) === JSON.stringify(v))) errs.push(`${p || '$'}: valore non ammesso (enum)`);
  if (s.type) { const ts = [].concat(s.type), t = typeOf(v); if (!ts.some(x => x === t || (x === 'number' && t === 'integer'))) { errs.push(`${p || '$'}: atteso ${ts.join('|')}, trovato ${t}`); return; } }
  if (typeof v === 'number') { if (s.minimum !== undefined && v < s.minimum) errs.push(`${p || '$'}: minore di ${s.minimum}`); if (s.maximum !== undefined && v > s.maximum) errs.push(`${p || '$'}: maggiore di ${s.maximum}`); }
  if (typeof v === 'string') { if (s.minLength !== undefined && [...v].length < s.minLength) errs.push(`${p || '$'}: più corto di ${s.minLength}`); if (s.maxLength !== undefined && [...v].length > s.maxLength) errs.push(`${p || '$'}: più lungo di ${s.maxLength}`); if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${p || '$'}: non rispetta il pattern ${s.pattern}`); }
  if (Array.isArray(v)) { if (s.minItems !== undefined && v.length < s.minItems) errs.push(`${p || '$'}: meno di ${s.minItems} elementi`); if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(`${p || '$'}: più di ${s.maxItems} elementi`); if (s.items) v.forEach((x, i) => validate(x, s.items, `${p}[${i}]`, errs)); }
  if (isObj(v)) { for (const r of s.required || []) if (!(r in v)) errs.push(`${p ? p + '.' : ''}${r}: campo obbligatorio mancante`); for (const [k, sub] of Object.entries(s.properties || {})) if (k in v) validate(v[k], sub, p ? `${p}.${k}` : k, errs); if (s.additionalProperties === false) for (const k of Object.keys(v)) if (!(s.properties && k in s.properties)) errs.push(`${p ? p + '.' : ''}${k}: proprietà non prevista`); }
}
const SENS = /(pass(word|wd)?|secret|token|api[_-]?key|auth(orization)?|private[_-]?key|credential|cookie|session|ssn|iban|card)/i;
const redact = (v, extra) => Array.isArray(v) ? v.map(x => redact(x, extra)) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (SENS.test(k) || extra.has(k.toLowerCase())) && (x === null || typeof x !== 'object') ? '***' : redact(x, extra)])) : v;
const files = (a, io) => { if (a.length < 1) throw new Error('Indica uno o più file'); return a.map(f => parse(fs.readFileSync(f, 'utf8'), f)); };
const arrayAt = (d, o) => { const x = o.path && o.path !== true ? getp(d, o.path) : d; if (!Array.isArray(x)) throw new Error('Serve un array (usa --path=per.arrivare.all.array)'); return x; };

module.exports = {
  'json-merge': { desc: 'Unisce più file JSON in profondità (--arrays=concat per concatenare gli array)', usage: 'a.json b.json [--arrays=concat]', fn: (a, o, io) => files(a, io).reduce((x, y) => merge(x, y, o.arrays)) },
  'json-pick': { desc: 'Tiene solo i percorsi indicati (--paths=a.b,c[0])', usage: '--paths=nome,indirizzo.citta [--file=x.json]', fn: (a, o, io) => { if (!o.paths || o.paths === true) throw new Error('Serve --paths'); const d = parse(io.text()), out = Array.isArray(d) ? [] : {}; for (const p of String(o.paths).split(',')) { const v = getp(d, p.trim()); if (v !== undefined) setp(out, p.trim(), clone(v)); } return out; } },
  'json-omit': { desc: 'Rimuove i percorsi indicati (--paths=a.b,c)', usage: '--paths=password,utente.token [--file=x.json]', fn: (a, o, io) => { if (!o.paths || o.paths === true) throw new Error('Serve --paths'); const d = parse(io.text()); for (const p of String(o.paths).split(',')) delp(d, p.trim()); return d; } },
  'json-fmt': { desc: 'Formatta o comprime un JSON (--indent=4, --minify, --tabs)', usage: '[--indent=2 | --minify | --tabs] [--file=x.json]', fn: (a, o, io) => { const d = parse(io.text()); return o.minify ? JSON.stringify(d) : JSON.stringify(d, null, o.tabs ? '\t' : o.indent === undefined ? 2 : +o.indent); } },
  'json-validate': {
    desc: 'Valida un JSON con uno schema (type, properties, required, items, enum, min/max, pattern, anyOf...)', usage: 'dati.json --schema=schema.json',
    fn: (a, o, io) => { if (!o.schema || o.schema === true) throw new Error('Serve --schema=file'); const data = parse(a[0] ? io.file(0) : io.stdin()), schema = parse(fs.readFileSync(o.schema, 'utf8'), 'Schema'), errs = []; validate(data, schema, '', errs); return { valid: errs.length === 0, errors: errs }; },
  },
  'json-stats': {
    desc: 'Statistiche: profondità, tipi, numero di chiavi, array più lungo', usage: '[--file=x.json]',
    fn: (a, o, io) => { const t = io.text(), d = parse(t), types = {}; let depth = 0, keys = 0, maxArr = 0; (function w(v, dp) { depth = Math.max(depth, dp); const ty = typeOf(v); types[ty] = (types[ty] || 0) + 1; if (Array.isArray(v)) { maxArr = Math.max(maxArr, v.length); v.forEach(x => w(x, dp + 1)); } else if (isObj(v)) for (const [k, x] of Object.entries(v)) { keys++; w(x, dp + 1); } })(d, 1); return { bytes: Buffer.byteLength(t), depth, totalKeys: keys, longestArray: maxArr, valueTypes: types }; },
  },
  'json-keys': {
    desc: 'Elenca tutti i percorsi di chiave con il tipo (array come [])', usage: '[--file=x.json]',
    fn: (a, o, io) => { const m = new Map(); (function w(v, p) { const t = typeOf(v); if (p) { if (!m.has(p)) m.set(p, new Set()); m.get(p).add(t); } if (Array.isArray(v)) v.forEach(x => w(x, p + '[]')); else if (isObj(v)) for (const [k, x] of Object.entries(v)) w(x, p ? `${p}.${k}` : k); })(parse(io.text()), ''); return [...m].map(([p, t]) => `${p}  ${[...t].join('|')}`).join('\n'); },
  },
  'json-redact': { desc: 'Maschera i valori di chiavi sensibili (password, token, api_key...) con ***', usage: '[--keys=extra1,extra2] [--file=x.json]', fn: (a, o, io) => redact(parse(io.text()), new Set(o.keys && o.keys !== true ? String(o.keys).toLowerCase().split(',').map(s => s.trim()) : [])) },
  'json-filter': { desc: 'Filtra un array di oggetti: --where="eta>=18 && citta.nome~^R" (--path per array annidati)', usage: '--where="prezzo>10" [--path=items] [--file=x.json]', fn: (a, o, io) => { if (!o.where || o.where === true) throw new Error('Serve --where'); const arr = arrayAt(parse(io.text()), o), ps = o.where.split(/\s+&&\s+/).map(where); return arr.filter(x => ps.every(p => p(x))); } },
  'json-group': {
    desc: 'Raggruppa un array per chiave con conteggio e somma opzionale (--by=cat --sum=prezzo)', usage: '--by=categoria [--sum=prezzo] [--path=items] [--file=x.json]',
    fn: (a, o, io) => { if (!o.by || o.by === true) throw new Error('Serve --by'); const arr = arrayAt(parse(io.text()), o), g = {}; for (const it of arr) { const k = String(getp(it, o.by)), e = g[k] || (g[k] = { count: 0, sum: 0 }); e.count++; if (o.sum) e.sum += +getp(it, o.sum) || 0; } return Object.fromEntries(Object.entries(g).sort((x, y) => y[1].count - x[1].count || x[0].localeCompare(y[0])).map(([k, v]) => [k, o.sum ? { count: v.count, sum: +v.sum.toFixed(6) } : v.count])); },
  },
};
