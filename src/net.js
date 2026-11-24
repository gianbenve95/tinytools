'use strict';
// Rete offline: indirizzi, subnet, nomi (nessuna richiesta di rete)
const net = require('net'), url = require('url');

const v4int = s => { if (net.isIPv4(s) !== true && !net.isIPv4(s)) throw new Error('IPv4 non valido: ' + s); return s.split('.').reduce((x, p) => x * 256 + +p, 0); };
const intv4 = n => [24, 16, 8, 0].map(sh => Math.floor(n / 2 ** sh) % 256).join('.');
function parseCidr(s) {
  const m = /^(.+)\/(\d{1,2})$/.exec(String(s).trim()); if (!m) throw new Error('Usa la notazione CIDR, es. 192.168.1.0/24'); const p = +m[2]; if (p > 32) throw new Error('Prefisso tra 0 e 32'); return { ip: v4int(m[1]), prefix: p };
}
const maskOf = p => (p === 0 ? 0 : (2 ** 32 - 2 ** (32 - p)));
function expand6(s) {
  let [h, t] = s.split('::'); const hp = h ? h.split(':') : [], tp = t !== undefined && t ? t.split(':') : [];
  if (s.includes('.')) { const last = (tp.length ? tp : hp).pop(), n = v4int(last); (tp.length || t !== undefined ? tp : hp).push(Math.floor(n / 65536).toString(16), (n % 65536).toString(16)); }
  const fill = s.includes('::') ? Array(8 - hp.length - tp.length).fill('0') : []; return [...hp, ...fill, ...tp].map(x => x.padStart(4, '0')).join(':');
}
const PORTS = { 20: 'ftp-data', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns', 67: 'dhcp-server', 68: 'dhcp-client', 69: 'tftp', 80: 'http', 110: 'pop3', 123: 'ntp', 135: 'msrpc', 137: 'netbios-ns', 139: 'netbios-ssn', 143: 'imap', 161: 'snmp', 389: 'ldap', 443: 'https', 445: 'smb', 465: 'smtps', 514: 'syslog', 587: 'smtp-submission', 636: 'ldaps', 993: 'imaps', 995: 'pop3s', 1433: 'mssql', 1521: 'oracle', 2049: 'nfs', 3000: 'dev-server', 3306: 'mysql', 3389: 'rdp', 5000: 'flask/upnp', 5432: 'postgresql', 5672: 'amqp', 5900: 'vnc', 6379: 'redis', 8000: 'http-alt', 8080: 'http-proxy', 8443: 'https-alt', 9000: 'php-fpm/sonarqube', 9092: 'kafka', 9200: 'elasticsearch', 11211: 'memcached', 27017: 'mongodb' };

module.exports = {
  'ip-info': {
    desc: 'Classifica un indirizzo IPv4/IPv6 (privato, loopback, pubblico...)', usage: '192.168.1.10 | ::1',
    fn: (a, o, io) => {
      const s = io.text().trim(), v = net.isIP(s); if (!v) throw new Error('Indirizzo IP non valido');
      if (v === 4) { const n = v4int(s), inR = (b, p) => Math.floor(n / 2 ** (32 - p)) === Math.floor(v4int(b) / 2 ** (32 - p)); const kind = inR('127.0.0.0', 8) ? 'loopback' : inR('10.0.0.0', 8) || inR('172.16.0.0', 12) || inR('192.168.0.0', 16) ? 'privato (RFC 1918)' : inR('169.254.0.0', 16) ? 'link-local' : inR('100.64.0.0', 10) ? 'CGNAT (100.64/10)' : inR('224.0.0.0', 4) ? 'multicast' : inR('240.0.0.0', 4) ? 'riservato' : inR('0.0.0.0', 8) ? 'non specificato' : 'pubblico'; return { version: 4, address: s, integer: n, hex: '0x' + n.toString(16).padStart(8, '0'), kind }; }
      const x = expand6(s.toLowerCase()), f = parseInt(x.slice(0, 4), 16), kind = x === '0000:0000:0000:0000:0000:0000:0000:0001' ? 'loopback' : x === '0000:0000:0000:0000:0000:0000:0000:0000' ? 'non specificato' : (f & 0xffc0) === 0xfe80 ? 'link-local' : (f & 0xfe00) === 0xfc00 ? 'unique local (privato)' : (f & 0xff00) === 0xff00 ? 'multicast' : 'pubblico/globale'; return { version: 6, address: s, expanded: x, kind };
    },
  },
  cidr: {
    desc: 'Calcola rete, broadcast, maschera e host di un CIDR IPv4', usage: '192.168.1.0/24',
    fn: (a, o, io) => { const { ip, prefix } = parseCidr(io.text()), mask = maskOf(prefix), net_ = ip - (ip % 2 ** (32 - prefix)), size = 2 ** (32 - prefix), bc = net_ + size - 1, usable = prefix >= 31 ? size : size - 2; return { network: intv4(net_), broadcast: intv4(bc), netmask: intv4(mask), wildcard: intv4(2 ** 32 - 1 - mask), firstHost: intv4(prefix >= 31 ? net_ : net_ + 1), lastHost: intv4(prefix >= 31 ? bc : bc - 1), totalAddresses: size, usableHosts: usable, prefix }; },
  },
  'ip-to-int': {
    desc: 'IPv4 <-> intero (e esadecimale)', usage: '192.168.1.1 | 3232235777',
    fn: (a, o, io) => { const s = io.text().trim(); if (/^\d+$/.test(s)) { const n = +s; if (n > 2 ** 32 - 1) throw new Error('Oltre 2^32-1'); return intv4(n); } const n = v4int(s); return { integer: n, hex: '0x' + n.toString(16).padStart(8, '0') }; },
  },
  'subnet-split': {
    desc: 'Divide un CIDR in sottoreti più piccole (--prefix=26)', usage: '10.0.0.0/24 --prefix=26',
    fn: (a, o, io) => { const { ip, prefix } = parseCidr(io.text()), np = +o.prefix; if (!(np > prefix && np <= 32)) throw new Error('--prefix deve essere maggiore di ' + prefix + ' e al massimo 32'); const count = 2 ** (np - prefix); if (count > 1024) throw new Error('Troppe sottoreti (max 1024)'); const base = ip - (ip % 2 ** (32 - prefix)), step = 2 ** (32 - np); return Array.from({ length: count }, (_, i) => `${intv4(base + i * step)}/${np}`).join('\n'); },
  },
  'mac-format': {
    desc: 'Normalizza un indirizzo MAC (due punti, trattini, Cisco, compatto)', usage: 'aa-bb-cc-dd-ee-ff',
    fn: (a, o, io) => { const h = io.text().trim().replace(/[:\-.\s]/g, '').toLowerCase(); if (!/^[0-9a-f]{12}$/.test(h)) throw new Error('MAC non valido (servono 12 cifre esadecimali)'); const b = parseInt(h.slice(0, 2), 16); return { colon: h.match(/../g).join(':'), dash: h.match(/../g).join('-'), cisco: h.match(/..../g).join('.'), plain: h, oui: h.slice(0, 6), multicast: !!(b & 1), locallyAdministered: !!(b & 2) }; },
  },
  punycode: { desc: 'Nomi di dominio internazionali: Unicode <-> punycode (xn--)', usage: 'münchen.de | xn--mnchen-3ya.de', fn: (a, o, io) => { const s = io.text().trim(); const r = /xn--/.test(s) ? url.domainToUnicode(s) : url.domainToASCII(s); if (!r) throw new Error('Dominio non valido'); return r; } },
  'hostname-check': {
    desc: 'Verifica un hostname secondo RFC 1123 e elenca i problemi', usage: 'esempio.com',
    fn: (a, o, io) => { const h = io.text().trim().replace(/\.$/, ''), p = []; if (!h) p.push('vuoto'); if (h.length > 253) p.push('più di 253 caratteri'); for (const l of h.split('.')) { if (!l) p.push('etichetta vuota (punti doppi?)'); else { if (l.length > 63) p.push(`etichetta "${l.slice(0, 10)}…" oltre 63 caratteri`); if (!/^[a-z0-9-]+$/i.test(l)) p.push(`caratteri non ammessi in "${l}"`); if (/^-|-$/.test(l)) p.push(`"${l}" inizia o finisce con trattino`); } } return { hostname: h, valid: p.length === 0, problems: p }; },
  },
  'email-validate': {
    desc: 'Controllo sintattico di un indirizzo email (non verifica che esista)', usage: 'nome@esempio.it',
    fn: (a, o, io) => { const e = io.text().trim(), p = [], at = e.lastIndexOf('@'); if (at < 1) p.push('manca la parte locale o la @'); else { const l = e.slice(0, at), d = e.slice(at + 1); if (l.length > 64) p.push('parte locale oltre 64 caratteri'); if (e.length > 254) p.push('oltre 254 caratteri'); if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(l) || /^\.|\.$|\.\./.test(l)) p.push('parte locale non valida'); if (!/^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(d)) p.push('dominio non valido'); } return { email: e, validSyntax: p.length === 0, problems: p }; },
  },
  'port-lookup': {
    desc: 'Porte comuni: da numero a servizio e viceversa', usage: '443 | postgresql',
    fn: (a, o, io) => { const t = io.text().trim().toLowerCase(); if (/^\d+$/.test(t)) { if (!PORTS[t]) throw new Error('Porta non nella tabella: ' + t); return `${t}/${PORTS[t]}`; } const hits = Object.entries(PORTS).filter(([, n]) => n.includes(t)); if (!hits.length) throw new Error('Servizio non trovato: ' + t); return hits.map(([p, n]) => `${p}/${n}`).join('\n'); },
  },
  'url-encode': {
    desc: 'Codifica/decodifica percent-encoding (--decode, --full per URL interi)', usage: '"a b&c" [--decode] [--full]',
    fn: (a, o, io) => { const t = io.text().replace(/\n$/, ''); try { return o.decode ? (o.full ? decodeURI(t) : decodeURIComponent(t)) : (o.full ? encodeURI(t) : encodeURIComponent(t)); } catch { throw new Error('Sequenza percent non valida'); } },
  },
};
