'use strict';
// Strumenti CSV (stdin/--file, --delim=;)
const fs = require('fs');
const { stringify, load, colIndex, isNum, cmp, parse, delimOf } = require('./csvlib');

function predicate(expr, head) {
  const m = /^\s*(.+?)\s*(>=|<=|!=|~|=|>|<|\^=|\$=|\*=)\s*(.*?)\s*$/.exec(expr); if (!m) throw new Error('Condizione non valida: ' + expr + ' (es. prezzo>10)');
  const c = colIndex(head, m[1]), op = m[2], v = m[3], re = op === '~' ? new RegExp(v, 'i') : null;
  return r => { const x = r[c] === undefined ? '' : r[c]; switch (op) { case '=': return isNum(x) && isNum(v) ? +x === +v : x === v; case '!=': return isNum(x) && isNum(v) ? +x !== +v : x !== v; case '>': return cmp(x, v) > 0; case '>=': return cmp(x, v) >= 0; case '<': return cmp(x, v) < 0; case '<=': return cmp(x, v) <= 0; case '~': return re.test(x); case '^=': return x.startsWith(v); case '$=': return x.endsWith(v); case '*=': return x.includes(v); } };
}

module.exports = {
  'csv-sort': {
    desc: 'Ordina un CSV per colonna (--col=nome|n, --desc; numeri riconosciuti da soli)', usage: '--col=prezzo [--desc] [--file=x.csv] [--delim=;]',
    fn: (a, o, io) => { const { head, body, d } = load(io, o), c = colIndex(head, o.col); body.sort((x, y) => cmp(x[c] || '', y[c] || '')); if (o.desc) body.reverse(); return stringify([head, ...body], d); },
  },
  'csv-filter': {
    desc: 'Filtra le righe: --where="prezzo>10 && nome~^A" (= != > >= < <= ~ ^= $= *=)', usage: '--where="eta>=18" [--file=x.csv]',
    fn: (a, o, io) => { if (!o.where || o.where === true) throw new Error('Serve --where'); const { head, body, d } = load(io, o), ps = o.where.split(/\s+&&\s+/).map(e => predicate(e, head)); return stringify([head, ...body.filter(r => ps.every(p => p(r)))], d); },
  },
  'csv-select': {
    desc: 'Tiene (e riordina) solo alcune colonne: --cols=nome,eta o --cols=2,1', usage: '--cols=nome,eta [--file=x.csv]',
    fn: (a, o, io) => { if (!o.cols || o.cols === true) throw new Error('Serve --cols'); const { head, body, d } = load(io, o), idx = String(o.cols).split(',').map(c => colIndex(head, c.trim())); return stringify([head, ...body].map(r => idx.map(i => r[i] === undefined ? '' : r[i])), d); },
  },
  'csv-join': {
    desc: 'Unisce due CSV su una colonna comune (--on=id, --left per mantenere tutte le righe del primo)', usage: 'a.csv b.csv --on=id [--left]',
    fn: (a, o) => {
      if (a.length < 2) throw new Error('Servono due file'); const d = delimOf(o), A = parse(fs.readFileSync(a[0], 'utf8'), d), B = parse(fs.readFileSync(a[1], 'utf8'), d); if (!A.length || !B.length) throw new Error('CSV vuoto');
      const ia = colIndex(A[0], o.on, '--on'), ib = colIndex(B[0], o.on, '--on'), keep = B[0].map((h, i) => i).filter(i => i !== ib), map = new Map();
      for (const r of B.slice(1)) (map.get(r[ib]) || map.set(r[ib], []).get(r[ib])).push(r);
      const hb = keep.map(i => (A[0].includes(B[0][i]) ? 'b_' : '') + B[0][i]), out = [[...A[0], ...hb]];
      for (const r of A.slice(1)) { const ms = map.get(r[ia]); if (ms) for (const m of ms) out.push([...r, ...keep.map(i => m[i] === undefined ? '' : m[i])]); else if (o.left) out.push([...r, ...keep.map(() => '')]); }
      return stringify(out, d);
    },
  },
  'csv-dedupe': {
    desc: 'Rimuove righe duplicate (intere o per colonne: --by=email)', usage: '[--by=col1,col2] [--file=x.csv]',
    fn: (a, o, io) => { const { head, body, d } = load(io, o), idx = o.by && o.by !== true ? String(o.by).split(',').map(c => colIndex(head, c.trim())) : null, seen = new Set(); return stringify([head, ...body.filter(r => { const k = JSON.stringify(idx ? idx.map(i => r[i]) : r); if (seen.has(k)) return false; seen.add(k); return true; })], d); },
  },
  'csv-transpose': { desc: 'Scambia righe e colonne', usage: '[--file=x.csv]', fn: (a, o, io) => { const { head, body, d } = load(io, o), rows = [head, ...body], n = Math.max(...rows.map(r => r.length)); return stringify(Array.from({ length: n }, (_, c) => rows.map(r => r[c] === undefined ? '' : r[c])), d); } },
  'csv-head': {
    desc: 'Prime o ultime N righe di dati, intestazione inclusa (--mode=head|tail)', usage: '--n=5 [--mode=tail] [--file=x.csv]',
    fn: (a, o, io) => { const { head, body, d } = load(io, o), n = +o.n || 10; if (o.mode && !['head', 'tail'].includes(o.mode)) throw new Error('--mode=head|tail'); return stringify([head, ...(o.mode === 'tail' ? body.slice(-n) : body.slice(0, n))], d); },
  },
  'csv-validate': {
    desc: 'Controlla struttura: colonne coerenti, intestazioni vuote o duplicate, righe vuote', usage: '[--file=x.csv]',
    fn: (a, o, io) => { const { head, body } = load(io, o), p = []; head.forEach((h, i) => { if (!h.trim()) p.push(`intestazione vuota alla colonna ${i + 1}`); }); const dup = head.filter((h, i) => h && head.indexOf(h) !== i); if (dup.length) p.push('intestazioni duplicate: ' + [...new Set(dup)].join(', ')); body.forEach((r, i) => { if (r.length !== head.length) p.push(`riga ${i + 2}: ${r.length} campi invece di ${head.length}`); else if (r.every(x => x === '')) p.push(`riga ${i + 2}: tutta vuota`); }); return { columns: head.length, rows: body.length, valid: p.length === 0, problems: p }; },
  },
  'csv-merge': {
    desc: 'Concatena più CSV con la stessa intestazione (unisce per nome di colonna)', usage: 'a.csv b.csv [c.csv ...]',
    fn: (a, o) => { if (a.length < 2) throw new Error('Servono almeno due file'); const d = delimOf(o), files = a.map(f => parse(fs.readFileSync(f, 'utf8'), d)).filter(r => r.length), head = [...new Set(files.flatMap(r => r[0]))], out = [head]; for (const r of files) for (const row of r.slice(1)) out.push(head.map(h => { const i = r[0].indexOf(h); return i < 0 || row[i] === undefined ? '' : row[i]; })); return stringify(out, d); },
  },
  'csv-group': {
    desc: 'Raggruppa per colonna con conteggio e somme/medie (--by=cat --agg=sum:prezzo,avg:qta)', usage: '--by=categoria [--agg=sum:prezzo,avg:qta,min:x,max:x] [--file=x.csv]',
    fn: (a, o, io) => {
      const { head, body, d } = load(io, o), b = colIndex(head, o.by, '--by'), aggs = (o.agg && o.agg !== true ? String(o.agg).split(',') : []).map(s => { const [fn, c] = s.split(':'); if (!['sum', 'avg', 'min', 'max'].includes(fn)) throw new Error('Aggregazioni: sum, avg, min, max'); return { fn, c: colIndex(head, c), name: `${fn}_${head[colIndex(head, c)]}` }; }), g = new Map();
      for (const r of body) (g.get(r[b]) || g.set(r[b], []).get(r[b])).push(r);
      const out = [[head[b], 'count', ...aggs.map(x => x.name)]], f = n => +n.toFixed(6);
      for (const [k, rows] of g) out.push([k, rows.length, ...aggs.map(x => { const v = rows.map(r => +r[x.c]).filter(n => !isNaN(n)); if (!v.length) return ''; return x.fn === 'sum' ? f(v.reduce((s, y) => s + y, 0)) : x.fn === 'avg' ? f(v.reduce((s, y) => s + y, 0) / v.length) : x.fn === 'min' ? Math.min(...v) : Math.max(...v); })]);
      return stringify(out, d);
    },
  },
};
