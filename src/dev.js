'use strict';
// Utilità per sviluppatori (tutte offline)

// ---- semver ----
function parseSv(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v).trim());
  if (!m) throw new Error('Versione non valida: ' + v);
  return { M: +m[1], m: +m[2], p: +m[3], pre: m[4] ? m[4].split('.') : [] };
}
function cmpSv(a, b) {
  for (const k of ['M', 'm', 'p']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i]; if (x === undefined) return -1; if (y === undefined) return 1; if (x === y) continue;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return +x < +y ? -1 : 1; if (nx) return -1; if (ny) return 1; return x < y ? -1 : 1;
  }
  return 0;
}
function satisfies(v, range) {
  const ver = parseSv(v);
  return range.trim().split(/\s+/).every(c => {
    const m = /^(\^|~|>=|<=|>|<|=)?v?(\d+(?:\.\d+){0,2}(?:-[\w.-]+)?)$/.exec(c); if (!m) throw new Error('Intervallo non valido: ' + c);
    const parts = m[2].split('-')[0].split('.'), base = parseSv(parts.concat(['0', '0']).slice(0, 3).join('.') + (m[2].includes('-') ? '-' + m[2].split('-').slice(1).join('-') : ''));
    const op = m[1] || '=';
    if (op === '^') { const up = base.M > 0 ? { M: base.M + 1, m: 0, p: 0, pre: [] } : base.m > 0 ? { M: 0, m: base.m + 1, p: 0, pre: [] } : { M: 0, m: 0, p: base.p + 1, pre: [] }; return cmpSv(ver, base) >= 0 && cmpSv(ver, up) < 0; }
    if (op === '~') return cmpSv(ver, base) >= 0 && cmpSv(ver, { M: base.M, m: base.m + 1, p: 0, pre: [] }) < 0;
    const c2 = cmpSv(ver, base); return op === '=' ? c2 === 0 : op === '>' ? c2 > 0 : op === '>=' ? c2 >= 0 : op === '<' ? c2 < 0 : c2 <= 0;
  });
}

// ---- inferenza tipi ----
const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
function inferSchema(vals) {
  const types = [...new Set(vals.map(typeOf))];
  const one = t => {
    const s = { type: t === 'number' && vals.every(v => typeof v !== 'number' || Number.isInteger(v)) ? 'integer' : t };
    if (t === 'object') { const objs = vals.filter(v => typeOf(v) === 'object'), keys = [...new Set(objs.flatMap(Object.keys))]; s.properties = {}; for (const k of keys) s.properties[k] = inferSchema(objs.filter(o => k in o).map(o => o[k])); const req = keys.filter(k => objs.every(o => k in o)); if (req.length) s.required = req; }
    if (t === 'array') { const items = vals.filter(v => Array.isArray(v)).flat(); if (items.length) s.items = inferSchema(items); }
    return s;
  };
  const list = types.map(one); return list.length === 1 ? list[0] : { anyOf: list };
}
const pascal = s => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (m, a, c) => c.toUpperCase()) || 'Item';
function toTS(vals, name, out) {
  const parts = [...new Set(vals.map(typeOf))].map(t => {
    if (t === 'object') {
      const objs = vals.filter(v => typeOf(v) === 'object'), keys = [...new Set(objs.flatMap(Object.keys))], fields = keys.map(k => {
        const sub = objs.filter(o => k in o).map(o => o[k]), opt = objs.some(o => !(k in o)) ? '?' : '';
        return `  ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}${opt}: ${toTS(sub, pascal(k), out)};`;
      });
      const nm = pascal(name); let u = nm, i = 2; while (out.has(u)) u = nm + i++; out.set(u, `interface ${u} {\n${fields.join('\n')}\n}`); return u;
    }
    if (t === 'array') { const items = vals.filter(Array.isArray).flat(); const e = items.length ? toTS(items, name + 'Item', out) : 'unknown'; return /[|]/.test(e) ? `(${e})[]` : e + '[]'; }
    return t;
  });
  return parts.join(' | ') || 'unknown';
}

