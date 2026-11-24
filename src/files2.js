'use strict';
// File e cartelle: ispezione (modificano file solo con --fix)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SKIP = new Set(['.git', 'node_modules', '.DS_Store']);
function* walk(dir, all = false) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (!all && SKIP.has(e.name)) continue; const p = path.join(dir, e.name); if (e.isSymbolicLink()) continue; if (e.isDirectory()) yield* walk(p, all); else if (e.isFile()) yield p; } }
const root = a => { const d = a[0] || '.'; if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error('Cartella non trovata: ' + d); return d; };
const human = n => { const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++; } return +n.toFixed(i ? 1 : 0) + ' ' + u[i]; };
const isText = b => !b.includes(0);

const MAGIC = [
  ['89504e470d0a1a0a', 0, 'PNG', 'image/png'], ['ffd8ff', 0, 'JPEG', 'image/jpeg'], ['474946383761', 0, 'GIF', 'image/gif'], ['474946383961', 0, 'GIF', 'image/gif'], ['25504446', 0, 'PDF', 'application/pdf'],
  ['504b0304', 0, 'ZIP (anche docx/xlsx/jar/apk)', 'application/zip'], ['1f8b', 0, 'GZIP', 'application/gzip'], ['425a68', 0, 'BZIP2', 'application/x-bzip2'], ['fd377a585a00', 0, 'XZ', 'application/x-xz'], ['377abcaf271c', 0, '7-Zip', 'application/x-7z-compressed'],
  ['494433', 0, 'MP3 (ID3)', 'audio/mpeg'], ['664c6143', 0, 'FLAC', 'audio/flac'], ['4f676753', 0, 'OGG', 'audio/ogg'], ['53514c69746520666f726d6174203300', 0, 'SQLite', 'application/vnd.sqlite3'],
  ['7f454c46', 0, 'ELF (eseguibile Linux)', 'application/x-elf'], ['cffaedfe', 0, 'Mach-O 64 bit (macOS)', 'application/x-mach-binary'], ['cafebabe', 0, 'Mach-O universale / classe Java', 'application/octet-stream'], ['4d5a', 0, 'Eseguibile Windows (PE)', 'application/vnd.microsoft.portable-executable'],
  ['49492a00', 0, 'TIFF (LE)', 'image/tiff'], ['4d4d002a', 0, 'TIFF (BE)', 'image/tiff'], ['00000100', 0, 'ICO', 'image/x-icon'], ['1a45dfa3', 0, 'Matroska/WebM', 'video/webm'], ['4f54544f', 0, 'OpenType', 'font/otf'], ['774f4632', 0, 'WOFF2', 'font/woff2'], ['25215053', 0, 'PostScript', 'application/postscript'],
];
const MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', xml: 'application/xml', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', yaml: 'application/yaml', yml: 'application/yaml', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', pdf: 'application/pdf', zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', wasm: 'application/wasm', ics: 'text/calendar', epub: 'application/epub+zip' };

function detect(buf) {
  for (const [hex, off, name, mime] of MAGIC) if (buf.subarray(off, off + hex.length / 2).toString('hex') === hex) return { type: name, mime };
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF') { const k = buf.subarray(8, 12).toString(); if (k === 'WEBP') return { type: 'WebP', mime: 'image/webp' }; if (k === 'WAVE') return { type: 'WAV', mime: 'audio/wav' }; if (k === 'AVI ') return { type: 'AVI', mime: 'video/x-msvideo' }; }
  if (buf.length >= 12 && buf.subarray(4, 8).toString() === 'ftyp') return { type: 'MP4/MOV/HEIC (ISO media)', mime: 'video/mp4' };
  if (buf.subarray(0, 5).toString() === '<?xml') return { type: 'XML', mime: 'application/xml' };
  if (/^\s*<(!doctype html|html)/i.test(buf.subarray(0, 200).toString())) return { type: 'HTML', mime: 'text/html' };
  if (buf.subarray(0, 2).toString() === '#!') return { type: 'Script con shebang', mime: 'text/x-script' };
  return isText(buf.subarray(0, 8000)) ? { type: 'Testo', mime: 'text/plain' } : { type: 'Dati binari', mime: 'application/octet-stream' };
}

