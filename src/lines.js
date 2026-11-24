'use strict';
// Elaborazione di testo riga per riga (stile grep/sed/cut/uniq, in versione semplice e uniforme)
const fs = require('fs');
const src = (o, io) => (o.file && o.file !== true ? fs.readFileSync(o.file, 'utf8') : io.stdin());
const lines = t => { const l = t.split(/\r?\n/); if (l[l.length - 1] === '') l.pop(); return l; };
const unesc = s => String(s).replace(/\\t/g, '\t').replace(/\\n/g, '\n');
const need = (v, name) => { if (v === undefined || v === true || v === '') throw new Error(`Manca ${name}`); return v; };
const fieldsOf = (spec, max) => { const out = []; for (const p of String(spec).split(',')) { const m = /^(\d+)(?:-(\d*))?$/.exec(p.trim()); if (!m || +m[1] < 1) throw new Error('Campi non validi: ' + p); const a = +m[1], b = m[2] === undefined ? a : m[2] === '' ? max : +m[2]; for (let i = a; i <= b; i++) out.push(i - 1); } return out; };

module.exports = {
  'grep-lite': {
    desc: 'Filtra le righe con una regex (--invert, --ignore-case, --n numeri di riga, --count, --fixed)', usage: '"pattern" [--file=x] [--invert] [--ignore-case] [--n] [--count] [--fixed]',
    fn: (a, o, io) => { const p = need(a[0], 'il pattern'); let re; try { re = new RegExp(o.fixed ? p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : p, o['ignore-case'] ? 'i' : ''); } catch (e) { throw new Error('Regex non valida: ' + e.message); } const hits = lines(src(o, io)).map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l) !== !!o.invert); return o.count ? String(hits.length) : hits.map(([n, l]) => (o.n ? `${n}:${l}` : l)).join('\n'); },
  },
  replace: {
    desc: 'Cerca e sostituisce (testo letterale; --regex per espressioni con $1, --ignore-case, --first)', usage: '"vecchio" "nuovo" [--file=x] [--regex] [--ignore-case] [--first]',
    fn: (a, o, io) => { const [f, r] = [need(a[0], 'il testo da cercare'), a[1] === undefined ? need(undefined, 'il testo sostitutivo') : a[1]]; let re; try { re = new RegExp(o.regex ? f : f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), (o.first ? '' : 'g') + (o['ignore-case'] ? 'i' : '')); } catch (e) { throw new Error('Regex non valida: ' + e.message); } return src(o, io).replace(re, o.regex ? r : () => r); },
  },
  'number-lines': {
    desc: 'Numera le righe (--start=1, --skip-empty, --sep=": ")', usage: '[--file=x] [--start=1] [--sep=": "] [--skip-empty]',
    fn: (a, o, io) => { const l = lines(src(o, io)); let n = o.start === undefined ? 1 : +o.start; const last = n + l.length - 1, w = String(last).length, sep = o.sep === undefined || o.sep === true ? '  ' : unesc(o.sep); return l.map(x => (o['skip-empty'] && !x.trim() ? x : `${String(n++).padStart(w)}${sep}${x}`)).join('\n'); },
  },
  'cut-fields': {
    desc: 'Estrae colonne (--f=1,3-4, --d="," ; senza --d divide sugli spazi)', usage: '--f=1,3 [--d=","] [--out-d=";"] [--file=x]',
    fn: (a, o, io) => { need(o.f, '--f'); const d = o.d === undefined || o.d === true ? null : unesc(o.d), od = o['out-d'] === undefined ? (d === null ? ' ' : d) : unesc(o['out-d']); return lines(src(o, io)).map(l => { const p = d === null ? l.trim().split(/\s+/) : l.split(d); return fieldsOf(o.f, p.length).map(i => p[i] === undefined ? '' : p[i]).join(od); }).join('\n'); },
  },
  'uniq-count': {
    desc: 'Righe uniche con il numero di occorrenze, dalla più frequente (--top, --ignore-case)', usage: '[--file=x] [--top=10] [--ignore-case]',
    fn: (a, o, io) => { const c = new Map(); for (const l of lines(src(o, io))) { const k = o['ignore-case'] ? l.toLowerCase() : l; c.set(k, (c.get(k) || 0) + 1); } return [...c].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, +o.top || Infinity).map(([k, n]) => `${String(n).padStart(6)}  ${k}`).join('\n'); },
  },
  'line-stats': {
    desc: 'Statistiche sulle righe: totale, vuote, lunghezza minima/massima/media, duplicati', usage: '[--file=x]',
    fn: (a, o, io) => { const l = lines(src(o, io)); if (!l.length) return { lines: 0 }; const len = l.map(x => [...x].length), mx = Math.max(...len); return { lines: l.length, empty: l.filter(x => !x.trim()).length, minLength: Math.min(...len), maxLength: mx, averageLength: +(len.reduce((s, x) => s + x, 0) / l.length).toFixed(2), longestLineNumber: len.indexOf(mx) + 1, duplicateLines: l.length - new Set(l).size }; },
  },
  'trim-lines': {
    desc: 'Pulisce le righe: spazi ai bordi, righe vuote multiple (--no-blank, --left, --right)', usage: '[--file=x] [--no-blank] [--left | --right]',
    fn: (a, o, io) => { let l = lines(src(o, io)).map(x => (o.left ? x.replace(/^\s+/, '') : o.right ? x.replace(/\s+$/, '') : x.trim())); if (o['no-blank']) l = l.filter(x => x); else l = l.filter((x, i) => x || (i > 0 && l[i - 1])); while (l.length && !l[l.length - 1]) l.pop(); return l.join('\n'); },
  },
  'add-affix': {
    desc: 'Aggiunge prefisso e/o suffisso a ogni riga (\\t e \\n ammessi)', usage: '--prefix="- " [--suffix=","] [--skip-empty] [--file=x]',
    fn: (a, o, io) => { if (o.prefix === undefined && o.suffix === undefined) throw new Error('Serve --prefix o --suffix'); const p = o.prefix === undefined || o.prefix === true ? '' : unesc(o.prefix), s = o.suffix === undefined || o.suffix === true ? '' : unesc(o.suffix); return lines(src(o, io)).map(x => (o['skip-empty'] && !x ? x : p + x + s)).join('\n'); },
  },
  columns: {
    desc: 'Allinea in colonne un testo separato da spazi o da un delimitatore (--d)', usage: '[--d=","] [--gap=2] [--file=x]',
    fn: (a, o, io) => { const d = o.d === undefined || o.d === true ? null : unesc(o.d), rows = lines(src(o, io)).filter(x => x.trim()).map(l => (d === null ? l.trim().split(/\s+/) : l.split(d).map(x => x.trim()))), n = Math.max(0, ...rows.map(r => r.length)), w = Array.from({ length: n }, (_, i) => Math.max(...rows.map(r => [...(r[i] || '')].length))), gap = ' '.repeat(o.gap === undefined ? 2 : +o.gap); return rows.map(r => r.map((c, i) => (i === r.length - 1 ? c : c + ' '.repeat(w[i] - [...c].length))).join(gap)).join('\n'); },
  },
  'paste-columns': {
    desc: 'Affianca due file riga per riga (--d="\\t")', usage: 'a.txt b.txt [--d=" | "]',
    fn: (a, o) => { if (a.length < 2) throw new Error('Servono due file'); const A = lines(fs.readFileSync(a[0], 'utf8')), B = lines(fs.readFileSync(a[1], 'utf8')), d = o.d === undefined || o.d === true ? '\t' : unesc(o.d); return Array.from({ length: Math.max(A.length, B.length) }, (_, i) => (A[i] === undefined ? '' : A[i]) + d + (B[i] === undefined ? '' : B[i])).join('\n'); },
  },
};
