'use strict';
// Date e calendario (aritmetica in UTC su date YYYY-MM-DD)
const DAY = 864e5;
const NAMES = { it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const MONTHS = { it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
const pd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim()); if (!m) throw new Error('Data non valida (usa AAAA-MM-GG): ' + s); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (d.getUTCMonth() !== +m[2] - 1) throw new Error('Data inesistente: ' + s); return d; };
const iso = d => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const lang = o => { if (o.lang && !NAMES[o.lang]) throw new Error('--lang=it|en'); return o.lang || 'it'; };
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function addMonths(d, n) { const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate(), last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(day, last))); }
function isoWeek(d) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y = t.getUTCFullYear(); return { year: y, week: Math.ceil(((t - Date.UTC(y, 0, 1)) / DAY + 1) / 7) }; }
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(Date.UTC(y, mo - 1, da)); }
const year = s => { const y = Number(s); if (!Number.isInteger(y) || y < 1583 || y > 9999) throw new Error('Anno tra 1583 e 9999'); return y; };
function offsetMin(zone, ms) { const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000; }
const fmtOff = m => (m < 0 ? '-' : '+') + String(Math.floor(Math.abs(m) / 60)).padStart(2, '0') + ':' + String(Math.abs(m) % 60).padStart(2, '0');