function globToRe(g) {
  let re = '', i = 0, brace = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*') { if (g[i + 1] === '*') { i += 2; if (g[i] === '/') { re += '(?:.*/)?'; i++; } else re += '.*'; continue; } re += '[^/]*'; }
    else if (c === '?') re += '[^/]';
    else if (c === '{') { re += '(?:'; brace++; }
    else if (c === '}' && brace) { re += ')'; brace--; }
    else if (c === ',' && brace) re += '|';
    else if (c === '[') { const j = g.indexOf(']', i + 1); if (j < 0) re += '\\['; else { re += '[' + g.slice(i + 1, j).replace(/^!/, '^') + ']'; i = j; } }
    else re += c.replace(/[.+^$()|\\]/g, '\\$&');
    i++;
  }
  return new RegExp('^' + re + '$');
}
const parseKV = s => { const o = {}; for (const [k, v] of new URLSearchParams(s)) o[k] = k in o ? [].concat(o[k], v) : v; return o; };

module.exports = {
  semver: {
    desc: 'Confronta, incrementa e verifica versioni semver', usage: 'compare 1.2.3 1.10.0 | bump 1.2.3 minor | satisfies 1.4.0 "^1.2.0"',
    fn: (a) => {
      const [cmd, x, y] = a;
      if (cmd === 'compare') return String(cmpSv(parseSv(x), parseSv(y)));
      if (cmd === 'satisfies') return String(satisfies(x, y));
      if (cmd === 'bump') { const v = parseSv(x); if (y === 'major') return `${v.M + 1}.0.0`; if (y === 'minor') return `${v.M}.${v.m + 1}.0`; if (y === 'patch') return `${v.M}.${v.m}.${v.pre.length ? v.p : v.p + 1}`; throw new Error('Usa major|minor|patch'); }
      throw new Error('Sottocomandi: compare, bump, satisfies');
    },
  },
  'regex-test': {
    desc: 'Prova una regex su un testo: match, posizioni, gruppi', usage: '"(\\d+)-(\\d+)" "10-20 e 30-40" [--flags=g]',
    fn: (a, o) => {
      if (a.length < 2) throw new Error('Uso: regex-test <pattern> <testo>'); let re; try { re = new RegExp(a[0], o.flags === undefined ? 'g' : String(o.flags).replace(/[^dgimsuy]/g, '')); } catch (e) { throw new Error('Regex non valida: ' + e.message); }
      const text = a.slice(1).join(' '), out = []; if (!re.global) { const m = re.exec(text); if (m) out.push(m); } else for (const m of text.matchAll(re)) { out.push(m); if (out.length >= 1000) break; }
      return { matches: out.length, results: out.map(m => ({ match: m[0], index: m.index, groups: m.slice(1), named: m.groups || undefined })) };
    },
  },
  'json-to-ts': {
    desc: 'Genera interfacce TypeScript da un JSON', usage: '[--file=x.json] [--name=Root]',
    fn: (a, o, io) => { let d; try { d = JSON.parse(io.text()); } catch (e) { throw new Error('JSON non valido: ' + e.message); } const out = new Map(), root = toTS([d], o.name || 'Root', out); const decls = [...out.values()].reverse().join('\n\n'); return decls ? decls + (root === pascal(o.name || 'Root') ? '' : `\n\ntype ${pascal(o.name || 'Root')} = ${root};`) : `type ${pascal(o.name || 'Root')} = ${root};`; },
  },
  'json-schema-infer': {
    desc: 'Deduce uno JSON Schema (draft-07) da uno o più esempi', usage: '[--file=x.json]',
    fn: (a, o, io) => { let d; try { d = JSON.parse(io.text()); } catch (e) { throw new Error('JSON non valido: ' + e.message); } return { $schema: 'http://json-schema.org/draft-07/schema#', ...inferSchema([d]) }; },
  },
  'env-diff': {
    desc: 'Confronta le chiavi di due file .env (senza mostrare i valori)', usage: '.env .env.example',
    fn: (a, o, io) => {
      if (a.length < 2) throw new Error('Servono due file'); const parse = t => Object.fromEntries(t.split(/\r?\n/).map(l => /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2].trim()]));
      const x = parse(io.file(0)), y = parse(io.file(1)), K = (p, q) => Object.keys(p).filter(k => !(k in q));
      return { onlyInFirst: K(x, y), onlyInSecond: K(y, x), differentValues: Object.keys(x).filter(k => k in y && x[k] !== y[k]) };
    },
  },
  'http-headers': {
    desc: 'Analizza un blocco di header HTTP (anche output di curl -i) in JSON', usage: '--file=headers.txt',
    fn: (a, o, io) => {
      const out = { headers: {} }; for (const l of io.text().split(/\r?\n/)) {
        if (!l.trim()) { if (Object.keys(out.headers).length) break; continue; }
        const s = /^HTTP\/[\d.]+\s+(\d{3})\s*(.*)$/.exec(l); if (s) { out.status = +s[1]; out.statusText = s[2]; continue; }
        const m = /^([^:\s][^:]*):\s*(.*)$/.exec(l); if (m) { const k = m[1].toLowerCase(); out.headers[k] = k in out.headers ? [].concat(out.headers[k], m[2]) : m[2]; }
      }
      if (!Object.keys(out.headers).length) throw new Error('Nessun header trovato'); return out;
    },
  },
  'cookie-parse': {
    desc: 'Analizza un header Cookie o Set-Cookie', usage: '"sid=abc; Path=/; HttpOnly; Max-Age=3600"',
    fn: (a, o, io) => {
      const parts = io.text().replace(/^(set-)?cookie:\s*/i, '').split(/;\s*/).filter(Boolean), cookies = {}, attrs = {}, flags = [];
      parts.forEach((p, i) => { const eq = p.indexOf('='), k = eq < 0 ? p : p.slice(0, eq), v = eq < 0 ? '' : p.slice(eq + 1); if (o.request || (!o.setcookie && parts.length > 0 && i > 0 && !/^(expires|max-age|domain|path|samesite|secure|httponly|partitioned)$/i.test(k))) cookies[k] = v; else if (i === 0) cookies[k] = v; else if (eq < 0) flags.push(k.toLowerCase()); else attrs[k.toLowerCase()] = v; });
      return { cookies, attributes: attrs, flags };
    },
  },
  'query-string': {
    desc: 'Query string <-> JSON (chiavi ripetute = array)', usage: 'parse "a=1&b=2&a=3" | build \'{"a":[1,3],"b":"x y"}\'',
    fn: (a) => {
      const [cmd, ...r] = a, t = r.join(' ');
      if (cmd === 'parse') return parseKV(t.replace(/^[^?]*\?/, ''));
      if (cmd === 'build') { let d; try { d = JSON.parse(t); } catch { throw new Error('JSON non valido'); } const p = new URLSearchParams(); for (const [k, v] of Object.entries(d)) for (const x of [].concat(v)) p.append(k, String(x)); return p.toString(); }
      throw new Error('Sottocomandi: parse, build');
    },
  },
  'glob-test': {
    desc: 'Verifica quali percorsi corrispondono a un glob (*, **, ?, {a,b}, [abc])', usage: '"src/**/*.{js,ts}" src/a.js src/x/b.ts README.md',
    fn: (a) => { if (a.length < 2) throw new Error('Uso: glob-test <glob> <percorso...>'); const re = globToRe(a[0]); return a.slice(1).map(p => `${re.test(p) ? 'SI ' : 'NO '} ${p}`).join('\n'); },
  },
  'line-endings': {
    desc: 'Rileva LF/CRLF/CR e converte (--to=lf|crlf)', usage: '--file=x.txt [--to=lf]',
    fn: (a, o, io) => {
      const t = io.text(), crlf = (t.match(/\r\n/g) || []).length, cr = (t.match(/\r(?!\n)/g) || []).length, lf = (t.match(/(?<!\r)\n/g) || []).length;
      if (o.to) { if (!['lf', 'crlf'].includes(o.to)) throw new Error('--to=lf|crlf'); const n = t.replace(/\r\n|\r/g, '\n'); return o.to === 'lf' ? n : n.replace(/\n/g, '\r\n'); }
      return { lf, crlf, cr, style: [lf && 'LF', crlf && 'CRLF', cr && 'CR'].filter(Boolean).join('+') || 'nessuna' };
    },
  },
};
