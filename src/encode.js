'use strict';
// Codifica, hash e piccole utilità di sicurezza (tutte locali, nessuna rete)
const crypto = require('crypto'), fs = require('fs');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) {
  s = s.replace(/[\s=-]/g, '').toUpperCase(); let bits = '';
  for (const c of s) { const v = B32.indexOf(c); if (v < 0) throw new Error('Segreto base32 non valido'); bits += v.toString(2).padStart(5, '0'); }
  const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out);
}
function totp(secret, { time = Date.now() / 1000, digits = 6, period = 30, algo = 'sha1' } = {}) {
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(time / period)));
  const h = crypto.createHmac(algo, b32decode(secret)).update(ctr).digest(), off = h[h.length - 1] & 15;
  const code = ((h[off] & 0x7f) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 10 ** digits;
  return String(code).padStart(digits, '0');
}
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const dataBuf = (a, o, io) => (o.file ? fs.readFileSync(o.file) : Buffer.from(io.text(), 'utf8'));

module.exports = {
  b64: {
    desc: 'Base64 encode/decode (--decode, --url)', usage: '"testo" [--decode] [--url]',
    fn: (a, o, io) => {
      const t = io.text().replace(/\n$/, '');
      if (o.decode) return fromB64u(t.trim()).toString('utf8');
      return o.url ? b64u(t) : Buffer.from(t).toString('base64');
    },
  },
  hash: {
    desc: 'Hash di testo o file (md5, sha1, sha256, sha512)', usage: '"testo" | --file=x [--algo=sha256]',
    fn: (a, o, io) => { const algo = o.algo || 'sha256'; if (!crypto.getHashes().includes(algo)) throw new Error('Algoritmo non supportato: ' + algo); return crypto.createHash(algo).update(dataBuf(a, o, io)).digest('hex'); },
  },
  uuid: {
    desc: 'Genera UUID v4 o v7 (--v=7, --count=5)', usage: '[--v=4|7] [--count=1]',
    fn: (a, o) => {
      const v = +o.v || 4; if (![4, 7].includes(v)) throw new Error('Versioni supportate: 4, 7');
      return Array.from({ length: +o.count || 1 }, () => {
        const b = crypto.randomBytes(16);
        if (v === 7) { b.writeUIntBE(Date.now(), 0, 6); b[6] = b[6] & 0x0f | 0x70; } else b[6] = b[6] & 0x0f | 0x40;
        b[8] = b[8] & 0x3f | 0x80; const h = b.toString('hex');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
      }).join('\n');
    },
  },
  'password-gen': {
    desc: 'Password casuali sicure con stima dell\'entropia', usage: '[--length=20] [--no-symbols] [--no-ambiguous]',
    fn: (a, o) => {
      const len = +o.length || 20; if (len < 4 || len > 256) throw new Error('Lunghezza tra 4 e 256');
      let sets = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789']; if (!o['no-symbols']) sets.push('!@#$%^&*()-_=+[]{};:,.?');
      if (o['no-ambiguous']) sets = sets.map(s => s.replace(/[O0Il1o]/g, ''));
      const all = sets.join(''), pw = sets.map(s => s[crypto.randomInt(s.length)]);
      while (pw.length < len) pw.push(all[crypto.randomInt(all.length)]);
      for (let i = pw.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pw[i], pw[j]] = [pw[j], pw[i]]; }
      return `${pw.join('')}\nentropia ~${Math.floor(len * Math.log2(all.length))} bit`;
    },
  },
  'jwt-decode': {
    desc: 'Decodifica un JWT (SENZA verificare la firma) e mostra la scadenza', usage: '<token>',
    fn: (a, o, io) => {
      const p = io.text().trim().split('.'); if (p.length !== 3) throw new Error('Un JWT ha 3 parti separate da punti');
      let header, payload; try { header = JSON.parse(fromB64u(p[0])); payload = JSON.parse(fromB64u(p[1])); } catch { throw new Error('Token non decodificabile'); }
      const out = { header, payload, signatureVerified: false };
      const now = o.now ? +o.now : Math.floor(Date.now() / 1000);
      for (const k of ['exp', 'iat', 'nbf']) if (typeof payload[k] === 'number') out[k + 'Iso'] = new Date(payload[k] * 1000).toISOString();
      if (typeof payload.exp === 'number') out.expired = payload.exp < now;
      return out;
    },
  },
  'url-parse': {
    desc: 'Scompone un URL in parti e parametri', usage: '"https://host/path?a=1"',
    fn: (a, o, io) => {
      let u; try { u = new URL(io.text().trim()); } catch { throw new Error('URL non valido'); }
      const q = {}; for (const [k, v] of u.searchParams) q[k] = k in q ? [].concat(q[k], v) : v;
      return { protocol: u.protocol, username: u.username, host: u.hostname, port: u.port, path: u.pathname, query: q, hash: u.hash, origin: u.origin };
    },
  },
  hexdump: {
    desc: 'Dump esadecimale stile hexdump -C', usage: '"testo" | --file=x',
    fn: (a, o, io) => {
      const b = dataBuf(a, o, io), lines = [];
      for (let i = 0; i < b.length; i += 16) {
        const c = b.subarray(i, i + 16), hex = [...c].map(x => x.toString(16).padStart(2, '0'));
        const h = hex.slice(0, 8).join(' ').padEnd(23) + '  ' + hex.slice(8).join(' ').padEnd(23);
        lines.push(`${i.toString(16).padStart(8, '0')}  ${h}  |${[...c].map(x => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}|`);
      }
      lines.push(b.length.toString(16).padStart(8, '0')); return lines.join('\n');
    },
  },
  totp: {
    desc: 'Codice TOTP (RFC 6238) da un segreto base32', usage: '<SEGRETO_BASE32> [--digits=6] [--period=30] [--time=epoch]',
    fn: (a, o, io) => totp(io.text().trim(), { digits: +o.digits || 6, period: +o.period || 30, algo: o.algo || 'sha1', time: o.time ? +o.time : undefined }),
  },
  entropy: {
    desc: 'Entropia di Shannon di un testo (bit per carattere e totale)', usage: '"testo"',
    fn: (a, o, io) => {
      const t = [...io.text().replace(/\n$/, '')]; if (!t.length) return { bitsPerChar: 0, totalBits: 0, length: 0 };
      const f = {}; for (const c of t) f[c] = (f[c] || 0) + 1;
      const h = -Object.values(f).reduce((s, n) => s + (n / t.length) * Math.log2(n / t.length), 0);
      return { length: t.length, uniqueChars: Object.keys(f).length, bitsPerChar: +h.toFixed(4), totalBits: +(h * t.length).toFixed(2) };
    },
  },
};
