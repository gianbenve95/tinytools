'use strict';
// Codifiche e primitive crittografiche di uso quotidiano (Node crypto, nessuna dipendenza)
const crypto = require('crypto'), fs = require('fs');
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const data = (o, io) => (o.file && o.file !== true ? fs.readFileSync(o.file) : Buffer.from(io.text().replace(/\n$/, ''), 'utf8'));
function b32enc(buf, pad = true) { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return pad ? out + '='.repeat((8 - out.length % 8) % 8) : out; }
function b32dec(s) { s = s.replace(/[\s=]/g, '').toUpperCase(); let bits = ''; for (const c of s) { const v = B32.indexOf(c); if (v < 0) throw new Error('Carattere base32 non valido: ' + c); bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function b58enc(buf) { let n = BigInt('0x' + (buf.toString('hex') || '0')), s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b) break; s = '1' + s; } return s; }
function b58dec(s) { let n = 0n; for (const c of s) { const v = B58.indexOf(c); if (v < 0) throw new Error('Carattere base58 non valido: ' + c); n = n * 58n + BigInt(v); } let h = n.toString(16); if (h.length % 2) h = '0' + h; const body = n === 0n ? Buffer.alloc(0) : Buffer.from(h, 'hex'); let z = 0; for (const c of s) { if (c !== '1') break; z++; } return Buffer.concat([Buffer.alloc(z), body]); }
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const adler32 = buf => { let a = 1, b = 0; for (const x of buf) { a = (a + x) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; };
function ulid(ms = Date.now()) { let t = '', n = ms; for (let i = 0; i < 10; i++) { t = CROCK[n % 32] + t; n = Math.floor(n / 32); } let r = ''; for (let i = 0; i < 16; i++) r += CROCK[crypto.randomInt(32)]; return t + r; }
const ulidTime = u => { let n = 0; for (const c of u.slice(0, 10)) { const v = CROCK.indexOf(c); if (v < 0) throw new Error('ULID non valido'); n = n * 32 + v; } return n; };

module.exports = {
  hmac: {
    desc: 'HMAC di un testo o file (--key o --key-file, --algo=sha256)', usage: '"messaggio" --key=segreto [--algo=sha256|sha1|sha512] [--format=hex|base64]',
    fn: (a, o, io) => { const key = o['key-file'] && o['key-file'] !== true ? fs.readFileSync(o['key-file']) : o.key !== undefined && o.key !== true ? Buffer.from(o.key) : null; if (!key) throw new Error('Serve --key (o --key-file per non lasciarla nella cronologia della shell)'); const algo = o.algo || 'sha256'; if (!crypto.getHashes().includes(algo)) throw new Error('Algoritmo non supportato: ' + algo); return crypto.createHmac(algo, key).update(data(o, io)).digest(o.format === 'base64' ? 'base64' : 'hex'); },
  },
  'random-bytes': {
    desc: 'Byte casuali crittograficamente sicuri (--n=16, --format=hex|base64|base64url)', usage: '[--n=16] [--format=hex]',
    fn: (a, o) => { const n = o.n === undefined ? 16 : +o.n; if (!(Number.isInteger(n) && n >= 1 && n <= 4096)) throw new Error('--n tra 1 e 4096'); const f = o.format || 'hex'; if (!['hex', 'base64', 'base64url'].includes(f)) throw new Error('--format=hex|base64|base64url'); return crypto.randomBytes(n).toString(f); },
  },
  base32: { desc: 'Base32 RFC 4648: codifica/decodifica (--decode, --no-pad)', usage: '"foobar" | MZXW6YTBOI==== --decode', fn: (a, o, io) => { const t = io.text().replace(/\n$/, ''); return o.decode ? b32dec(t).toString('utf8') : b32enc(Buffer.from(t), !o['no-pad']); } },
  base58: { desc: 'Base58 (alfabeto Bitcoin): codifica/decodifica (--decode)', usage: '"Hello World!" | 2NEpo7TZRRrLZSi2U --decode', fn: (a, o, io) => { const t = io.text().replace(/\n$/, ''); return o.decode ? b58dec(t).toString('utf8') : b58enc(Buffer.from(t)); } },
  hex: { desc: 'Testo <-> esadecimale (--decode, --sep=" ")', usage: '"ciao" | 6369616f --decode', fn: (a, o, io) => { const t = io.text().replace(/\n$/, ''); if (o.decode) { const h = t.replace(/[\s:,-]|0x/g, ''); if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new Error('Esadecimale non valido (numero pari di cifre 0-9a-f)'); return Buffer.from(h, 'hex').toString('utf8'); } const h = Buffer.from(t).toString('hex'); return o.sep === undefined ? h : h.match(/../g).join(o.sep === true ? ' ' : o.sep); } },
  'binary-text': { desc: 'Testo <-> binario a gruppi di 8 bit (--decode)', usage: '"Hi" | "01001000 01101001" --decode', fn: (a, o, io) => { const t = io.text().replace(/\n$/, ''); if (o.decode) { const g = t.replace(/\s+/g, ''); if (!/^[01]+$/.test(g) || g.length % 8) throw new Error('Servono gruppi di 8 bit (0 e 1)'); return Buffer.from(g.match(/.{8}/g).map(x => parseInt(x, 2))).toString('utf8'); } return [...Buffer.from(t)].map(b => b.toString(2).padStart(8, '0')).join(' '); } },
  crc32: { desc: 'Checksum CRC-32 (o --algo=adler32) di un testo o file', usage: '"testo" | --file=x [--algo=adler32]', fn: (a, o, io) => { const b = data(o, io), algo = o.algo || 'crc32'; if (!['crc32', 'adler32'].includes(algo)) throw new Error('--algo=crc32|adler32'); const v = algo === 'crc32' ? crc32(b) : adler32(b); return { algorithm: algo, hex: v.toString(16).padStart(8, '0'), decimal: v }; } },
  ulid: {
    desc: 'Genera ULID ordinabili per tempo (--count) o ne decodifica la data (--decode)', usage: '[--count=1] | 01ARZ3NDEKTSV4RRFFQ69G5FAV --decode',
    fn: (a, o, io) => { if (o.decode) { const u = io.text().trim().toUpperCase(); if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(u)) throw new Error('ULID non valido (26 caratteri Crockford base32)'); const ms = ulidTime(u); return { timestampMs: ms, iso: new Date(ms).toISOString() }; } const n = o.count === undefined ? 1 : +o.count; if (!(Number.isInteger(n) && n >= 1 && n <= 1000)) throw new Error('--count tra 1 e 1000'); return Array.from({ length: n }, () => ulid()).join('\n'); },
  },
  nanoid: {
    desc: 'ID casuali URL-safe stile nanoid (--size=21, --alphabet, --count)', usage: '[--size=21] [--count=1] [--alphabet=abc123]',
    fn: (a, o) => { const size = o.size === undefined ? 21 : +o.size, count = o.count === undefined ? 1 : +o.count, al = o.alphabet && o.alphabet !== true ? [...o.alphabet] : [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-']; if (!(Number.isInteger(size) && size >= 1 && size <= 256) || !(Number.isInteger(count) && count >= 1 && count <= 1000)) throw new Error('--size 1-256, --count 1-1000'); if (al.length < 2 || al.length > 256 || new Set(al).size !== al.length) throw new Error('--alphabet: da 2 a 256 caratteri distinti'); return Array.from({ length: count }, () => Array.from({ length: size }, () => al[crypto.randomInt(al.length)]).join('')).join('\n'); },
  },
  'otp-uri': {
    desc: 'Costruisce l\'URI otpauth:// (per QR code di app 2FA) da segreto base32, account ed emittente', usage: '<SEGRETO_BASE32> --account=nome@esempio.it --issuer=MioSito [--digits=6] [--period=30]',
    fn: (a, o, io) => { const secret = io.text().trim().replace(/[\s=-]/g, '').toUpperCase(); if (!/^[A-Z2-7]{16,}$/.test(secret)) throw new Error('Segreto base32 non valido (almeno 16 caratteri A-Z, 2-7)'); if (!o.account || o.account === true) throw new Error('Serve --account'); const iss = o.issuer && o.issuer !== true ? o.issuer : '', label = encodeURIComponent((iss ? iss + ':' : '') + o.account); const q = new URLSearchParams({ secret }); if (iss) q.set('issuer', iss); if (o.digits) { if (![6, 7, 8].includes(+o.digits)) throw new Error('--digits=6|7|8'); q.set('digits', String(+o.digits)); } if (o.period) { if (!(+o.period > 0)) throw new Error('--period deve essere > 0'); q.set('period', String(+o.period)); } return `otpauth://totp/${label}?${q.toString().replace(/\+/g, '%20')}`; },
  },
};
