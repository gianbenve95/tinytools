'use strict';
// Web e grafica leggera: immagini, SVG, CSS, colori, HTML
const fs = require('fs'), path = require('path');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', css: 'text/css', js: 'text/javascript', json: 'application/json', txt: 'text/plain', html: 'text/html', pdf: 'application/pdf', mp3: 'audio/mpeg', mp4: 'video/mp4' };

function imageSize(b) {
  if (b.length >= 24 && b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { format: 'PNG', width: b.readUInt32BE(16), height: b.readUInt32BE(20), bitDepth: b[24], colorType: ['grigi', null, 'RGB', 'palette', 'grigi+alfa', null, 'RGBA'][b[25]] };
  if (b.subarray(0, 3).toString() === 'GIF') return { format: 'GIF', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b[0] === 0xFF && b[1] === 0xD8) { let i = 2; while (i + 9 < b.length) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; if (m === 0xFF) { i++; continue; } if ((m >= 0xC0 && m <= 0xCF) && ![0xC4, 0xC8, 0xCC].includes(m)) return { format: 'JPEG', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), progressive: m === 0xC2 }; if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { i += 2; continue; } i += 2 + b.readUInt16BE(i + 2); } throw new Error('JPEG senza dimensioni'); }
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') { const k = b.subarray(12, 16).toString(); if (k === 'VP8X') return { format: 'WebP', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }; if (k === 'VP8 ') return { format: 'WebP', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }; if (k === 'VP8L') { const v = b.readUInt32LE(21); return { format: 'WebP', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; } }
  if (b.subarray(0, 2).toString() === 'BM' && b.length >= 26) return { format: 'BMP', width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) };
  const t = b.subarray(0, 4096).toString('utf8'); if (/<svg[\s>]/i.test(t)) { const tag = /<svg[^>]*>/i.exec(t)[0], at = n => { const m = new RegExp(`\\b${n}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag); return m && m[1]; }, vb = at('viewBox'); return { format: 'SVG', width: at('width'), height: at('height'), viewBox: vb || undefined }; }
  throw new Error('Formato immagine non riconosciuto');
}
function rgb2hsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l * 100]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, s * 100, l * 100]; }
function hsl2hex(h, s, l) { h = ((h % 360) + 360) % 360; s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return '#' + [f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const hex2rgb = s => { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s).trim()); if (!m) throw new Error('Colore non valido (usa #rgb o #rrggbb): ' + s); let h = m[1]; if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', euro: '€', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù' };

module.exports = {
  'image-info': {
    desc: 'Dimensioni e formato di immagini (PNG, JPEG, GIF, WebP, BMP, SVG) senza librerie', usage: 'foto.png logo.svg ...',
    fn: (a) => { if (!a.length) throw new Error('Indica uno o più file'); return a.map(f => { try { return { file: f, bytes: fs.statSync(f).size, ...imageSize(fs.readFileSync(f)) }; } catch (e) { return { file: f, error: e.code === 'ENOENT' ? 'non trovato' : e.message }; } }); },
  },
  'data-uri': {
    desc: 'File -> data URI base64 (o --decode per leggere una data URI, --out per salvarla)', usage: 'immagine.png | "data:image/png;base64,..." --decode [--out=file]',
    fn: (a, o, io) => {
      if (o.decode) { const m = /^data:([^;,]*)((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(io.text().trim()); if (!m) throw new Error('Data URI non valida'); const buf = m[3] ? Buffer.from(m[4], 'base64') : Buffer.from(decodeURIComponent(m[4])); if (o.out) { fs.writeFileSync(o.out, buf); return `Salvato ${o.out} (${buf.length} byte)`; } return { mime: m[1] || 'text/plain', bytes: buf.length, base64: !!m[3] }; }
      const f = a[0]; if (!f || !fs.existsSync(f)) throw new Error('Indica un file esistente'); const e = path.extname(f).slice(1).toLowerCase(); return `data:${MIME[e] || 'application/octet-stream'};base64,${fs.readFileSync(f).toString('base64')}`;
    },
  },
  'aspect-ratio': {
    desc: 'Rapporto d\'aspetto semplificato e ridimensionamento proporzionale', usage: '1920 1080 [--width=800 | --height=300]',
    fn: (a, o) => { const [w, h] = a.map(Number); if (!(w > 0 && h > 0)) throw new Error('Uso: <larghezza> <altezza>'); const g = gcd(w, h), out = { ratio: `${w / g}:${h / g}`, decimal: +(w / h).toFixed(4) }; if (o.width) out.resized = { width: +o.width, height: Math.round(+o.width * h / w) }; else if (o.height) out.resized = { width: Math.round(+o.height * w / h), height: +o.height }; return out; },
  },
  'placeholder-svg': {
    desc: 'Genera un\'immagine segnaposto SVG (--text --bg --fg)', usage: '300 200 [--text="Anteprima"] [--bg=#dddddd] [--fg=#555555]',
    fn: (a, o) => { const [w, h] = a.map(Number); if (!(w >= 1 && h >= 1 && w <= 10000 && h <= 10000)) throw new Error('Larghezza e altezza tra 1 e 10000'); hex2rgb(o.bg || '#dddddd'); hex2rgb(o.fg || '#555555'); const bg = '#' + (o.bg || '#dddddd').replace('#', ''), fg = '#' + (o.fg || '#555555').replace('#', ''), t = o.text === undefined || o.text === true ? `${w}×${h}` : o.text; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="50%" fill="${fg}" font-family="sans-serif" font-size="${Math.max(10, Math.round(Math.min(w, h) / 8))}" text-anchor="middle" dominant-baseline="middle">${esc(t)}</text></svg>`; },
  },
  'svg-minify': {
    desc: 'Riduce un SVG: commenti, prologo, spazi tra i tag', usage: '--file=logo.svg',
    fn: (a, o, io) => { const t = io.text(); if (!/<svg[\s>]/i.test(t)) throw new Error('Non sembra un SVG'); return t.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').replace(/\s+\/>/g, '/>').trim(); },
  },
  'css-minify': {
    desc: 'Minimizza un CSS (commenti, spazi, ; finali) preservando le stringhe', usage: '--file=style.css',
    fn: (a, o, io) => { const strs = []; let t = io.text().replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, m => { strs.push(m); return `\u0001${strs.length - 1}\u0001`; }); t = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}').replace(/([{;])([-\w]+) :(?=[^{};]*[;}])/g, '$1$2:').trim(); return t.replace(/\u0001(\d+)\u0001/g, (m, i) => strs[+i]); },
  },
  'color-palette': {
    desc: 'Armonie di colore da un colore base (complementare, analoga, triade...)', usage: '"#3498db"',
    fn: (a, o, io) => { const [h, s, l] = rgb2hsl(hex2rgb(io.text())), H = d => hsl2hex(h + d, s, l); return { base: H(0), complementary: [H(180)], analogous: [H(-30), H(30)], triadic: [H(120), H(240)], tetradic: [H(90), H(180), H(270)], splitComplementary: [H(150), H(210)], shades: [90, 70, 50, 30, 10].map(L => hsl2hex(h, s, L)) }; },
  },
  'gradient-css': {
    desc: 'Genera un gradiente CSS (--angle=90, --type=radial)', usage: '#ff0000 #0000ff [#00ff00 ...] [--angle=90] [--type=linear|radial]',
    fn: (a, o) => { if (a.length < 2) throw new Error('Servono almeno due colori'); const c = a.map(x => { hex2rgb(x); return '#' + x.replace('#', '').toLowerCase(); }); const t = o.type || 'linear'; if (!['linear', 'radial'].includes(t)) throw new Error('--type=linear|radial'); const body = t === 'linear' ? `linear-gradient(${o.angle === undefined ? 90 : +o.angle}deg, ${c.join(', ')})` : `radial-gradient(circle, ${c.join(', ')})`; return `background: ${body};`; },
  },
  'html-entities': {
    desc: 'Codifica/decodifica entità HTML (--decode)', usage: '"<b>è</b>" | "&lt;b&gt;&egrave;" --decode',
    fn: (a, o, io) => { const t = io.text().replace(/\n$/, ''); if (o.decode) return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m); return t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  },
  'meta-tags': {
    desc: 'Genera i tag <meta> SEO, Open Graph e Twitter Card', usage: '--title="..." --description="..." [--url=] [--image=] [--site=]',
    fn: (a, o) => { if (!o.title || o.title === true || !o.description || o.description === true) throw new Error('Servono --title e --description'); const L = [`<title>${esc(o.title)}</title>`, `<meta name="description" content="${esc(o.description)}">`], og = (k, v) => v && v !== true && L.push(`<meta property="og:${k}" content="${esc(v)}">`); if (o.url) L.push(`<link rel="canonical" href="${esc(o.url)}">`); og('title', o.title); og('description', o.description); og('type', 'website'); og('url', o.url); og('image', o.image); og('site_name', o.site); L.push(`<meta name="twitter:card" content="${o.image ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${esc(o.title)}">`, `<meta name="twitter:description" content="${esc(o.description)}">`); if (o.image) L.push(`<meta name="twitter:image" content="${esc(o.image)}">`); const warn = []; if (String(o.title).length > 60) warn.push('Titolo oltre 60 caratteri'); if (String(o.description).length > 160) warn.push('Descrizione oltre 160 caratteri'); return L.join('\n') + (warn.length ? '\n<!-- ' + warn.join('; ') + ' -->' : ''); },
  },
};
