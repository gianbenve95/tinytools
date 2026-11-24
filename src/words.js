'use strict';
// Parole, cifrari, tabelle
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.', '-': '-....-', '@': '.--.-.' };
const REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const NATO = { A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu', 0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine' };
const deburr = s => s.replace(/ß/g, 'ss').replace(/[æÆ]/g, m => (m === 'æ' ? 'ae' : 'AE')).replace(/[øØ]/g, m => (m === 'ø' ? 'o' : 'O')).normalize('NFD').replace(/[̀-ͯ]/g, '');

const IT_U = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const IT_T = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
function it999(n, accent, pre) {
  let s = '';
  const h = Math.floor(n / 100), r = n % 100;
  if (h) s += (h > 1 ? IT_U[h] : '') + 'cento';
  if (r) {
    let t;
    if (r < 20) t = IT_U[r]; else { const d = Math.floor(r / 10), u = r % 10; t = IT_T[d]; if (u) { if (u === 1 || u === 8) t = t.slice(0, -1); t += IT_U[u]; } }
    if (h && /^ottan/.test(t)) s = s.slice(0, -1); // centottanta
    s += t;
  }
  if (accent && n % 10 === 3 && (n > 20 || (n === 3 && pre))) s = s.replace(/tre$/, 'tré');
  return s;
}
function itWords(n) {
  if (n === 0) return 'zero';
  const scales = [[1e9, 'miliardo', 'miliardi'], [1e6, 'milione', 'milioni']], parts = []; let rest = n;
  for (const [v, s1, sp] of scales) { const q = Math.floor(rest / v); rest %= v; if (q) parts.push(q === 1 ? `un ${s1}` : `${q > 20 ? itWords(q).replace(/tre$/, 'tré') : itWords(q)} ${sp}`); }
  const th = Math.floor(rest / 1000), low = rest % 1000;
  let s = '';
  if (th) s += th === 1 ? 'mille' : it999(th, false) + 'mila';
  if (low) s += it999(low, true, !!th || parts.length > 0);
  if (s) parts.push(s);
  return parts.join(' ').replace(/ (milione|milioni|miliardo|miliardi) /g, ' $1 ');
}
const EN_U = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'], EN_T = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function en999(n) { const p = []; if (n >= 100) p.push(EN_U[Math.floor(n / 100)] + ' hundred'); const r = n % 100; if (r) p.push(r < 20 ? EN_U[r] : EN_T[Math.floor(r / 10)] + (r % 10 ? '-' + EN_U[r % 10] : '')); return p.join(' '); }
function enWords(n) { if (n === 0) return 'zero'; const p = []; for (const [v, w] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [1, '']]) { const q = Math.floor(n / v); n %= v; if (q) p.push(en999(q) + (w ? ' ' + w : '')); } return p.join(' '); }

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

