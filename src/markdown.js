'use strict';
// Markdown: analisi e conversione di base (sottoinsieme CommonMark)
const fs = require('fs'), path = require('path');
const deburr = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugger = () => { const seen = {}; return t => { let s = t.toLowerCase().replace(/[`*_~]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-'); if (seen[s] !== undefined) s += '-' + ++seen[s]; else seen[s] = 0; return s; }; };
// restituisce le righe con info "dentro blocco di codice"
function scan(text) { let fence = null; return text.split(/\r?\n/).map((line, i) => { const m = /^\s{0,3}(```+|~~~+)/.exec(line); let code = !!fence; if (m) { if (!fence) { fence = m[1][0]; code = true; } else if (m[1][0] === fence) { fence = null; code = true; } } return { line, n: i + 1, code }; }); }
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s) {
  const codes = []; s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s).replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => `<img src="${u}" alt="${a}">`).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^\s*javascript:/i.test(u) ? t : `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (m, a, b) => `<strong>${a || b}</strong>`).replace(/\*([^*]+)\*|(?<![\w])_([^_]+)_(?![\w])/g, (m, a, b) => `<em>${a || b}</em>`).replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[+i]);
}
function mdToHtml(text) {
  const out = [], lines = text.split(/\r?\n/); let i = 0;
  while (i < lines.length) {
    const l = lines[i]; let m;
    if (!l.trim()) { i++; continue; }
    if ((m = /^\s{0,3}(```+|~~~+)\s*(\w*)/.exec(l))) { const buf = []; i++; while (i < lines.length && !lines[i].startsWith(m[1])) buf.push(lines[i++]); i++; out.push(`<pre><code${m[2] ? ` class="language-${m[2]}"` : ''}>${esc(buf.join('\n'))}\n</code></pre>`); continue; }
    if ((m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(l))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>\n${mdToHtml(buf.join('\n'))}\n</blockquote>`); continue; }
    if ((m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(l))) { const ord = /\d/.test(m[2]), items = []; while (i < lines.length && (m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i])) && /\d/.test(m[2]) === ord) { const t = /^\[( |x|X)\]\s+(.*)$/.exec(m[3]); items.push(`<li>${t ? `<input type="checkbox" disabled${t[1] !== ' ' ? ' checked' : ''}> ` + inline(t[2]) : inline(m[3])}</li>`); i++; } out.push(`<${ord ? 'ol' : 'ul'}>\n${items.join('\n')}\n</${ord ? 'ol' : 'ul'}>`); continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*([-*+]|\d+\.)\s|\s{0,3}(```|~~~))/.test(lines[i])) buf.push(lines[i++].trim()); out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}
function yamlLite(src) {
  const val = v => { v = v.trim(); if (v === '' ) return ''; if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true'; if (v === 'null' || v === '~') return null; if (/^-?\d+(\.\d+)?$/.test(v)) return +v; if (/^".*"$/.test(v)) return JSON.parse(v); if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'"); if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean).map(val); return v; };
  const out = {}; let key = null;
  for (const l of src.split(/\r?\n/)) { if (!l.trim() || l.trim().startsWith('#')) continue; let m; if ((m = /^\s+-\s+(.*)$/.exec(l)) && key) { if (!Array.isArray(out[key])) out[key] = []; out[key].push(val(m[1])); } else if ((m = /^([\w.-]+):\s*(.*)$/.exec(l))) { key = m[1]; out[key] = m[2] === '' ? '' : val(m[2]); } else throw new Error('Riga YAML non supportata: ' + l); }
  return out;
}
const rows = text => text.split('\n'); const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim());