module.exports = {
  'file-type': {
    desc: 'Riconosce il tipo reale di un file dai suoi primi byte', usage: 'file1 [file2...]',
    fn: (a) => { if (!a.length) throw new Error('Indica uno o più file'); return a.map(f => { if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return `${f}: non trovato`; const fd = fs.openSync(f, 'r'), b = Buffer.alloc(8192), n = fs.readSync(fd, b, 0, 8192, 0); fs.closeSync(fd); const d = detect(b.subarray(0, n)); return `${f}: ${d.type} (${d.mime})`; }).join('\n'); },
  },
  mime: { desc: 'Tipo MIME di un\'estensione o di un nome di file', usage: 'pdf | foto.JPG', fn: (a, o, io) => { const e = io.text().trim().toLowerCase().replace(/^.*\./, ''), m = MIME[e]; if (!m) throw new Error('Estensione sconosciuta: ' + e); return m; } },
  'ext-count': {
    desc: 'Conta file e spazio per estensione', usage: '<cartella>',
    fn: (a) => { const st = {}; for (const f of walk(root(a))) { const e = path.extname(f).toLowerCase() || '(nessuna)', s = st[e] || (st[e] = { files: 0, bytes: 0 }); s.files++; s.bytes += fs.statSync(f).size; } return Object.fromEntries(Object.entries(st).sort((x, y) => y[1].bytes - x[1].bytes).map(([k, v]) => [k, { files: v.files, size: human(v.bytes), bytes: v.bytes }])); },
  },
  newest: {
    desc: 'I file modificati più di recente', usage: '<cartella> [--top=10]',
    fn: (a, o) => [...walk(root(a))].map(f => [f, fs.statSync(f).mtimeMs]).sort((x, y) => y[1] - x[1]).slice(0, +o.top || 10).map(([f, t]) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')}  ${f}`).join('\n') || 'Nessun file',
  },
  'empty-dirs': {
    desc: 'Elenca le cartelle vuote (non cancella nulla)', usage: '<cartella>',
    fn: (a) => { const out = []; const isEmpty = d => fs.readdirSync(d, { withFileTypes: true }).every(e => e.name === '.DS_Store' || (e.isDirectory() && !e.isSymbolicLink() && isEmpty(path.join(d, e.name)))); (function rec(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory() && !e.isSymbolicLink() && !SKIP.has(e.name)) { const p = path.join(d, e.name); if (isEmpty(p)) out.push(p); else rec(p); } })(root(a)); return out.join('\n') || 'Nessuna cartella vuota'; },
  },
  'path-info': {
    desc: 'Analizza un percorso: parti, esistenza, tipo, dimensione', usage: '~/Documenti/rel.tar.gz',
    fn: (a, o, io) => { const p = io.text().trim(), abs = path.resolve(p), out = { input: p, absolute: abs, dir: path.dirname(p), base: path.basename(p), name: path.parse(p).name, ext: path.extname(p), exists: fs.existsSync(abs) }; if (out.exists) { const s = fs.statSync(abs); out.type = s.isDirectory() ? 'cartella' : 'file'; out.bytes = s.size; out.modified = s.mtime.toISOString(); } return out; },
  },
  'dir-hash': {
    desc: 'Hash SHA-256 deterministico del contenuto di una cartella', usage: '<cartella>',
    fn: (a, o) => { const d = root(a), h = crypto.createHash('sha256'), files = [...walk(d, !!o.all)].map(f => path.relative(d, f).split(path.sep).join('/')).sort(); for (const f of files) { h.update(f + '\0'); h.update(crypto.createHash('sha256').update(fs.readFileSync(path.join(d, f))).digest()); } return { files: files.length, sha256: h.digest('hex') }; },
  },
  'long-lines': {
    desc: 'Righe più lunghe di N caratteri nei file di testo', usage: '<cartella> [--max=120]',
    fn: (a, o) => { const max = +o.max || 120, out = []; for (const f of walk(root(a))) { const b = fs.readFileSync(f); if (!isText(b)) continue; b.toString('utf8').split(/\r?\n/).forEach((l, i) => { if ([...l].length > max) out.push(`${f}:${i + 1}: ${[...l].length} caratteri`); }); } return out.join('\n') || `Nessuna riga oltre ${max} caratteri`; },
  },
  'trailing-ws': {
    desc: 'Trova (o con --fix rimuove) gli spazi a fine riga', usage: '<cartella> [--fix]',
    fn: (a, o) => { const out = []; let fixed = 0; for (const f of walk(root(a))) { const b = fs.readFileSync(f); if (!isText(b)) continue; const t = b.toString('utf8'); const hits = t.split('\n').map((l, i) => /[ \t]+\r?$/.test(l) ? i + 1 : 0).filter(Boolean); if (!hits.length) continue; out.push(`${f}: righe ${hits.slice(0, 10).join(', ')}${hits.length > 10 ? '…' : ''}`); if (o.fix) { fs.writeFileSync(f, t.replace(/[ \t]+(\r?)$/gm, '$1')); fixed++; } } return out.length ? out.join('\n') + (o.fix ? `\nCorretti ${fixed} file` : '\n(usa --fix per correggere)') : 'Nessuno spazio a fine riga'; },
  },
  'bom-check': {
    desc: 'Rileva il BOM UTF-8/UTF-16 nei file (--fix rimuove il BOM UTF-8)', usage: '<cartella> [--fix]',
    fn: (a, o) => { const out = []; for (const f of walk(root(a))) { const fd = fs.openSync(f, 'r'), b = Buffer.alloc(3), n = fs.readSync(fd, b, 0, 3, 0); fs.closeSync(fd); let k = null; if (n >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) k = 'UTF-8'; else if (n >= 2 && b[0] === 0xFF && b[1] === 0xFE) k = 'UTF-16 LE'; else if (n >= 2 && b[0] === 0xFE && b[1] === 0xFF) k = 'UTF-16 BE'; if (!k) continue; if (o.fix && k === 'UTF-8') { const all = fs.readFileSync(f); fs.writeFileSync(f, all.subarray(3)); out.push(`${f}: BOM ${k} rimosso`); } else out.push(`${f}: BOM ${k}`); } return out.join('\n') || 'Nessun BOM trovato'; },
  },
};