module.exports = {
  caesar: {
    desc: 'Cifrario di Cesare / ROT13 (--shift=3, negativo per decifrare)', usage: '"testo" --shift=13',
    fn: (a, o, io) => { const k = ((+o.shift || 3) % 26 + 26) % 26; return io.text().replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + k) % 26 + b); }); },
  },
  morse: {
    desc: 'Codice Morse: testo <-> morse (--decode)', usage: '"SOS" | "... --- ..." --decode',
    fn: (a, o, io) => {
      const t = io.text().trim();
      if (o.decode) return t.split(/\s*\/\s*|\s{3,}/).map(w => w.split(/\s+/).map(c => { if (!(c in REV)) throw new Error('Simbolo morse sconosciuto: ' + c); return REV[c]; }).join('')).join(' ');
      return t.toUpperCase().split(/\s+/).map(w => [...w].map(c => { if (!(c in MORSE)) throw new Error('Carattere non codificabile: ' + c); return MORSE[c]; }).join(' ')).join(' / ');
    },
  },
  nato: {
    desc: 'Alfabeto fonetico NATO (compitare un testo)', usage: '"Ciao 42"',
    fn: (a, o, io) => [...deburr(io.text()).toUpperCase().replace(/\n$/, '')].map(c => c === ' ' ? '/' : NATO[c] || c).join(' '),
  },
  'word-freq': {
    desc: 'Parole più frequenti di un testo', usage: '[--file=x.txt] [--top=10] [--min=3]',
    fn: (a, o, io) => { const f = {}, min = +o.min || 1; for (const w of io.text().toLowerCase().match(/[\p{L}\p{N}'’]+/gu) || []) if ([...w].length >= min) f[w] = (f[w] || 0) + 1; return Object.entries(f).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, +o.top || 10).map(([w, n]) => `${String(n).padStart(5)}  ${w}`).join('\n'); },
  },
  reverse: {
    desc: 'Inverte testo per caratteri, parole o righe (--by=chars|words|lines)', usage: '"testo" [--by=words]',
    fn: (a, o, io) => { const t = io.text().replace(/\n$/, ''), by = o.by || 'chars'; if (by === 'chars') return Array.from(t).reverse().join(''); if (by === 'words') return t.split(/(\s+)/).reverse().join(''); if (by === 'lines') return t.split('\n').reverse().join('\n'); throw new Error('--by=chars|words|lines'); },
  },
  deburr: { desc: 'Rimuove accenti e diacritici (è -> e, ß -> ss)', usage: '"Perché è così"', fn: (a, o, io) => deburr(io.text()) },
  'number-to-words': {
    desc: 'Numero in lettere (italiano o inglese, fino a 999 miliardi)', usage: '1234 [--lang=it|en]',
    fn: (a, o, io) => { const t = io.text().trim(); if (!/^\d{1,12}$/.test(t)) throw new Error('Serve un intero tra 0 e 999999999999'); const n = +t; if (o.lang === 'en') return enWords(n); if (o.lang && o.lang !== 'it') throw new Error('--lang=it|en'); return itWords(n); },
  },
  'md-table': {
    desc: 'CSV/TSV -> tabella Markdown allineata', usage: '[--file=x.csv] [--delim=,]',
    fn: (a, o, io) => {
      const d = o.delim === '\\t' ? '\t' : o.delim || ',', rows = []; for (const line of io.text().split(/\r?\n/)) { if (!line.trim()) continue; const r = []; let f = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"' && !f) q = true; else if (c === d) { r.push(f); f = ''; } else f += c; } r.push(f); rows.push(r); }
      if (!rows.length) throw new Error('Nessun dato'); const n = Math.max(...rows.map(r => r.length)), w = Array.from({ length: n }, (_, i) => Math.max(3, ...rows.map(r => (r[i] || '').replace(/\|/g, '\\|').length)));
      const fmt = r => '| ' + w.map((x, i) => (r[i] || '').replace(/\|/g, '\\|').padEnd(x)).join(' | ') + ' |';
      return [fmt(rows[0]), '| ' + w.map(x => '-'.repeat(x)).join(' | ') + ' |', ...rows.slice(1).map(fmt)].join('\n');
    },
  },
  'sample-lines': {
    desc: 'Prime/ultime/casuali N righe (--mode=head|tail|random)', usage: '--n=5 [--mode=random] [--seed=1]',
    fn: (a, o, io) => {
      let l = io.text().split('\n'); if (l[l.length - 1] === '') l.pop(); const n = +o.n || 10, mode = o.mode || 'head';
      if (mode === 'head') return l.slice(0, n).join('\n'); if (mode === 'tail') return l.slice(-n).join('\n');
      if (mode !== 'random') throw new Error('--mode=head|tail|random'); const r = rng(+o.seed || Date.now()); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l.slice(0, n).join('\n');
    },
  },
  'join-lines': {
    desc: 'Unisce le righe con un separatore (--sep=", " --quote="\'")', usage: '--sep=", " [--quote=\'"\']',
    fn: (a, o, io) => { const q = o.quote === true ? '"' : o.quote || ''; return io.text().split('\n').map(x => x.trim()).filter(Boolean).map(x => q + x + q).join(o.sep === undefined ? ',' : o.sep === true ? ' ' : o.sep); },
  },
};
