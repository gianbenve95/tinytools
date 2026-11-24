'use strict';
// Calcoli pratici di tutti i giorni
const r = (n, d = 2) => +n.toFixed(d);
const need = (v, name) => { if (v === undefined || v === true || v === '') throw new Error('Manca ' + name); return v; };
const pos = (v, name) => { const n = Number(v); if (!(n > 0) || !isFinite(n)) throw new Error(`${name} deve essere un numero positivo`); return n; };
const SZ = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
const bytesOf = s => { const m = /^(\d+(?:[.,]\d+)?)\s*([kmgt]?i?b)$/i.exec(String(s).trim()); if (!m || !SZ[m[2].toLowerCase()]) throw new Error('Dimensione non valida (es. 4.7GB, 700MiB): ' + s); return parseFloat(m[1].replace(',', '.')) * SZ[m[2].toLowerCase()]; };
const bitsPerSec = s => { const m = /^(\d+(?:[.,]\d+)?)\s*(k|m|g)?(bps|b\/s|bit\/s|B\/s|MB\/s|kB\/s|GB\/s)$/.exec(String(s).trim()); const t = String(s).trim(); let x; if ((x = /^(\d+(?:[.,]\d+)?)\s*([kKmMgG]?)(bps|bit\/s)$/i.exec(t))) return parseFloat(x[1].replace(',', '.')) * { '': 1, k: 1e3, m: 1e6, g: 1e9 }[x[2].toLowerCase()]; if ((x = /^(\d+(?:[.,]\d+)?)\s*([kKmMgG])B\/s$/.exec(t))) return parseFloat(x[1].replace(',', '.')) * 8 * { k: 1e3, m: 1e6, g: 1e9 }[x[2].toLowerCase()]; throw new Error('Velocità non valida (es. 100Mbps, 12.5MB/s): ' + s); };
const dur = s => { const t = String(s).trim(); if (/^\d+(\.\d+)?$/.test(t)) return +t; const re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)/g; let m, tot = 0, used = 0; const mul = { d: 86400, h: 3600, m: 60, s: 1 }; while ((m = re.exec(t))) { tot += +m[1] * mul[m[2]]; used += m[0].length; } if (!used || t.replace(/(\d+(?:\.\d+)?)\s*(d|h|m|s)|\s/g, '')) throw new Error('Durata non valida (es. 2h30m): ' + s); return tot; };
const hms = sec => { sec = Math.round(sec); const p = []; for (const [u, n] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) { const q = Math.floor(sec / n); if (q || (u === 's' && !p.length)) p.push(q + u); sec %= n; } return p.join(' '); };
const fmtSize = b => { const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = b; while (v >= 1000 && i < 4) { v /= 1000; i++; } return r(v) + ' ' + u[i]; };
const fmtBin = b => { const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']; let i = 0, v = b; while (v >= 1024 && i < 4) { v /= 1024; i++; } return r(v) + ' ' + u[i]; };
const clock = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const parseClock = t => { const p = String(t).split(':').map(Number); if (p.some(x => isNaN(x) || x < 0) || p.length < 2 || p.length > 3) throw new Error('Tempo non valido (mm:ss o h:mm:ss): ' + t); return p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2]; };
const RACES = { '5k': 5, '10k': 10, half: 21.0975, marathon: 42.195 };
const ML = { ml: 1, l: 1000, cl: 10, dl: 100, tsp: 5, tbsp: 15, cup: 240, floz: 29.5735, pint: 473.176 };
const DENS = { flour: 120, sugar: 200, 'brown-sugar': 213, butter: 227, honey: 340, milk: 245, water: 240, oil: 218, rice: 185, oats: 90, cocoa: 85, salt: 288 }; // grammi per tazza (240 ml)
function offsetMin(zone, ms) { const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000; }

