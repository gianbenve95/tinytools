'use strict';
// Validatori di codici e documenti (solo controlli formali/checksum, nessuna verifica online)
const IBAN_LEN = { AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22 };
const mod97 = s => { let r = 0; for (const c of s) r = (r * (/\d/.test(c) ? 10 : 100) + (/\d/.test(c) ? +c : c.charCodeAt(0) - 55)) % 97; return r; };
const ODD = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
const cfCheck = s => { let t = 0; [...s.slice(0, 15)].forEach((c, i) => { t += i % 2 === 0 ? ODD[c] : /\d/.test(c) ? +c : c.charCodeAt(0) - 65; }); return String.fromCharCode(65 + t % 26); };
const OMO = 'LMNPQRSTUV', MONTHS = 'ABCDEHLMPRST';
const luhnOk = d => { let s = 0; [...d].reverse().forEach((c, i) => { let n = +c; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; }); return s % 10 === 0; };
const luhnCheckDigit = d => { for (let c = 0; c < 10; c++) if (luhnOk(d + c)) return c; };
const ean13 = d => { const n = d.slice(0, -1); let s = 0; [...n].reverse().forEach((c, i) => { s += +c * (i % 2 === 0 ? 3 : 1); }); return (10 - s % 10) % 10; };
const COMMON = new Set(['password', '123456', '12345678', 'qwerty', 'abc123', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'football', 'password1', '111111', '123123', 'ciao', 'ciaociao', 'juventus', 'inter', 'milan', 'napoli', 'roma', 'italia', 'qwertyuiop', 'passw0rd', 'changeme', 'master', 'sunshine', 'princess', 'trustno1']);

