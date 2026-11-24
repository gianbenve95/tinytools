'use strict';
// Strumenti per il testo

const words = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9À-ɏ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const deburr = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// LCS per il diff
function lcsDiff(a, b) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push('  ' + a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push('- ' + a[i++]);
    else out.push('+ ' + b[j++]);
  }
  while (i < n) out.push('- ' + a[i++]);
  while (j < m) out.push('+ ' + b[j++]);
  return out;
}

// PRNG deterministico (mulberry32)
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');

module.exports = {
  slugify: {
    desc: 'Testo -> slug per URL (accenti rimossi)', usage: '"Ciao Mondo! È bello" [--sep=-]',
    fn: (a, o, io) => deburr(io.text()).toLowerCase().replace(/[^a-z0-9]+/g, o.sep || '-').replace(new RegExp(`^\\${o.sep || '-'}+|\\${o.sep || '-'}+$`, 'g'), ''),
  },
  textstats: {
    desc: 'Statistiche: parole, caratteri, righe, tempo di lettura', usage: '[--file=x.txt] [--wpm=200]',
    fn: (a, o, io) => {
      const t = io.text(), w = (t.match(/\S+/g) || []).length, wpm = +o.wpm || 200;
      return { characters: t.length, charactersNoSpaces: t.replace(/\s/g, '').length, words: w, lines: t === '' ? 0 : t.split('\n').length - (t.endsWith('\n') ? 1 : 0),
        sentences: (t.match(/[^.!?]+[.!?]+/g) || []).length, readingTimeMinutes: +(w / wpm).toFixed(2) };
    },
  },
  'dedupe-lines': {
    desc: 'Rimuove righe duplicate mantenendo l\'ordine', usage: '[--file=x] [--ignore-case]',
    fn: (a, o, io) => { const seen = new Set(); return io.text().split('\n').filter(l => { const k = o['ignore-case'] ? l.toLowerCase() : l; if (seen.has(k)) return false; seen.add(k); return true; }).join('\n'); },
  },
  'sort-lines': {
    desc: 'Ordina righe (--numeric, --reverse, --unique)', usage: '[--file=x] [--numeric] [--reverse] [--unique]',
    fn: (a, o, io) => {
      let l = io.text().split('\n'); if (l[l.length - 1] === '') l.pop();
      l.sort(o.numeric ? (x, y) => parseFloat(x) - parseFloat(y) : (x, y) => x.localeCompare(y));
      if (o.reverse) l.reverse(); if (o.unique) l = [...new Set(l)];
      return l.join('\n');
    },
  },
  'case-convert': {
    desc: 'Converte tra camel, pascal, snake, kebab, constant, title', usage: '--to=snake "someTextHere"',
    fn: (a, o, io) => {
      const w = words(io.text()).map(x => x.toLowerCase()), cap = x => x[0].toUpperCase() + x.slice(1);
      switch (o.to) {
        case 'camel': return w.map((x, i) => i ? cap(x) : x).join('');
        case 'pascal': return w.map(cap).join('');
        case 'snake': return w.join('_');
        case 'kebab': return w.join('-');
        case 'constant': return w.join('_').toUpperCase();
        case 'title': return w.map(cap).join(' ');
        default: throw new Error('Usa --to=camel|pascal|snake|kebab|constant|title');
      }
    },
  },
  'text-diff': {
    desc: 'Diff riga per riga tra due file', usage: 'a.txt b.txt',
    fn: (a, o, io) => { if (a.length < 2) throw new Error('Servono due file'); return lcsDiff(io.file(0).split('\n'), io.file(1).split('\n')).filter(l => o.all || !l.startsWith('  ')).join('\n'); },
  },
  'wrap-text': {
    desc: 'A capo automatico a N colonne', usage: '--width=60 [--file=x]',
    fn: (a, o, io) => {
      const width = +o.width || 80;
      return io.text().split('\n').map(p => { const out = []; let line = ''; for (const w of p.split(/\s+/).filter(Boolean)) { if (line && (line + ' ' + w).length > width) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; } out.push(line); return out.join('\n'); }).join('\n');
    },
  },
  'strip-html': {
    desc: 'HTML -> testo semplice (rimuove tag, script, stili)', usage: '[--file=page.html]',
    fn: (a, o, io) => io.text().replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim(),
  },
  'md-toc': {
    desc: 'Genera l\'indice dei contenuti di un file Markdown', usage: '--file=README.md [--max=3]',
    fn: (a, o, io) => {
      const max = +o.max || 6, seen = {}; let fence = false, out = [];
      for (const line of io.text().split('\n')) {
        if (/^```/.test(line)) { fence = !fence; continue; }
        const m = !fence && /^(#{1,6})\s+(.+?)\s*#*$/.exec(line); if (!m || m[1].length > max) continue;
        let slug = deburr(m[2]).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
        if (seen[slug] !== undefined) slug += '-' + ++seen[slug]; else seen[slug] = 0;
        out.push(`${'  '.repeat(m[1].length - 1)}- [${m[2]}](#${slug})`);
      }
      return out.join('\n');
    },
  },
  lorem: {
    desc: 'Genera testo segnaposto (deterministico con --seed)', usage: '--words=50 [--seed=1]',
    fn: (a, o) => {
      const r = rng(+o.seed || 1), n = +o.words || 50, out = [];
      for (let i = 0; i < n; i++) out.push(LOREM[Math.floor(r() * LOREM.length)]);
      let s = out.join(' ').replace(/(^|\. )(\w)/g, (m, p, c) => p + c.toUpperCase()); return s[0].toUpperCase() + s.slice(1) + '.';
    },
  },
};