module.exports = {
  'md-links': {
    desc: 'Estrae link e immagini da un Markdown (ignora i blocchi di codice)', usage: '--file=README.md',
    fn: (a, o, io) => { const out = []; for (const { line, n, code } of scan(io.text())) { if (code) continue; const l = line.replace(/`[^`]*`/g, ''); for (const m of l.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) out.push({ type: m[1] ? 'image' : 'link', text: m[2], url: m[3], line: n }); for (const m of l.matchAll(/<(https?:\/\/[^>\s]+)>/g)) out.push({ type: 'autolink', text: '', url: m[1], line: n }); } return out; },
  },
  'md-headings': {
    desc: 'Struttura dei titoli (livello, testo, riga)', usage: '--file=README.md',
    fn: (a, o, io) => scan(io.text()).filter(x => !x.code).map(x => ({ ...x, m: /^(#{1,6})\s+(.+?)\s*#*$/.exec(x.line) })).filter(x => x.m).map(x => `${'  '.repeat(x.m[1].length - 1)}${x.m[2]}  (h${x.m[1].length}, riga ${x.n})`).join('\n'),
  },
  'md-lint': {
    desc: 'Controlli di stile: spazi finali, righe vuote doppie, salti di titolo, duplicati', usage: '--file=README.md [--max=120]',
    fn: (a, o, io) => {
      const t = io.text(), issues = [], seen = {}; let prev = 0, blank = 0;
      for (const { line, n, code } of scan(t)) {
        if (/\t/.test(line) && !code) issues.push(`riga ${n}: tabulazione`); if (/[ \t]+$/.test(line)) issues.push(`riga ${n}: spazi a fine riga`); if (o.max && !code && [...line].length > +o.max) issues.push(`riga ${n}: oltre ${o.max} caratteri`);
        if (!line.trim()) { blank++; if (blank === 2) issues.push(`riga ${n}: più righe vuote consecutive`); continue; } blank = 0; if (code) continue;
        if (/^#{1,6}[^#\s]/.test(line)) issues.push(`riga ${n}: manca lo spazio dopo #`);
        const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line); if (m) { const lv = m[1].length; if (prev && lv > prev + 1) issues.push(`riga ${n}: salto di livello da h${prev} a h${lv}`); prev = lv; const k = m[2].toLowerCase(); if (seen[k]) issues.push(`riga ${n}: titolo duplicato "${m[2]}" (già a riga ${seen[k]})`); else seen[k] = n; }
      }
      if (t && !t.endsWith('\n')) issues.push('manca il newline finale'); return issues.length ? issues.join('\n') : 'Nessun problema trovato';
    },
  },
  'md-to-html': { desc: 'Converte Markdown (sottoinsieme sicuro) in HTML', usage: '--file=README.md', fn: (a, o, io) => mdToHtml(io.text()) },
  'md-strip': {
    desc: 'Rimuove la sintassi Markdown lasciando testo semplice', usage: '--file=README.md',
    fn: (a, o, io) => scan(io.text()).filter(x => !/^\s{0,3}(```+|~~~+)/.test(x.line)).map(x => x.code ? x.line : x.line.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^\s*([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(\*|_)(.+?)\1/g, '$2').replace(/~~(.+?)~~/g, '$1').replace(/`([^`]+)`/g, '$1')).join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  },
  'md-tasks': {
    desc: 'Avanzamento delle checklist - [ ] / - [x] e attività aperte', usage: '--file=TODO.md',
    fn: (a, o, io) => { let done = 0; const open = []; for (const { line, n, code } of scan(io.text())) { if (code) continue; const m = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(line); if (!m) continue; if (m[1] === ' ') open.push(`riga ${n}: ${m[2]}`); else done++; } const tot = done + open.length; return { total: tot, done, open: open.length, progress: tot ? Math.round(done / tot * 100) + '%' : 'n/d', openTasks: open }; },
  },
  'md-front-matter': {
    desc: 'Legge il front matter YAML (sottoinsieme) e lo restituisce in JSON', usage: '--file=post.md',
    fn: (a, o, io) => { const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(io.text()); if (!m) throw new Error('Nessun front matter (--- ... ---) all\'inizio'); return { data: yamlLite(m[1]), bodyStartsAtLine: m[0].split('\n').length }; },
  },
  'md-table-sort': {
    desc: 'Ordina una tabella Markdown per colonna (--col=2 o nome, --desc, --numeric)', usage: '--col=Nome [--desc] [--numeric] [--file=t.md]',
    fn: (a, o, io) => {
      const l = rows(io.text()).filter(x => x.trim()); if (l.length < 3 || !/^\s*\|?\s*:?-+/.test(l[1])) throw new Error('Tabella Markdown non riconosciuta'); const head = cells(l[0]); let c = +o.col - 1; if (isNaN(c)) c = head.findIndex(h => h.toLowerCase() === String(o.col).toLowerCase()); if (!(c >= 0 && c < head.length)) throw new Error('Colonna non trovata');
      const body = l.slice(2).sort((x, y) => { const p = cells(x)[c] || '', q = cells(y)[c] || ''; return o.numeric ? parseFloat(p) - parseFloat(q) : p.localeCompare(q); }); if (o.desc) body.reverse(); return [l[0], l[1], ...body].join('\n');
    },
  },
  'md-anchor-check': {
    desc: 'Verifica che i link #ancora e i file relativi esistano', usage: '--file=README.md',
    fn: (a, o, io) => {
      if (!o.file) throw new Error('Serve --file per risolvere i percorsi relativi'); const text = io.text(), sl = slugger(), anchors = new Set(); for (const x of scan(text)) { const m = !x.code && /^(#{1,6})\s+(.+?)\s*#*$/.exec(x.line); if (m) anchors.add(sl(m[2])); }
      const bad = []; for (const { line, n, code } of scan(text)) { if (code) continue; for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)\)/g)) { const u = m[1]; if (/^[a-z][a-z0-9+.-]*:/i.test(u)) continue; if (u.startsWith('#')) { if (!anchors.has(u.slice(1).toLowerCase())) bad.push(`riga ${n}: ancora mancante ${u}`); } else { const f = path.resolve(path.dirname(o.file), decodeURI(u.split('#')[0])); if (!fs.existsSync(f)) bad.push(`riga ${n}: file mancante ${u}`); } } }
      return bad.length ? bad.join('\n') : 'Tutti i link interni sono validi';
    },
  },
  'md-wordcount': {
    desc: 'Conta parole escludendo codice e URL, con tempo di lettura', usage: '--file=README.md [--wpm=200]',
    fn: (a, o, io) => { const t = scan(io.text()).filter(x => !x.code && !/^\s{0,3}(```|~~~)/.test(x.line)).map(x => x.line).join('\n').replace(/`[^`]*`/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[#>*_~|-]+/g, ' '), w = (t.match(/[\p{L}\p{N}'’]+/gu) || []).length; return { words: w, readingTimeMinutes: +(w / (+o.wpm || 200)).toFixed(2) }; },
  },
};