module.exports = {
  'iban-validate': {
    desc: 'Valida un IBAN (lunghezza per paese e checksum mod 97)', usage: 'IT60X0542811101000000123456',
    fn: (a, o, io) => { const s = io.text().replace(/\s/g, '').toUpperCase(), p = []; if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) p.push('formato non valido'); else { const cc = s.slice(0, 2); if (IBAN_LEN[cc] && s.length !== IBAN_LEN[cc]) p.push(`lunghezza ${s.length} invece di ${IBAN_LEN[cc]} per ${cc}`); if (!IBAN_LEN[cc]) p.push(`paese ${cc} non nella tabella (controllo solo checksum)`); if (mod97(s.slice(4) + s.slice(0, 4)) !== 1) p.push('checksum errato'); } const out = { valid: !p.some(x => !/non nella tabella/.test(x)), problems: p }; if (out.valid) { out.country = s.slice(0, 2); out.checkDigits = s.slice(2, 4); out.formatted = s.match(/.{1,4}/g).join(' '); if (s.startsWith('IT')) out.italy = { cin: s[4], abi: s.slice(5, 10), cab: s.slice(10, 15), account: s.slice(15) }; } return out; },
  },
  'codice-fiscale': {
    desc: 'Verifica il carattere di controllo di un codice fiscale e ne legge data di nascita e sesso', usage: 'RSSMRA85T10A562S [--today=2026-03-10]',
    fn: (a, o, io) => {
      const cf = io.text().replace(/\s/g, '').toUpperCase(); if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return { valid: false, problems: ['formato non valido (16 caratteri nel formato standard)'] };
      const dg = i => { const c = cf[i]; return OMO.includes(c) ? OMO.indexOf(c) : +c; }, ok = cfCheck(cf) === cf[15], yy = dg(6) * 10 + dg(7), day = dg(9) * 10 + dg(10), female = day > 40, d = female ? day - 40 : day, m = MONTHS.indexOf(cf[8]) + 1, today = o.today ? new Date(o.today) : new Date(), cur = today.getUTCFullYear() % 100, year = yy > cur ? 1900 + yy : 2000 + yy;
      const dim = new Date(Date.UTC(year, m, 0)).getUTCDate(), problems = []; if (!ok) problems.push('carattere di controllo errato'); if (d < 1 || d > dim) problems.push('giorno di nascita impossibile per il mese');
      return { valid: !problems.length, problems, sex: female ? 'F' : 'M', birthDate: problems.length ? undefined : `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, birthPlaceCode: cf.slice(11, 15), homocodia: /[LMNPQRSTUV]/.test(cf.slice(6, 8) + cf.slice(9, 11) + cf.slice(12, 15)), note: 'Il secolo è dedotto (cifre dell\'anno a 2 cifre); il codice catastale non è risolto in nome del comune.' };
    },
  },
  'partita-iva': {
    desc: 'Verifica la cifra di controllo di una partita IVA italiana (11 cifre)', usage: '12345678903',
    fn: (a, o, io) => { const s = io.text().replace(/\s|^IT/gi, ''); if (!/^\d{11}$/.test(s)) return { valid: false, problems: ['servono 11 cifre'] }; let t = 0; [...s.slice(0, 10)].forEach((c, i) => { let n = +c; if (i % 2) { n *= 2; if (n > 9) n -= 9; } t += n; }); const check = (10 - t % 10) % 10, ok = check === +s[10]; return { valid: ok, problems: ok ? [] : [`cifra di controllo attesa ${check}`] }; },
  },
  luhn: {
    desc: 'Algoritmo di Luhn: valida un numero di carta (e ne riconosce il circuito) o calcola la cifra finale (--complete)', usage: '4111111111111111 | 411111111111111 --complete',
    fn: (a, o, io) => { const d = io.text().replace(/[\s-]/g, ''); if (!/^\d{2,}$/.test(d)) throw new Error('Servono solo cifre'); if (o.complete) return { checkDigit: luhnCheckDigit(d), full: d + luhnCheckDigit(d) }; const brand = /^4/.test(d) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(d) ? 'Mastercard' : /^3[47]/.test(d) ? 'American Express' : /^6(011|5)/.test(d) ? 'Discover' : /^3(0[0-5]|[68])/.test(d) ? 'Diners Club' : /^35/.test(d) ? 'JCB' : 'sconosciuto'; return { validLuhn: luhnOk(d), length: d.length, brand }; },
  },
  isbn: {
    desc: 'Valida ISBN-10/ISBN-13 e converte il 10 in 13', usage: '0306406152 | 9780306406157',
    fn: (a, o, io) => { const s = io.text().replace(/[\s-]/g, '').toUpperCase(); if (/^\d{9}[\dX]$/.test(s)) { const sum = [...s].reduce((t, c, i) => t + (c === 'X' ? 10 : +c) * (10 - i), 0); const ok = sum % 11 === 0; const b = '978' + s.slice(0, 9); return { type: 'ISBN-10', valid: ok, isbn13: ok ? b + ean13(b + '0') : undefined }; } if (/^97[89]\d{10}$/.test(s)) return { type: 'ISBN-13', valid: ean13(s) === +s[12] }; throw new Error('Servono 10 o 13 caratteri (13 che iniziano con 978/979)'); },
  },
  ean: {
    desc: 'Valida EAN-13/EAN-8/UPC-A o calcola la cifra di controllo (--complete)', usage: '4006381333931 | 400638133393 --complete',
    fn: (a, o, io) => { const d = io.text().replace(/\s/g, ''); if (!/^\d+$/.test(d)) throw new Error('Servono solo cifre'); if (o.complete) { if (![7, 11, 12].includes(d.length)) throw new Error('Per --complete servono 7, 11 o 12 cifre'); const c = ean13(d.padStart(12, '0') + '0'); return { checkDigit: c, full: d + c }; } if (![8, 12, 13].includes(d.length)) throw new Error('Lunghezze ammesse: 8, 12, 13'); return { type: { 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13' }[d.length], valid: ean13(d.padStart(13, '0')) === +d.slice(-1) }; },
  },
  'uuid-validate': {
    desc: 'Valida un UUID e ne indica versione e variante', usage: '550e8400-e29b-41d4-a716-446655440000',
    fn: (a, o, io) => { const s = io.text().trim().toLowerCase(); if (s === '00000000-0000-0000-0000-000000000000') return { valid: true, nil: true }; const m = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-([0-9a-f])[0-9a-f]{3}-[0-9a-f]{12}$/.exec(s); if (!m) return { valid: false }; const v = parseInt(m[2], 16); return { valid: true, version: +m[1], variant: v >= 8 && v <= 11 ? 'RFC 4122/9562' : v < 8 ? 'NCS (riservata)' : 'Microsoft/futura' }; },
  },
  'bic-validate': {
    desc: 'Controllo formale di un codice BIC/SWIFT (8 o 11 caratteri)', usage: 'DEUTDEFF500',
    fn: (a, o, io) => { const s = io.text().replace(/\s/g, '').toUpperCase(), m = /^([A-Z]{4})([A-Z]{2})([A-Z0-9]{2})([A-Z0-9]{3})?$/.exec(s); return m ? { valid: true, bank: m[1], country: m[2], location: m[3], branch: m[4] || 'XXX (sede principale)' } : { valid: false, problems: ['formato atteso: 4 lettere banca + 2 paese + 2 località + 3 filiale opzionali'] }; },
  },
  'phone-it': {
    desc: 'Normalizza un numero di telefono italiano in formato E.164 e ne indica il tipo', usage: '"347 123 4567" | "+39 06 1234 5678"',
    fn: (a, o, io) => { let s = io.text().replace(/[\s.\-()]/g, ''); s = s.replace(/^(\+|00)39/, ''); if (!/^\d+$/.test(s)) return { valid: false, problems: ['caratteri non validi'] }; let type; if (/^3\d{8,9}$/.test(s)) type = 'cellulare'; else if (/^0\d{5,10}$/.test(s)) type = 'fisso'; else if (/^80[03]\d{6}$/.test(s)) type = 'numero verde'; else if (/^89\d{4,8}$/.test(s)) type = 'servizi a sovrapprezzo'; else return { valid: false, problems: ['non corrisponde a un formato italiano noto'] }; return { valid: true, type, e164: '+39' + s, national: s }; },
  },
  'password-strength': {
    desc: 'Valuta una password: entropia stimata, schemi deboli e tempo di attacco offline (stime)', usage: '"la-mia-password" (il testo resta sul tuo computer)',
    fn: (a, o, io) => {
      const pw = io.text().replace(/\n$/, ''), issues = []; if (!pw) throw new Error('Password vuota');
      let pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 32; let bits = pw.length * Math.log2(pool || 1);
      if (COMMON.has(pw.toLowerCase())) { issues.push('è tra le password più comuni'); bits = Math.min(bits, 10); }
      if (/^(.)\1+$/.test(pw)) { issues.push('un solo carattere ripetuto'); bits = Math.min(bits, 8); } else if (/(.)\1{2,}/.test(pw)) { issues.push('ripetizioni di caratteri'); bits -= 6; }
      if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|wert|erty|asdf|zxcv)/i.test(pw)) { issues.push('sequenza prevedibile'); bits -= 10; }
      if (/^\d+$/.test(pw)) issues.push('solo cifre'); if (pw.length < 12) issues.push('meno di 12 caratteri'); if (/^(19|20)\d{2}$/.test(pw)) { issues.push('sembra un anno'); bits = Math.min(bits, 7); }
      bits = Math.max(0, Math.round(bits)); const score = bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4, secs = 2 ** bits / 1e10 / 2, t = secs < 1 ? 'meno di un secondo' : secs < 3600 ? Math.round(secs / 60 + 0.5) + ' minuti circa' : secs < 86400 * 365 ? Math.round(secs / 86400) + ' giorni circa' : secs < 86400 * 365 * 1e6 ? Math.round(secs / 86400 / 365) + ' anni circa' : 'oltre un milione di anni';
      return { score, label: ['molto debole', 'debole', 'discreta', 'buona', 'forte'][score], estimatedEntropyBits: bits, offlineCrackTime: t, issues, note: 'Stima indicativa (10 miliardi di tentativi/s); non sostituisce un password manager.' };
    },
  },
};
