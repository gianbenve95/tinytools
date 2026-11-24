'use strict';
// Numeri, unità, tempo, colori

// ---- cron ----
function parseField(f, min, max, names) {
  const set = new Set();
  for (let part of f.split(',')) {
    let step = 1; const sm = part.match(/^(.+)\/(\d+)$/); if (sm) { part = sm[1]; step = +sm[2]; if (!step) throw new Error('Passo cron non valido'); }
    let lo, hi;
    if (part === '*') { lo = min; hi = max; }
    else { const r = part.split('-'); const val = x => { const v = names && names[x.toLowerCase()] !== undefined ? names[x.toLowerCase()] : +x; if (!Number.isInteger(v)) throw new Error('Valore cron non valido: ' + x); return v; }; lo = val(r[0]); hi = r.length > 1 ? val(r[1]) : sm ? max : lo; }
    if (lo < min || hi > max || lo > hi) throw new Error(`Valore cron fuori intervallo (${min}-${max}): ${part}`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
function cronNext(expr, from, n, utc) {
  const p = expr.trim().split(/\s+/); if (p.length !== 5) throw new Error('Servono 5 campi: minuto ora giorno mese giorno-settimana');
  const [mi, ho, dm, mo, dw] = [parseField(p[0], 0, 59), parseField(p[1], 0, 23), parseField(p[2], 1, 31), parseField(p[3], 1, 12, MON), parseField(p[4], 0, 7, DOW)];
  if (dw.has(7)) dw.add(0);
  const domStar = p[2] === '*' || p[2].startsWith('*/'), dowStar = p[4] === '*' || p[4].startsWith('*/');
  const g = utc ? { y: 'getUTCFullYear', M: 'getUTCMonth', d: 'getUTCDate', h: 'getUTCHours', m: 'getUTCMinutes', w: 'getUTCDay' } : { y: 'getFullYear', M: 'getMonth', d: 'getDate', h: 'getHours', m: 'getMinutes', w: 'getDay' };
  const d = new Date(from.getTime()); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
  const out = []; let guard = 0;
  while (out.length < n && guard++ < 2_200_000) {
    const day = d[g.d](), wd = d[g.w](), dayOk = domStar && dowStar ? true : domStar ? dw.has(wd) : dowStar ? dm.has(day) : dm.has(day) || dw.has(wd);
    if (!mo.has(d[g.M]() + 1) || !dayOk) { if (utc) d.setUTCHours(24, 0, 0, 0); else { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); } continue; }
    if (!ho.has(d[g.h]())) { d.setMinutes(0, 0, 0); d.setTime(d.getTime() + 3600000); continue; }
    if (mi.has(d[g.m]())) out.push(new Date(d.getTime()));
    d.setTime(d.getTime() + 60000);
  }
  return out;
}

// ---- calc (shunting-yard, niente eval) ----
const FN = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, ln: Math.log, log: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan, min: Math.min, max: Math.max };
const CONST = { pi: Math.PI, e: Math.E };
function calc(src) {
  const tk = []; const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[a-z]+|[-+*/%^(),])/gy; let m, last = 0;
  while ((m = re.exec(src.toLowerCase())) !== null) { tk.push(m[1]); last = re.lastIndex; }
  if (src.slice(last).trim()) throw new Error('Carattere non valido in: ' + src.slice(last).trim());
  let i = 0;
  const peek = () => tk[i], next = () => tk[i++];
  function primary() {
    const t = next(); if (t === undefined) throw new Error('Espressione incompleta');
    if (t === '(') { const v = expr(); if (next() !== ')') throw new Error('Parentesi non chiusa'); return v; }
    if (t === '-') return -power(); if (t === '+') return power();
    if (/^[\d.]/.test(t)) return parseFloat(t);
    if (t in CONST) return CONST[t];
    if (t in FN) { if (next() !== '(') throw new Error('Serve ( dopo ' + t); const args = []; if (peek() !== ')') { do args.push(expr()); while (peek() === ',' && next()); } if (next() !== ')') throw new Error('Parentesi non chiusa'); return FN[t](...args); }
    throw new Error('Token sconosciuto: ' + t);
  }
  function power() { const b = primary(); if (peek() === '^') { next(); return Math.pow(b, power()); } return b; }
  function term() { let v = power(); while (['*', '/', '%'].includes(peek())) { const o = next(), r = power(); if ((o === '/' || o === '%') && r === 0) throw new Error('Divisione per zero'); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const o = next(), r = term(); v = o === '+' ? v + r : v - r; } return v; }
  const v = expr(); if (i < tk.length) throw new Error('Token inatteso: ' + tk[i]);
  return v;
}

