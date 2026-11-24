'use strict';
// Matematica e finanza di base
const nums = (a, io, min = 1) => { const t = a.length ? a.join(' ') : io.text(); const v = t.split(/[\s,;]+/).filter(Boolean).map(Number); if (v.length < min || v.some(x => !isFinite(x))) throw new Error(`Servono almeno ${min} numeri validi`); return v; };
const r = (n, d = 2) => +n.toFixed(d);
const gcd = (x, y) => { x = Math.abs(x); y = Math.abs(y); while (y) [x, y] = [y, x % y]; return x; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const fact = n => { let x = 1n; for (let i = 2n; i <= BigInt(n); i++) x *= i; return x; };
const int = (s, name, max = Infinity) => { const n = Number(s); if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${name} deve essere un intero tra 0 e ${max}`); return n; };

module.exports = {
  primes: {
    desc: 'Primalità e fattorizzazione di un intero, o elenco fino a N (--upto)', usage: '360 | --upto=50',
    fn: (a, o) => {
      if (o.upto) { const n = int(o.upto, '--upto', 1e7), s = new Uint8Array(n + 1), out = []; for (let i = 2; i <= n; i++) { if (!s[i]) { out.push(i); for (let j = i * i; j <= n; j += i) s[j] = 1; } } return out.join(' '); }
      let n = int(a[0], 'Il numero', 1e12), f = {}; const orig = n; if (n < 2) return { n: orig, prime: false, factors: {} };
      for (let p = 2; p * p <= n; p += p === 2 ? 1 : 2) while (n % p === 0) { f[p] = (f[p] || 0) + 1; n /= p; } if (n > 1) f[n] = (f[n] || 0) + 1;
      return { n: orig, prime: Object.keys(f).length === 1 && Object.values(f)[0] === 1, factors: f, expression: Object.entries(f).map(([p, e]) => e > 1 ? `${p}^${e}` : p).join(' x ') };
    },
  },
  'gcd-lcm': {
    desc: 'Massimo comun divisore e minimo comune multiplo', usage: '12 18 30',
    fn: (a, o, io) => { const v = nums(a, io, 2); if (v.some(x => !Number.isInteger(x) || x === 0)) throw new Error('Servono interi diversi da zero'); const g = v.reduce(gcd), l = v.reduce((x, y) => Math.abs(x * y) / gcd(x, y)); if (!Number.isSafeInteger(l)) throw new Error('mcm troppo grande'); return { gcd: g, lcm: l }; },
  },
  fibonacci: {
    desc: 'Sequenza di Fibonacci (--n=10) o N-esimo termine (--nth=100, BigInt)', usage: '--n=10 | --nth=100',
    fn: (a, o) => {
      if (o.nth !== undefined) { const n = int(o.nth, '--nth', 100000); let x = 0n, y = 1n; for (let i = 0; i < n; i++) [x, y] = [y, x + y]; return x.toString(); }
      const n = int(o.n || 10, '--n', 1000); const out = []; let x = 0n, y = 1n; for (let i = 0; i < n; i++) { out.push(x); [x, y] = [y, x + y]; } return out.join(' ');
    },
  },
  stats: {
    desc: 'Statistiche di una lista di numeri (media, mediana, moda, deviazione)', usage: '2 4 4 4 5 5 7 9',
    fn: (a, o, io) => {
      const v = nums(a, io), n = v.length, sum = v.reduce((x, y) => x + y, 0), mean = sum / n, s = [...v].sort((x, y) => x - y), med = n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
      const cnt = {}; v.forEach(x => cnt[x] = (cnt[x] || 0) + 1); const mx = Math.max(...Object.values(cnt)), mode = mx > 1 ? Object.keys(cnt).filter(k => cnt[k] === mx).map(Number) : [];
      const ss = v.reduce((x, y) => x + (y - mean) ** 2, 0);
      return { count: n, sum: r(sum, 6), mean: r(mean, 6), median: med, mode, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], populationStdDev: r(Math.sqrt(ss / n), 6), sampleStdDev: n > 1 ? r(Math.sqrt(ss / (n - 1)), 6) : null };
    },
  },
  percent: {
    desc: 'Percentuali: of (X% di Y), is (X è che % di Y), change (variazione)', usage: 'of 20 150 | is 30 150 | change 100 125',
    fn: (a) => {
      const [c, x, y] = [a[0], Number(a[1]), Number(a[2])]; if (!isFinite(x) || !isFinite(y)) throw new Error('Servono due numeri');
      if (c === 'of') return String(r(x / 100 * y, 6)); if (c === 'is') { if (y === 0) throw new Error('Divisione per zero'); return r(x / y * 100, 4) + '%'; }
      if (c === 'change') { if (x === 0) throw new Error('Il valore iniziale non può essere 0'); const p = (y - x) / Math.abs(x) * 100; return (p > 0 ? '+' : '') + r(p, 4) + '%'; }
      throw new Error('Sottocomandi: of, is, change');
    },
  },
  'compound-interest': {
    desc: 'Interesse composto con versamenti mensili opzionali', usage: '<capitale> <tasso%annuo> <anni> [--n=12] [--contrib=100]',
    fn: (a, o) => {
      const [P, rate, yrs] = a.map(Number); if (![P, rate, yrs].every(isFinite) || P < 0 || yrs < 0) throw new Error('Uso: <capitale> <tasso%> <anni>');
      const n = +o.n || 12, i = rate / 100 / n, N = n * yrs, c = +o.contrib || 0; let fv = i === 0 ? P : P * (1 + i) ** N;
      if (c) { if (n !== 12) throw new Error('--contrib richiede --n=12 (versamenti mensili)'); fv += i === 0 ? c * N : c * ((1 + i) ** N - 1) / i; }
      const paid = P + c * (c ? N : 0); return { finalAmount: r(fv), totalContributed: r(paid), interestEarned: r(fv - paid) };
    },
  },
  'loan-payment': {
    desc: 'Rata mensile di un mutuo/prestito, totale e interessi (--schedule=N righe)', usage: '<importo> <tasso%annuo> <anni> [--schedule=3]',
    fn: (a, o) => {
      const [P, rate, yrs] = a.map(Number); if (![P, rate, yrs].every(isFinite) || P <= 0 || yrs <= 0 || rate < 0) throw new Error('Uso: <importo> <tasso%> <anni>');
      const i = rate / 1200, N = Math.round(yrs * 12), pay = i === 0 ? P / N : P * i / (1 - (1 + i) ** -N), out = { monthlyPayment: r(pay), totalPaid: r(pay * N), totalInterest: r(pay * N - P), payments: N };
      if (o.schedule) { let bal = P; out.schedule = []; for (let k = 1; k <= Math.min(+o.schedule, N); k++) { const int_ = bal * i, pr = pay - int_; bal -= pr; out.schedule.push({ month: k, interest: r(int_), principal: r(pr), balance: r(Math.max(bal, 0)) }); } }
      return out;
    },
  },
  'bill-split': {
    desc: 'Divide un conto tra persone con mancia opzionale', usage: '<totale> <persone> [--tip=10]',
    fn: (a, o) => { const [t, n] = a.map(Number); if (!(t >= 0) || !(Number.isInteger(n) && n > 0)) throw new Error('Uso: <totale> <persone>'); const tip = +o.tip || 0, tot = t * (1 + tip / 100); return { total: r(tot), tip: r(tot - t), perPerson: r(tot / n) }; },
  },
  dice: {
    desc: 'Tira dadi in notazione NdM+K (es. 3d6+2), con --seed per ripetibilità', usage: '3d6+2 [--seed=1]',
    fn: (a, o) => {
      const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec((a[0] || '').trim()); if (!m) throw new Error('Formato: NdM+K, es. 2d6 o d20-1');
      const n = +(m[1] || 1), s = +m[2], k = +(m[3] || 0); if (n < 1 || n > 1000 || s < 2 || s > 1000) throw new Error('Dadi 1-1000, facce 2-1000');
      const R = rng(o.seed ? +o.seed : Date.now() ^ (Math.random() * 1e9)), rolls = Array.from({ length: n }, () => 1 + Math.floor(R() * s));
      return { rolls, modifier: k, total: rolls.reduce((x, y) => x + y, 0) + k, min: n + k, max: n * s + k, average: r(n * (s + 1) / 2 + k) };
    },
  },
  combinatorics: {
    desc: 'Fattoriale, combinazioni nCr e permutazioni nPr (BigInt)', usage: '<n> [<r>]',
    fn: (a) => { const n = int(a[0], 'n', 1000); if (a[1] === undefined) return { 'n!': fact(n).toString() }; const k = int(a[1], 'r', 1000); if (k > n) throw new Error('r deve essere <= n'); return { 'n!': fact(n).toString(), nPr: (fact(n) / fact(n - k)).toString(), nCr: (fact(n) / (fact(k) * fact(n - k))).toString() }; },
  },
};
