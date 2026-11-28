'use strict';
// Strumenti curiosi e utili, più qualche easter egg nascosto (hidden: non compaiono in "tt list")
const crypto = require('crypto');
const rng = o => { if (o.seed !== undefined && o.seed !== true) { let a = (parseInt(o.seed, 10) || 0) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; } return () => crypto.randomInt(0, 2 ** 32) / 4294967296; };
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
const num = (v, d, min, max, name) => { const n = v === undefined ? d : +v; if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} deve essere un intero tra ${min} e ${max}`); return n; };

const FONT = { // 5 righe per carattere
  A: ['  #  ', ' # # ', '#####', '#   #', '#   #'], B: ['#### ', '#   #', '#### ', '#   #', '#### '], C: [' ####', '#    ', '#    ', '#    ', ' ####'], D: ['#### ', '#   #', '#   #', '#   #', '#### '], E: ['#####', '#    ', '#### ', '#    ', '#####'], F: ['#####', '#    ', '#### ', '#    ', '#    '],
  G: [' ####', '#    ', '#  ##', '#   #', ' ####'], H: ['#   #', '#   #', '#####', '#   #', '#   #'], I: ['#####', '  #  ', '  #  ', '  #  ', '#####'], J: ['  ###', '   # ', '   # ', '#  # ', ' ##  '], K: ['#   #', '#  # ', '###  ', '#  # ', '#   #'], L: ['#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '#   #', '#   #'], N: ['#   #', '##  #', '# # #', '#  ##', '#   #'], O: [' ### ', '#   #', '#   #', '#   #', ' ### '], P: ['#### ', '#   #', '#### ', '#    ', '#    '], Q: [' ### ', '#   #', '# # #', '#  # ', ' ## #'], R: ['#### ', '#   #', '#### ', '#  # ', '#   #'],
  S: [' ####', '#    ', ' ### ', '    #', '#### '], T: ['#####', '  #  ', '  #  ', '  #  ', '  #  '], U: ['#   #', '#   #', '#   #', '#   #', ' ### '], V: ['#   #', '#   #', '#   #', ' # # ', '  #  '], W: ['#   #', '#   #', '# # #', '## ##', '#   #'], X: ['#   #', ' # # ', '  #  ', ' # # ', '#   #'],
  Y: ['#   #', ' # # ', '  #  ', '  #  ', '  #  '], Z: ['#####', '   # ', '  #  ', ' #   ', '#####'],
  0: [' ### ', '#  ##', '# # #', '##  #', ' ### '], 1: ['  #  ', ' ##  ', '  #  ', '  #  ', ' ### '], 2: [' ### ', '#   #', '  ## ', ' #   ', '#####'], 3: ['#### ', '    #', ' ### ', '    #', '#### '], 4: ['#   #', '#   #', '#####', '    #', '    #'],
  5: ['#####', '#    ', '#### ', '    #', '#### '], 6: [' ### ', '#    ', '#### ', '#   #', ' ### '], 7: ['#####', '    #', '   # ', '  #  ', '  #  '], 8: [' ### ', '#   #', ' ### ', '#   #', ' ### '], 9: [' ### ', '#   #', ' ####', '    #', ' ### '],
  ' ': ['     ', '     ', '     ', '     ', '     '], '!': ['  #  ', '  #  ', '  #  ', '     ', '  #  '], '?': [' ### ', '#   #', '  ## ', '     ', '  #  '], '.': ['     ', '     ', '     ', '     ', '  #  '], '-': ['     ', '     ', '#####', '     ', '     '],
};
const PROVERBI = ['Chi va piano va sano e va lontano.', 'Meglio tardi che mai.', 'Chi dorme non piglia pesci.', 'Il buongiorno si vede dal mattino.', 'Una rondine non fa primavera.', 'Chi trova un amico trova un tesoro.', 'Non è bello ciò che è bello, ma è bello ciò che piace.', 'Il lupo perde il pelo ma non il vizio.', 'Rome non fu fatta in un giorno.'.replace('Rome', 'Roma'), 'Chi ben comincia è a metà dell\'opera.', 'Impara l\'arte e mettila da parte.', 'Tra il dire e il fare c\'è di mezzo il mare.', 'Le cose belle arrivano a chi sa aspettare.', 'Ogni limite ha una pazienza.', 'Prima il dovere, poi il piacere.', 'Chi si fa pecora il lupo se lo mangia.', 'A caval donato non si guarda in bocca.', 'L\'ottimo è nemico del bene.', 'Dopo la tempesta torna il sereno.', 'Fidarsi è bene, non fidarsi è meglio.'];
const OTTO = ['Sì, senza dubbio.', 'Tutto indica di sì.', 'È probabile.', 'Puoi contarci.', 'Le premesse sono buone.', 'Chiedi di nuovo più tardi.', 'Meglio non dirtelo ora.', 'Non riesco a prevederlo.', 'Concentrati e richiedi.', 'Non contarci.', 'La mia risposta è no.', 'Le fonti dicono di no.', 'Molto dubbio.'];
const PAROLE = 'albero amico anello arancia argento aurora bacio barca bosco brezza cactus caffe campana candela canto carta casa cavallo cielo cigno citta collina corda corona cuore delfino diario dolce drago erba estate faro fiore fiume foglia forno fresco fuoco gatto gelato giardino giorno grano isola lago lampada legno libro luna mare matita miele monte nave nebbia neve nuvola oceano onda orologio pane parola penna pesca pietra pioggia ponte porto prato quadro radio ramo rosa sabbia sale scala selva sentiero sera sole sorriso spiaggia stella strada tavolo tempo terra torre tramonto trama uccello valle vento verde viola vita volo zaino zucchero ape arco asino botte campo cane cera cima dado duna fava fico gola iride lana lince melo nido orso pino riso seta tigre uva vela volpe zebra ciliegia farfalla lanterna montagna sinfonia tartaruga'.split(' ').filter((w, i, a) => a.indexOf(w) === i);

module.exports = {
  'ascii-banner': {
    desc: 'Scritta a grandi lettere in ASCII (A-Z, 0-9, spazio ! ? . -)', usage: '"ciao" [--char=#]',
    fn: (a, o, io) => { const t = io.text().toUpperCase().replace(/\r?\n/g, ' ').trim(); if (!t) throw new Error('Manca il testo'); if (t.length > 20) throw new Error('Massimo 20 caratteri'); const ch = o.char && o.char !== true ? [...o.char][0] : '#'; const bad = [...t].find(c => !FONT[c]); if (bad) throw new Error('Carattere non supportato: ' + bad); return [0, 1, 2, 3, 4].map(r => [...t].map(c => FONT[c][r].replace(/#/g, ch)).join(' ').replace(/\s+$/, '')).join('\n'); },
  },
  cowsay: {
    desc: 'Una mucca che dice il tuo testo (classico dei terminali)', usage: '"Ciao a tutti" [--width=40]',
    fn: (a, o, io) => { const w = num(o.width, 40, 10, 100, '--width'); const words = io.text().trim().split(/\s+/).filter(Boolean); if (!words.length) throw new Error('Manca il testo'); const lines = []; let cur = ''; for (const x of words) { if (cur && (cur + ' ' + x).length > w) { lines.push(cur); cur = x; } else cur = cur ? cur + ' ' + x : x; } lines.push(cur); const m = Math.max(...lines.map(l => l.length)); const body = lines.length === 1 ? [`< ${lines[0].padEnd(m)} >`] : lines.map((l, i) => { const [x, y] = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|']; return `${x} ${l.padEnd(m)} ${y}`; }); return [' ' + '_'.repeat(m + 2), ...body, ' ' + '-'.repeat(m + 2), '        \\   ^__^', '         \\  (oo)\\_______', '            (__)\\       )\\/\\', '                ||----w |', '                ||     ||'].join('\n'); },
  },
  fortune: {
    desc: 'Un proverbio italiano a caso (--seed per ripetibilità)', usage: '[--seed=1]',
    fn: (a, o) => pick(PROVERBI, rng(o)),
  },
  'magic-8': {
    desc: 'La palla magica 8: risponde a una domanda sì/no (--seed per ripetibilità)', usage: '"Devo rilasciare di venerdì?" [--seed=1]',
    fn: (a, o, io) => { const q = io.text().trim(); if (!q) throw new Error('Fai una domanda'); return pick(OTTO, rng(o)); },
  },
  passphrase: {
    desc: 'Frase d\'accesso con parole italiane casuali (crittograficamente sicura); mostra l\'entropia', usage: '[--words=9] [--sep=-] [--cap]',
    fn: (a, o) => { const n = num(o.words, 9, 4, 16, '--words'), sep = o.sep === undefined ? '-' : o.sep === true ? '' : String(o.sep); const ws = Array.from({ length: n }, () => PAROLE[crypto.randomInt(0, PAROLE.length)]).map(w => o.cap ? w[0].toUpperCase() + w.slice(1) : w); const bits = Math.round(n * Math.log2(PAROLE.length) * 10) / 10; return { frase: ws.join(sep), entropiaBit: bits, giudizio: bits >= 60 ? 'buona per un account' : bits >= 45 ? 'media: usa più parole' : 'debole: usa più parole', nota: `Lista di ${PAROLE.length} parole: l'entropia assume che chi attacca conosca la lista.` }; },
  },
  pomodoro: {
    desc: 'Pianifica le sessioni Pomodoro (25/5, pausa lunga 15 ogni 4) con gli orari', usage: '--start=09:00 [--cycles=8] [--work=25] [--short=5] [--long=15]',
    fn: (a, o) => { const m = /^(\d{1,2}):(\d{2})$/.exec(o.start === undefined || o.start === true ? '' : o.start); if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('--start=HH:MM (es. 09:00)'); const c = num(o.cycles, 8, 1, 24, '--cycles'), W = num(o.work, 25, 5, 120, '--work'), S = num(o.short, 5, 1, 60, '--short'), L = num(o.long, 15, 1, 120, '--long'); let t = +m[1] * 60 + +m[2]; const f = x => String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); const out = []; for (let i = 1; i <= c; i++) { out.push(`${f(t)}-${f(t + W)}  Sessione ${i}`); t += W; if (i < c) { const b = i % 4 === 0 ? L : S; out.push(`${f(t)}-${f(t + b)}  ${i % 4 === 0 ? 'Pausa lunga' : 'Pausa'}`); t += b; } } return out.join('\n') + `\nFine: ${f(t)}   (${c * W} minuti di lavoro)`; },
  },
  konami: {
    desc: 'Easter egg', usage: '', hidden: true,
    fn: () => '↑ ↑ ↓ ↓ ← → ← → B A\n\n30 vite extra. Nessuna utilità pratica, grande soddisfazione.',
  },
  xyzzy: {
    desc: 'Easter egg', usage: '', hidden: true,
    fn: () => 'Non succede nulla.',
  },
  sudo: {
    desc: 'Easter egg', usage: '<comando>', hidden: true,
    fn: (a, o, io) => /panino|sandwich/i.test(io.text()) ? 'Permesso negato: il panino richiede privilegi di root.' : 'tt non è in sudoers. Questo incidente verrà segnalato (a nessuno).',
  },
  42: {
    desc: 'Easter egg', usage: '', hidden: true,
    fn: () => 'La risposta alla domanda fondamentale sulla vita, l\'universo e tutto quanto.\nPurtroppo nessuno ricorda più la domanda.',
  },
};