// ---- unità ----
const UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
  weight: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125 },
  volume: { l: 1, ml: 0.001, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625 },
  speed: { ms: 1, kmh: 1 / 3.6, mph: 0.44704, kn: 0.514444444 },
  time: { s: 1, min: 60, h: 3600, d: 86400, w: 604800 },
};
const TEMP = { c: x => x, f: x => (x - 32) * 5 / 9, k: x => x - 273.15 }, FROM_C = { c: x => x, f: x => x * 9 / 5 + 32, k: x => x + 273.15 };

// ---- colori ----
function parseColor(s) {
  s = s.trim().toLowerCase(); let m;
  if ((m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s))) { let h = m[1]; if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  if ((m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/.exec(s))) { const v = m.slice(1).map(Number); if (v.some(x => x > 255)) throw new Error('RGB fuori intervallo'); return v; }
  if ((m = /^hsl\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%\s*\)$/.exec(s))) { const [h, sa, l] = [+m[1] % 360, +m[2] / 100, +m[3] / 100], a = sa * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; }
  throw new Error('Colore non riconosciuto (usa #rrggbb, rgb(r,g,b) o hsl(h,s%,l%))');
}
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

const toDate = s => { const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00Z') : new Date(s); if (isNaN(d)) throw new Error('Data non valida: ' + s); return d; };

module.exports = {
  'cron-next': {
    desc: 'Prossime esecuzioni di un\'espressione cron (5 campi)', usage: '"*/15 9-17 * * 1-5" [--count=5] [--from=2026-01-01T00:00:00Z] [--utc]',
    fn: (a, o, io) => cronNext(io.text(), o.from ? new Date(o.from) : new Date(), +o.count || 5, !!o.utc).map(d => d.toISOString()).join('\n'),
  },
  epoch: {
    desc: 'Epoch <-> data ISO (secondi/millisecondi riconosciuti da soli)', usage: '1700000000 | 2026-01-01T00:00:00Z [--tz=Europe/Rome]',
    fn: (a, o, io) => {
      const t = io.text().trim();
      if (/^-?\d+(\.\d+)?$/.test(t)) {
        const n = +t, ms = Math.abs(n) > 1e11 ? n : n * 1000, d = new Date(ms), out = { iso: d.toISOString() };
        if (o.tz) out[o.tz] = new Intl.DateTimeFormat('sv-SE', { timeZone: o.tz, dateStyle: 'short', timeStyle: 'medium' }).format(d);
        return out;
      }
      const d = new Date(t); if (isNaN(d)) throw new Error('Data non valida'); return { seconds: Math.floor(d / 1000), milliseconds: d.getTime() };
    },
  },
  duration: {
    desc: 'Durate: "1h30m" -> secondi e "5400" -> "1h 30m"', usage: '1h30m15s | 5400',
    fn: (a, o, io) => {
      const t = io.text().trim();
      if (/^\d+$/.test(t)) { let s = +t; const p = []; for (const [u, n] of [['w', 604800], ['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) { const q = Math.floor(s / n); if (q) p.push(q + u); s %= n; } return p.join(' ') || '0s'; }
      const re = /(\d+(?:\.\d+)?)\s*(w|d|h|m|s)/g; let m, tot = 0, used = 0; const mul = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
      while ((m = re.exec(t))) { tot += +m[1] * mul[m[2]]; used += m[0].length; }
      if (!used || t.replace(/(\d+(?:\.\d+)?)\s*(w|d|h|m|s)|\s/g, '')) throw new Error('Formato non valido (es. 1h30m15s)');
      return String(tot);
    },
  },
  bytes: {
    desc: 'Dimensioni: "1.5GB" -> byte e "1234567" -> formato leggibile', usage: '1.5GiB | 1234567',
    fn: (a, o, io) => {
      const t = io.text().trim(), m = /^(\d+(?:\.\d+)?)\s*([kmgtp]?)(i?)b?$/i.exec(t); if (!m) throw new Error('Formato non valido');
      const n = +m[1], p = 'kmgtp'.indexOf(m[2].toLowerCase()) + 1;
      if (m[2] || /b$/i.test(t)) return String(Math.round(n * (m[3] ? 1024 : 1000) ** p));
      const h = base => { let v = n, i = 0; const u = base === 1024 ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] : ['B', 'kB', 'MB', 'GB', 'TB', 'PB']; while (v >= base && i < 5) { v /= base; i++; } return +v.toFixed(2) + ' ' + u[i]; };
      return { bytes: n, binary: h(1024), decimal: h(1000) };
    },
  },
  'unit-convert': {
    desc: 'Converte lunghezza, peso, volume, velocità, tempo, temperatura', usage: '10 km mi | 100 c f',
    fn: (a) => {
      if (a.length < 3) throw new Error('Uso: <valore> <da> <a>');
      const v = parseFloat(a[0]), f = a[1].toLowerCase(), t = a[2].toLowerCase(); if (isNaN(v)) throw new Error('Valore non numerico');
      if (f in TEMP && t in FROM_C) return +FROM_C[t](TEMP[f](v)).toFixed(6) + '';
      for (const g of Object.values(UNITS)) if (f in g && t in g) return +(v * g[f] / g[t]).toPrecision(10) + '';
      throw new Error(`Conversione ${f} -> ${t} non supportata`);
    },
  },
  roman: {
    desc: 'Numeri romani <-> arabi (1-3999)', usage: '2026 | MMXXVI',
    fn: (a, o, io) => {
      const t = io.text().trim(), map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
      const toR = n => { let s = ''; for (const [v, r] of map) while (n >= v) { s += r; n -= v; } return s; };
      if (/^\d+$/.test(t)) { const n = +t; if (n < 1 || n > 3999) throw new Error('Solo 1-3999'); return toR(n); }
      const u = t.toUpperCase(); if (!/^[MDCLXVI]+$/.test(u)) throw new Error('Numero romano non valido');
      let n = 0; for (let i = 0; i < u.length; i++) { const v = map.find(x => x[1] === u[i])[0], nx = u[i + 1] ? map.find(x => x[1] === u[i + 1])[0] : 0; n += v < nx ? -v : v; }
      if (toR(n) !== u) throw new Error('Numero romano non valido'); return String(n);
    },
  },
  'base-convert': {
    desc: 'Conversione di base numerica 2-36 (anche numeri molto grandi)', usage: 'FF --from=16 --to=2',
    fn: (a, o, io) => {
      const from = +o.from || 10, to = +o.to || 10, t = io.text().trim().toLowerCase(); if (from < 2 || from > 36 || to < 2 || to > 36) throw new Error('Basi ammesse: 2-36');
      const neg = t.startsWith('-'), s = neg ? t.slice(1) : t; if (!s) throw new Error('Numero mancante');
      let n = 0n; for (const c of s) { const d = parseInt(c, 36); if (isNaN(d) || d >= from) throw new Error(`Cifra non valida per base ${from}: ${c}`); n = n * BigInt(from) + BigInt(d); }
      return (neg ? '-' : '') + n.toString(to);
    },
  },
  calc: {
    desc: 'Calcolatrice sicura (+ - * / % ^, parentesi, sqrt, min, max, pi...)', usage: '"2*(3+4)^2 - sqrt(16)"',
    fn: (a, o, io) => { const v = calc(io.text()); if (!isFinite(v)) throw new Error('Risultato non finito'); return String(+v.toPrecision(14)); },
  },
  'color-convert': {
    desc: 'Colori hex/rgb/hsl e contrasto WCAG (--contrast=altro)', usage: '"#ff8800" [--contrast=#ffffff]',
    fn: (a, o, io) => {
      const c = parseColor(io.text()), h = x => x.toString(16).padStart(2, '0'), out = { hex: '#' + c.map(h).join(''), rgb: `rgb(${c.join(', ')})`, hsl: `hsl(${toHsl(c).join(', ').replace(/(\d+), (\d+), (\d+)/, '$1, $2%, $3%')})` };
      if (o.contrast) { const d = parseColor(o.contrast), [l1, l2] = [lum(c), lum(d)].sort((x, y) => y - x), r = (l1 + 0.05) / (l2 + 0.05); out.contrastRatio = +r.toFixed(2); out.wcagAA = r >= 4.5; out.wcagAAA = r >= 7; }
      return out;
    },
  },
  'date-diff': {
    desc: 'Differenza tra due date: giorni, settimane, giorni lavorativi', usage: '2026-01-01 2026-03-15',
    fn: (a) => {
      if (a.length < 2) throw new Error('Servono due date'); let [d1, d2] = [toDate(a[0]), toDate(a[1])]; const sign = d2 < d1 ? -1 : 1; if (sign < 0) [d1, d2] = [d2, d1];
      const days = Math.round((d2 - d1) / 864e5); let bd = 0; for (let i = 0; i < days; i++) { const w = new Date(d1.getTime() + i * 864e5).getUTCDay(); if (w !== 0 && w !== 6) bd++; }
      let y = d2.getUTCFullYear() - d1.getUTCFullYear(), mo = d2.getUTCMonth() - d1.getUTCMonth(), d = d2.getUTCDate() - d1.getUTCDate();
      if (d < 0) { mo--; d += new Date(Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), 0)).getUTCDate(); } if (mo < 0) { y--; mo += 12; }
      return { days: sign * days, weeks: +(sign * days / 7).toFixed(2), businessDays: sign * bd, breakdown: `${y}y ${mo}m ${d}d` };
    },
  },
};