module.exports = {
  'add-date': {
    desc: 'Somma giorni/settimane/mesi/anni a una data (fine mese gestita)', usage: '2026-01-31 --months=1 [--days=] [--weeks=] [--years=] (valori negativi ammessi)',
    fn: (a, o) => { let d = pd(a[0]); const n = k => (o[k] === undefined ? 0 : Number(o[k])); for (const k of ['days', 'weeks', 'months', 'years']) if (!Number.isInteger(n(k))) throw new Error(`--${k} deve essere intero`); d = addMonths(d, n('months') + 12 * n('years')); return iso(new Date(d.getTime() + (n('days') + 7 * n('weeks')) * DAY)); },
  },
  weekday: { desc: 'Giorno della settimana di una o più date (--lang=it|en)', usage: '2026-03-10 [2026-12-25]', fn: (a, o) => { if (!a.length) throw new Error('Indica una data'); const l = lang(o); return a.map(x => `${x}  ${NAMES[l][pd(x).getUTCDay()]}`).join('\n'); } },
  'week-number': { desc: 'Numero di settimana ISO 8601 di una data', usage: '2026-01-01', fn: (a) => { const w = isoWeek(pd(a[0] || today())); return `${w.year}-W${String(w.week).padStart(2, '0')}`; } },
  age: {
    desc: 'Età esatta da una data di nascita e prossimo compleanno', usage: '1990-05-15 [--on=2026-03-10]',
    fn: (a, o) => {
      const b = pd(a[0]), t = pd(o.on || today()); if (t < b) throw new Error('La data di riferimento è precedente alla nascita');
      let y = t.getUTCFullYear() - b.getUTCFullYear(), m = t.getUTCMonth() - b.getUTCMonth(), d = t.getUTCDate() - b.getUTCDate();
      if (d < 0) { m--; d += new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)).getUTCDate(); } if (m < 0) { y--; m += 12; }
      let nb = addMonths(b, 12 * (t.getUTCFullYear() - b.getUTCFullYear())); if (nb < t) nb = addMonths(b, 12 * (t.getUTCFullYear() - b.getUTCFullYear() + 1));
      return { years: y, months: m, days: d, totalDays: Math.round((t - b) / DAY), nextBirthday: iso(nb), daysToNextBirthday: Math.round((nb - t) / DAY) };
    },
  },
  countdown: { desc: 'Giorni che mancano a una data (negativi se passata)', usage: '2026-12-25 [--from=2026-03-10]', fn: (a, o) => { const n = Math.round((pd(a[0]) - pd(o.from || today())) / DAY); return n === 0 ? 'Oggi' : n > 0 ? `${n} giorni (${Math.floor(n / 7)} settimane e ${n % 7} giorni)` : `${-n} giorni fa`; } },
  'tz-convert': {
    desc: 'Converte un orario tra fusi IANA (tiene conto dell\'ora legale)', usage: '"2026-03-10 09:00" Europe/Rome America/New_York',
    fn: (a) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec((a[0] || '').trim()); if (!m || !a[1] || !a[2]) throw new Error('Uso: "AAAA-MM-GG HH:MM" fuso-da fuso-a');
      try { new Intl.DateTimeFormat('en', { timeZone: a[1] }); new Intl.DateTimeFormat('en', { timeZone: a[2] }); } catch { throw new Error('Fuso orario sconosciuto (usa nomi IANA, es. Europe/Rome)'); }
      const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); let ms = wall - offsetMin(a[1], wall) * 60000; ms = wall - offsetMin(a[1], ms) * 60000;
      const o2 = offsetMin(a[2], ms), loc = new Date(ms + o2 * 60000).toISOString().slice(0, 16).replace('T', ' ');
      return `${loc} ${a[2]} (UTC${fmtOff(o2)})\n${new Date(ms).toISOString()} UTC`;
    },
  },
  calendar: {
    desc: 'Calendario del mese (lunedì primo giorno, --sunday per domenica)', usage: '2026 3 [--sunday] [--lang=it|en]',
    fn: (a, o) => {
      const now = new Date(), y = a[0] ? Number(a[0]) : now.getUTCFullYear(), m = a[1] ? Number(a[1]) : now.getUTCMonth() + 1; if (!Number.isInteger(y) || !(m >= 1 && m <= 12)) throw new Error('Uso: calendar <anno> <mese 1-12>');
      const l = lang(o), first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), off = o.sunday ? first : (first + 6) % 7, days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const heads = (o.sunday ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]).map(i => NAMES[l][i].slice(0, 2).replace(/^./, c => c.toUpperCase())), title = `${MONTHS[l][m - 1]} ${y}`;
      const lines = [title.padStart(Math.floor((20 + title.length) / 2)), heads.join(' ')]; let row = Array(off).fill('  ');
      for (let d = 1; d <= days; d++) { row.push(String(d).padStart(2)); if (row.length === 7) { lines.push(row.join(' ')); row = []; } } if (row.length) lines.push(row.join(' ')); return lines.join('\n');
    },
  },
  'leap-year': { desc: 'Anno bisestile? (e il prossimo bisestile)', usage: '2024', fn: (a) => { const y = Number(a[0]); if (!Number.isInteger(y)) throw new Error('Serve un anno intero'); let n = y + 1; while (!isLeap(n)) n++; return { year: y, leap: isLeap(y), nextLeapYear: n }; } },
  easter: { desc: 'Data della Pasqua (calendario gregoriano) per un anno', usage: '2026', fn: (a) => { const e = easter(year(a[0])); return { easter: iso(e), easterMonday: iso(new Date(e.getTime() + DAY)) }; } },
  'holidays-it': {
    desc: 'Festività nazionali italiane di un anno (con Pasqua e Pasquetta)', usage: '2026',
    fn: (a) => { const y = year(a[0] || new Date().getUTCFullYear()), e = easter(y), pq = new Date(e.getTime() + DAY), f = (m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return [[f(1, 1), 'Capodanno'], [f(1, 6), 'Epifania'], [iso(e), 'Pasqua'], [iso(pq), "Lunedì dell'Angelo (Pasquetta)"], [f(4, 25), 'Festa della Liberazione'], [f(5, 1), 'Festa del Lavoro'], [f(6, 2), 'Festa della Repubblica'], [f(8, 15), 'Assunzione (Ferragosto)'], [f(11, 1), 'Ognissanti'], [f(12, 8), 'Immacolata Concezione'], [f(12, 25), 'Natale'], [f(12, 26), 'Santo Stefano']].map(([d, n]) => `${d}  ${NAMES.it[pd(d).getUTCDay()].padEnd(10)} ${n}`).join('\n'); },
  },
};