module.exports = {
  'download-time': {
    desc: 'Tempo di download di un file data la velocità (es. 4.7GB a 100Mbps)', usage: '4.7GB 100Mbps',
    fn: (a) => { const b = bytesOf(need(a[0], 'la dimensione')), bps = bitsPerSec(need(a[1], 'la velocità')), s = b * 8 / bps; return { size: fmtSize(b), speed: r(bps / 1e6, 3) + ' Mbit/s (' + r(bps / 8e6, 3) + ' MB/s)', time: hms(s), seconds: r(s, 1) }; },
  },
  'bitrate-size': {
    desc: 'Dimensione di un video/audio dato bitrate e durata (es. 5Mbps per 2h)', usage: '5Mbps 2h30m',
    fn: (a) => { const bps = bitsPerSec(need(a[0], 'il bitrate')), s = dur(need(a[1], 'la durata')), b = bps * s / 8; return { duration: hms(s), size: fmtSize(b), sizeBinary: fmtBin(b), bytes: Math.round(b) }; },
  },
  'power-cost': {
    desc: 'Costo dell\'energia di un apparecchio: watt, ore, prezzo €/kWh (--days per la stima mensile)', usage: '1500W 3h --price=0.28 [--days=30]',
    fn: (a, o) => { const m = /^(\d+(?:\.\d+)?)\s*(k?W)$/i.exec(String(a[0] || '').trim()); if (!m) throw new Error('Potenza non valida (es. 1500W o 1.5kW)'); const w = parseFloat(m[1]) * (/k/i.test(m[2]) ? 1000 : 1), h = dur(need(a[1], 'le ore')) / 3600, price = pos(need(o.price, '--price (€/kWh)'), '--price'), kwh = w * h / 1000, out = { kWh: r(kwh, 3), cost: r(kwh * price) }; if (o.days) out.estimateForDays = { days: +o.days, kWh: r(kwh * +o.days, 3), cost: r(kwh * price * +o.days) }; return out; },
  },
  'fuel-economy': {
    desc: 'Consumi: L/100km <-> km/l <-> mpg (US e UK) (--from=l100|kml|mpgus|mpguk)', usage: '6.5 [--from=l100]',
    fn: (a, o) => { const v = pos(need(a[0], 'il valore'), 'Il valore'), from = o.from || 'l100'; const l100 = { l100: v, kml: 100 / v, mpgus: 235.215 / v, mpguk: 282.481 / v }[from]; if (!l100) throw new Error('--from=l100|kml|mpgus|mpguk'); return { 'L/100km': r(l100), 'km/l': r(100 / l100), 'mpg (US)': r(235.215 / l100), 'mpg (UK)': r(282.481 / l100) }; },
  },
  pace: {
    desc: 'Passo di corsa: min/km <-> km/h, o da gara e tempo (+ previsioni Riegel)', usage: '5:30 | --speed=12 | --race=10k --time=50:00',
    fn: (a, o) => {
      let secPerKm; if (o.race) { const d = RACES[o.race] || pos(o.race, '--race'); secPerKm = parseClock(need(o.time, '--time')) / d; } else if (o.speed) secPerKm = 3600 / pos(o.speed, '--speed'); else secPerKm = parseClock(need(a[0], 'il passo mm:ss'));
      const out = { pacePerKm: clock(secPerKm), pacePerMile: clock(secPerKm * 1.609344), speedKmh: r(3600 / secPerKm) };
      if (o.race) { const d0 = RACES[o.race] || +o.race, t0 = secPerKm * d0; out.riegelPredictions = Object.fromEntries(Object.entries(RACES).filter(([, d]) => d !== d0).map(([k, d]) => [k, clock(t0 * (d / d0) ** 1.06)])); }
      return out;
    },
  },
  vat: {
    desc: 'IVA: aggiunta al netto o scorporo dal lordo (--included), aliquota con --rate (default 22)', usage: '100 [--rate=22] [--included]',
    fn: (a, o) => { const amt = Number(need(a[0], "l'importo")); if (!isFinite(amt)) throw new Error('Importo non valido'); const rate = o.rate === undefined ? 22 : Number(o.rate); if (!(rate >= 0 && rate <= 100)) throw new Error('--rate tra 0 e 100'); if (o.included) { const net = amt / (1 + rate / 100); return { net: r(net), vat: r(amt - net), gross: r(amt), rate }; } return { net: r(amt), vat: r(amt * rate / 100), gross: r(amt * (1 + rate / 100)), rate }; },
  },
  discount: {
    desc: 'Sconti successivi in percentuale: prezzo finale e sconto totale equivalente', usage: '100 20 10   (20% poi 10%)',
    fn: (a) => { const p = pos(need(a[0], 'il prezzo'), 'Il prezzo'), ds = a.slice(1).map(Number); if (!ds.length || ds.some(d => !(d >= 0 && d <= 100))) throw new Error('Indica una o più percentuali di sconto tra 0 e 100'); const fin = ds.reduce((x, d) => x * (1 - d / 100), p); return { finalPrice: r(fin), saved: r(p - fin), totalDiscountPercent: r((1 - fin / p) * 100, 2) }; },
  },
  'cooking-convert': {
    desc: 'Conversioni di cucina: volumi (tazza, cucchiaio...) e grammi per ingredienti comuni', usage: '2 cup flour g | 100 g sugar cup | 3 tbsp ml',
    fn: (a) => {
      const [v, from, x, y] = [Number(a[0]), (a[1] || '').toLowerCase(), (a[2] || '').toLowerCase(), (a[3] || '').toLowerCase()]; if (!isFinite(v)) throw new Error('Uso: <valore> <da> [ingrediente] <a>');
      const toU = y || x, ing = y ? x : null; if (!toU) throw new Error('Indica l\'unità di arrivo');
      const mlOf = (n, u) => (u === 'g' ? (ing && DENS[ing] ? n / DENS[ing] * 240 : NaN) : n * ML[u]), fromMl = (ml, u) => (u === 'g' ? (ing && DENS[ing] ? ml / 240 * DENS[ing] : NaN) : ml / ML[u]);
      if (!(from === 'g' || ML[from]) || !(toU === 'g' || ML[toU])) throw new Error('Unità ammesse: g, ' + Object.keys(ML).join(', ')); if ((from === 'g' || toU === 'g') && !(ing in DENS)) throw new Error('Per i grammi serve un ingrediente: ' + Object.keys(DENS).join(', '));
      return String(r(fromMl(mlOf(v, from), toU), 2));
    },
  },
  bmi: {
    desc: 'Indice di massa corporea da peso (kg) e altezza (cm) con classificazione OMS (solo informativo)', usage: '70 175',
    fn: (a) => { const kg = pos(need(a[0], 'il peso in kg'), 'Il peso'), cm = pos(need(a[1], "l'altezza in cm"), "L'altezza"); if (cm < 50 || cm > 250) throw new Error('Altezza in cm tra 50 e 250'); const b = kg / (cm / 100) ** 2; const c = b < 16 ? 'sottopeso grave' : b < 18.5 ? 'sottopeso' : b < 25 ? 'normopeso' : b < 30 ? 'sovrappeso' : b < 35 ? 'obesità di I grado' : b < 40 ? 'obesità di II grado' : 'obesità di III grado'; return { bmi: r(b), category: c, healthyWeightRangeKg: [r(18.5 * (cm / 100) ** 2, 1), r(24.9 * (cm / 100) ** 2, 1)], note: 'Indicatore statistico per adulti: non è una diagnosi.' }; },
  },
  'meeting-planner': {
    desc: 'Orari di riunione compatibili tra più fusi (--date, --from=9 --to=18 ore lavorative locali)', usage: 'Europe/Rome America/New_York Asia/Tokyo [--date=2026-03-10] [--from=9] [--to=18]',
    fn: (a, o) => {
      if (a.length < 2) throw new Error('Indica almeno due fusi IANA'); for (const z of a) { try { new Intl.DateTimeFormat('en', { timeZone: z }); } catch { throw new Error('Fuso sconosciuto: ' + z); } }
      const date = o.date && o.date !== true ? o.date : new Date().toISOString().slice(0, 10), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); if (!m) throw new Error('--date AAAA-MM-GG'); const from = o.from === undefined ? 9 : +o.from, to = o.to === undefined ? 18 : +o.to; if (!(from >= 0 && to <= 24 && from < to)) throw new Error('--from e --to ore valide');
      const base = Date.UTC(+m[1], +m[2] - 1, +m[3]), ok = [];
      for (let h = 0; h < 24; h++) { const t = base + h * 3600000, locals = a.map(z => { const L = new Date(t + offsetMin(z, t) * 60000); return { z, day: L.toISOString().slice(0, 10), hour: L.getUTCHours() }; }); if (locals.every(l => l.hour >= from && l.hour < to)) ok.push({ utc: String(h).padStart(2, '0') + ':00', local: Object.fromEntries(locals.map(l => [l.z, String(l.hour).padStart(2, '0') + ':00' + (l.day !== date ? ` (${l.day})` : '')])) }); }
      return ok.length ? { date, workingHours: `${from}-${to}`, slots: ok } : { date, slots: [], note: 'Nessuna fascia comune nelle ore lavorative indicate: prova ad allargare --from/--to.' };
    },
  },
};
