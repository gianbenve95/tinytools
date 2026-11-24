'use strict';
// Informazioni sul sistema locale (sola lettura)
const os = require('os'), fs = require('fs'), path = require('path');
const human = n => { const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return +n.toFixed(i ? 1 : 0) + ' ' + u[i]; };
const SENSITIVE = /(key|token|secret|pass|pwd|credential|auth|private|cookie|session)/i;
function offsetMin(zone, ms) { const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000; }
const fmtOff = m => (m < 0 ? '-' : '+') + String(Math.floor(Math.abs(m) / 60)).padStart(2, '0') + ':' + String(Math.abs(m) % 60).padStart(2, '0');
const pathDirs = () => (process.env.PATH || '').split(path.delimiter);
const isExe = f => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch { return false; } };

module.exports = {
  'sys-info': {
    desc: 'Sistema operativo, architettura, memoria, CPU e versione di Node', usage: '',
    fn: () => ({ platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version, cpuCores: os.cpus().length, totalMemory: human(os.totalmem()), freeMemory: human(os.freemem()), endianness: os.endianness() }),
  },
  'env-list': {
    desc: 'Variabili d\'ambiente con i valori sensibili mascherati (--filter=PATH, --show per svelarli)', usage: '[--filter=testo] [--show]',
    fn: (a, o) => { const f = o.filter && o.filter !== true ? String(o.filter).toLowerCase() : ''; return Object.keys(process.env).sort().filter(k => !f || k.toLowerCase().includes(f)).map(k => `${k}=${SENSITIVE.test(k) && !o.show ? '••••••••' : process.env[k]}`).join('\n') || 'Nessuna variabile corrispondente'; },
  },
  'path-doctor': {
    desc: 'Controlla il PATH: cartelle inesistenti, duplicati, voci relative', usage: '',
    fn: () => { const d = pathDirs(), seen = new Set(), p = []; d.forEach((x, i) => { if (!x) p.push(`#${i + 1}: voce vuota (equivale alla cartella corrente: rischioso)`); else if (!path.isAbsolute(x)) p.push(`#${i + 1}: percorso relativo "${x}"`); else if (!fs.existsSync(x)) p.push(`#${i + 1}: non esiste ${x}`); else if (!fs.statSync(x).isDirectory()) p.push(`#${i + 1}: non è una cartella ${x}`); if (x && seen.has(x)) p.push(`#${i + 1}: duplicato ${x}`); seen.add(x); }); return { entries: d.length, problems: p }; },
  },
  'which-all': {
    desc: 'Tutte le posizioni di un comando nel PATH (come which -a)', usage: 'node',
    fn: (a, o, io) => { const c = io.text().trim(); if (!c || c.includes('/')) throw new Error('Indica il nome di un comando'); const hits = [...new Set(pathDirs().filter(Boolean).map(d => path.join(d, c)).filter(isExe))]; if (!hits.length) throw new Error('Comando non trovato nel PATH: ' + c); return hits.join('\n'); },
  },
  'disk-free': {
    desc: 'Spazio totale, usato e libero di un volume', usage: '[percorso]',
    fn: (a) => { if (typeof fs.statfsSync !== 'function') throw new Error('Serve Node 18.15 o superiore'); const p = a[0] || '.'; if (!fs.existsSync(p)) throw new Error('Percorso non trovato: ' + p); const s = fs.statfsSync(p), total = s.blocks * s.bsize, free = s.bavail * s.bsize; return { path: path.resolve(p), total: human(total), used: human(total - free), free: human(free), usedPercent: +((total - free) / total * 100).toFixed(1) }; },
  },
  uptime: {
    desc: 'Da quanto tempo è acceso il sistema (--seconds=N per formattare un valore)', usage: '[--seconds=93784]',
    fn: (a, o) => { let s = Math.floor(o.seconds !== undefined ? +o.seconds : os.uptime()); if (!(s >= 0)) throw new Error('--seconds deve essere >= 0'); const p = []; for (const [u, n] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) { const q = Math.floor(s / n); if (q || (u === 's' && !p.length)) p.push(q + u); s %= n; } return p.join(' '); },
  },
  'cpu-info': { desc: 'Modello e core della CPU e carico medio (1/5/15 min)', usage: '', fn: () => { const c = os.cpus(); return { model: c[0] ? c[0].model : 'sconosciuto', cores: c.length, loadAverage: os.loadavg().map(x => +x.toFixed(2)) }; } },
  'local-ips': {
    desc: 'Indirizzi IP delle interfacce di rete locali (--all include loopback e IPv6)', usage: '[--all]',
    fn: (a, o) => { const out = []; for (const [n, l] of Object.entries(os.networkInterfaces())) for (const i of l || []) { if (!o.all && (i.internal || i.family !== 'IPv4')) continue; out.push(`${n}  ${i.address}${i.family === 'IPv6' ? ' (IPv6)' : ''}${i.internal ? ' (loopback)' : ''}`); } return out.join('\n') || 'Nessuna interfaccia di rete attiva'; },
  },
  'timezone-info': {
    desc: 'Fuso orario, scostamento da UTC e ora legale (--tz=Europe/Rome --at=ISO)', usage: '[--tz=Europe/Rome] [--at=2026-07-01T00:00:00Z]',
    fn: (a, o) => { const tz = o.tz && o.tz !== true ? o.tz : Intl.DateTimeFormat().resolvedOptions().timeZone; try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error('Fuso orario sconosciuto: ' + tz); } const at = o.at ? new Date(o.at) : new Date(); if (isNaN(at)) throw new Error('--at non è una data valida'); const y = at.getUTCFullYear(), jan = offsetMin(tz, Date.UTC(y, 0, 1)), jul = offsetMin(tz, Date.UTC(y, 6, 1)), off = offsetMin(tz, at.getTime()); return { timeZone: tz, atUtc: at.toISOString(), utcOffset: fmtOff(off), daylightSavingActive: jan !== jul && off === Math.max(jan, jul), usesDaylightSaving: jan !== jul, localTime: new Intl.DateTimeFormat('sv-SE', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' }).format(at) }; },
  },
  'locale-info': {
    desc: 'Come una lingua formatta numeri, valute e date (--locale=it-IT)', usage: '[--locale=it-IT] [--currency=EUR]',
    fn: (a, o) => { const loc = o.locale && o.locale !== true ? o.locale : Intl.DateTimeFormat().resolvedOptions().locale, cur = o.currency && o.currency !== true ? o.currency : 'EUR'; let nf; try { nf = Intl.getCanonicalLocales(loc)[0]; } catch { throw new Error('Locale non valido: ' + loc); } const d = new Date(Date.UTC(2026, 2, 9, 15, 30)); return { locale: nf, number: new Intl.NumberFormat(nf).format(1234567.891), currency: new Intl.NumberFormat(nf, { style: 'currency', currency: cur }).format(1234567.891), percent: new Intl.NumberFormat(nf, { style: 'percent' }).format(0.256), dateLong: new Intl.DateTimeFormat(nf, { dateStyle: 'full', timeZone: 'UTC' }).format(d), dateShort: new Intl.DateTimeFormat(nf, { dateStyle: 'short', timeZone: 'UTC' }).format(d), firstWeekday: (() => { try { const w = new Intl.Locale(nf).weekInfo || new Intl.Locale(nf).getWeekInfo(); return ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'][w.firstDay]; } catch { return undefined; } })() }; },
  },
};
