'use strict';
// File, cartelle e rete (tutto locale; nulla viene modificato salvo bulk-rename --apply)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), net = require('net');

const SKIP = new Set(['.git', 'node_modules', '.DS_Store', '.venv', '__pycache__']);
function* walk(dir, all = false) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!all && SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) yield* walk(p, all); else if (e.isFile()) yield p;
  }
}
const root = a => { const d = a[0] || '.'; if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error('Cartella non trovata: ' + d); return d; };
const human = n => { const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return +n.toFixed(i ? 1 : 0) + ' ' + u[i]; };
const parseSize = s => { const m = /^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i.exec(String(s)); if (!m) throw new Error('Dimensione non valida: ' + s); return Math.round(+m[1] * (m[2] ? 1024 ** ('kmgt'.indexOf(m[2].toLowerCase()) + 1) : 1)); };
const sha = (f, algo = 'sha256') => new Promise((res, rej) => { const h = crypto.createHash(algo); fs.createReadStream(f).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const dirTotal = p => { let t = 0; for (const f of walk(p, true)) t += fs.statSync(f).size; return t; };

const STATUS = { 100: ['Continue', 'Il client può proseguire con la richiesta.'], 101: ['Switching Protocols', 'Il server passa al protocollo richiesto (es. WebSocket).'], 200: ['OK', 'Richiesta riuscita.'], 201: ['Created', 'Risorsa creata.'], 202: ['Accepted', 'Richiesta accettata, elaborazione non ancora completata.'], 204: ['No Content', 'Riuscita, nessun contenuto da restituire.'], 206: ['Partial Content', 'Risposta parziale (Range).'], 301: ['Moved Permanently', 'La risorsa è stata spostata definitivamente.'], 302: ['Found', 'Redirect temporaneo.'], 303: ['See Other', 'Vai su un altro URL con GET.'], 304: ['Not Modified', 'La copia in cache è ancora valida.'], 307: ['Temporary Redirect', 'Redirect temporaneo che mantiene il metodo.'], 308: ['Permanent Redirect', 'Redirect permanente che mantiene il metodo.'], 400: ['Bad Request', 'Richiesta malformata.'], 401: ['Unauthorized', 'Autenticazione mancante o non valida.'], 403: ['Forbidden', 'Autenticato ma non autorizzato.'], 404: ['Not Found', 'Risorsa non trovata.'], 405: ['Method Not Allowed', 'Metodo HTTP non ammesso per questa risorsa.'], 408: ['Request Timeout', 'Il server ha atteso troppo la richiesta.'], 409: ['Conflict', 'Conflitto con lo stato corrente della risorsa.'], 410: ['Gone', 'La risorsa è stata rimossa per sempre.'], 413: ['Payload Too Large', 'Corpo della richiesta troppo grande.'], 415: ['Unsupported Media Type', 'Formato del contenuto non supportato.'], 418: ["I'm a teapot", 'Scherzo del 1° aprile (RFC 2324).'], 422: ['Unprocessable Content', 'Sintassi corretta ma contenuto non valido.'], 429: ['Too Many Requests', 'Troppe richieste: rate limit.'], 500: ['Internal Server Error', 'Errore generico del server.'], 501: ['Not Implemented', 'Funzione non implementata.'], 502: ['Bad Gateway', 'Risposta non valida dal server a monte.'], 503: ['Service Unavailable', 'Servizio non disponibile (sovraccarico o manutenzione).'], 504: ['Gateway Timeout', 'Il server a monte non ha risposto in tempo.'] };
const GI = { node: 'node_modules/\nnpm-debug.log*\n.env\ndist/\ncoverage/', python: '__pycache__/\n*.py[cod]\n.venv/\nvenv/\n*.egg-info/\n.env\n.pytest_cache/', macos: '.DS_Store\n.AppleDouble\n.LSOverride\n._*', windows: 'Thumbs.db\nDesktop.ini\n$RECYCLE.BIN/', linux: '*~\n.directory\n.Trash-*', java: '*.class\n*.jar\ntarget/\n.gradle/\nbuild/', go: '*.exe\n*.test\n*.out\nvendor/\nbin/', rust: 'target/\nCargo.lock\n**/*.rs.bk', vscode: '.vscode/*\n!.vscode/settings.json\n!.vscode/extensions.json', jetbrains: '.idea/\n*.iml', env: '.env\n.env.*\n!.env.example' };

module.exports = {
  dupfinder: {
    desc: 'Trova file duplicati (stesso contenuto) in una cartella', usage: '<cartella> [--min=1KB]',
    fn: async (a, o) => {
      const min = o.min ? parseSize(o.min) : 1, bySize = new Map();
      for (const f of walk(root(a))) { const s = fs.statSync(f).size; if (s >= min) (bySize.get(s) || bySize.set(s, []).get(s)).push(f); }
      const groups = []; let wasted = 0;
      for (const [size, files] of bySize) { if (files.length < 2) continue; const byHash = new Map(); for (const f of files) { const h = await sha(f); (byHash.get(h) || byHash.set(h, []).get(h)).push(f); } for (const fl of byHash.values()) if (fl.length > 1) { groups.push({ size, files: fl.sort() }); wasted += size * (fl.length - 1); } }
      groups.sort((x, y) => y.size * y.files.length - x.size * x.files.length);
      return { duplicateGroups: groups.length, wastedBytes: wasted, wasted: human(wasted), groups };
    },
  },
  dirsize: {
    desc: 'Dimensione di ogni sotto-cartella/file, ordinata', usage: '<cartella> [--top=10]',
    fn: (a, o) => {
      const d = root(a), rows = fs.readdirSync(d, { withFileTypes: true }).filter(e => !e.isSymbolicLink()).map(e => { const p = path.join(d, e.name); return { name: e.name + (e.isDirectory() ? '/' : ''), bytes: e.isDirectory() ? dirTotal(p) : fs.statSync(p).size }; }).sort((x, y) => y.bytes - x.bytes);
      const top = rows.slice(0, +o.top || 10), total = rows.reduce((s, r) => s + r.bytes, 0);
      return top.map(r => `${human(r.bytes).padStart(9)}  ${r.name}`).join('\n') + `\n${human(total).padStart(9)}  TOTALE`;
    },
  },
  'bulk-rename': {
    desc: 'Rinomina file con regex (anteprima di default, --apply per eseguire)', usage: '<cartella> --find="IMG_(\\d+)" --replace="foto-$1" [--apply]',
    fn: (a, o) => {
      if (!o.find || o.replace === undefined) throw new Error('Servono --find e --replace');
      const d = root(a), re = new RegExp(o.find), names = fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
      const plan = names.filter(n => re.test(n)).map(n => [n, n.replace(re, o.replace)]).filter(([x, y]) => x !== y);
      const targets = new Set(), taken = new Set(names.filter(n => !plan.some(p => p[0] === n)));
      for (const [, to] of plan) { if (!to || to.includes('/') || taken.has(to) || targets.has(to)) throw new Error('Conflitto o nome non valido: ' + to); targets.add(to); }
      if (o.apply) { const tmp = plan.map(([f, t], i) => [f, t, `.tt-tmp-${process.pid}-${i}`]); for (const [f, , m] of tmp) fs.renameSync(path.join(d, f), path.join(d, m)); for (const [, t, m] of tmp) fs.renameSync(path.join(d, m), path.join(d, t)); }
      return (plan.map(([f, t]) => `${f} -> ${t}`).join('\n') || 'Nessun file da rinominare') + (plan.length ? `\n${o.apply ? 'Rinominati' : 'Anteprima (usa --apply)'}: ${plan.length}` : '');
    },
  },
  'file-tree': {
    desc: 'Albero della cartella (ignora .git e node_modules, --all per tutto)', usage: '<cartella> [--depth=3] [--all]',
    fn: (a, o) => {
      const max = +o.depth || 3, lines = [path.basename(path.resolve(root(a))) + '/'];
      (function rec(dir, prefix, depth) {
        const es = fs.readdirSync(dir, { withFileTypes: true }).filter(e => o.all || !SKIP.has(e.name)).sort((x, y) => (y.isDirectory() - x.isDirectory()) || x.name.localeCompare(y.name));
        es.forEach((e, i) => { const last = i === es.length - 1; lines.push(prefix + (last ? '└── ' : '├── ') + e.name + (e.isDirectory() ? '/' : '')); if (e.isDirectory() && !e.isSymbolicLink() && depth < max) rec(path.join(dir, e.name), prefix + (last ? '    ' : '│   '), depth + 1); });
      })(root(a), '', 1);
      return lines.join('\n');
    },
  },
  'find-large': {
    desc: 'File più grandi di una soglia', usage: '<cartella> [--min=10MB] [--top=20]',
    fn: (a, o) => { const min = parseSize(o.min || '10MB'); return [...walk(root(a), true)].map(f => [f, fs.statSync(f).size]).filter(x => x[1] >= min).sort((x, y) => y[1] - x[1]).slice(0, +o.top || 20).map(([f, s]) => `${human(s).padStart(9)}  ${f}`).join('\n') || 'Nessun file sopra la soglia'; },
  },
  loc: {
    desc: 'Conta le righe di codice per estensione', usage: '<cartella>',
    fn: (a) => {
      const st = {};
      for (const f of walk(root(a))) { const buf = fs.readFileSync(f); if (buf.includes(0)) continue; const ext = path.extname(f) || '(nessuna)', lines = buf.toString('utf8').split('\n'); if (lines[lines.length - 1] === '') lines.pop(); const s = st[ext] || (st[ext] = { files: 0, code: 0, blank: 0 }); s.files++; for (const l of lines) l.trim() ? s.code++ : s.blank++; }
      return Object.fromEntries(Object.entries(st).sort((x, y) => y[1].code - x[1].code));
    },
  },
  'todo-scan': {
    desc: 'Elenca TODO / FIXME / HACK / XXX nei file di testo', usage: '<cartella>',
    fn: (a) => { const out = [], re = /\b(TODO|FIXME|HACK|XXX)\b[:\s]*(.*)/; for (const f of walk(root(a))) { const buf = fs.readFileSync(f); if (buf.includes(0)) continue; buf.toString('utf8').split('\n').forEach((l, i) => { const m = re.exec(l); if (m) out.push(`${f}:${i + 1}: [${m[1]}] ${m[2].trim()}`); }); } return out.join('\n') || 'Nessun TODO trovato'; },
  },
  'checksum-verify': {
    desc: 'Verifica un file di checksum (formato sha256sum/md5sum)', usage: 'SHA256SUMS',
    fn: async (a) => {
      if (!a[0]) throw new Error('Indica il file dei checksum'); const base = path.dirname(a[0]), lines = fs.readFileSync(a[0], 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')); let bad = 0; const out = [];
      for (const l of lines) {
        const m = /^([0-9a-fA-F]+)\s+\*?(.+)$/.exec(l); if (!m) { out.push('RIGA NON VALIDA: ' + l); bad++; continue; }
        const algo = { 32: 'md5', 40: 'sha1', 64: 'sha256', 128: 'sha512' }[m[1].length], f = path.join(base, m[2]);
        if (!algo) { out.push(`${m[2]}: LUNGHEZZA HASH NON SUPPORTATA`); bad++; } else if (!fs.existsSync(f)) { out.push(`${m[2]}: MANCANTE`); bad++; } else if ((await sha(f, algo)) === m[1].toLowerCase()) out.push(`${m[2]}: OK`); else { out.push(`${m[2]}: FALLITO`); bad++; }
      }
      out.push(bad ? `${bad} problemi su ${lines.length} file` : `Tutti i ${lines.length} file sono integri`); return out.join('\n');
    },
  },
  'port-check': {
    desc: 'Verifica se una porta TCP è raggiungibile', usage: 'host porta [--timeout=2000]',
    fn: (a, o) => new Promise((res, rej) => {
      const [host, port] = a; if (!host || !(+port > 0 && +port < 65536)) return rej(new Error('Uso: port-check host porta'));
      const t0 = Date.now(), s = net.connect({ host, port: +port }), done = (r) => { s.destroy(); res(r); };
      s.setTimeout(+o.timeout || 2000); s.on('connect', () => done(`${host}:${port} APERTA (${Date.now() - t0} ms)`));
      s.on('timeout', () => done(`${host}:${port} TIMEOUT`)); s.on('error', e => done(`${host}:${port} CHIUSA (${e.code || e.message})`));
    }),
  },
  'http-status': {
    desc: 'Spiega un codice di stato HTTP (o una classe: 4xx)', usage: '404 | 5xx',
    fn: (a, o, io) => {
      const t = io.text().trim().toLowerCase();
      if (/^[1-5]xx$/.test(t)) return Object.entries(STATUS).filter(([c]) => c[0] === t[0]).map(([c, [n]]) => `${c} ${n}`).join('\n');
      const s = STATUS[t]; if (!s) throw new Error('Codice sconosciuto: ' + t); return `${t} ${s[0]}\n${s[1]}`;
    },
  },
  'gitignore-gen': {
    desc: 'Genera un .gitignore combinando modelli', usage: 'node macos vscode  (usa "list" per i modelli)',
    fn: (a) => {
      if (!a.length || a[0] === 'list') return Object.keys(GI).join(', ');
      const bad = a.filter(x => !GI[x.toLowerCase()]); if (bad.length) throw new Error('Modelli sconosciuti: ' + bad.join(', '));
      return a.map(x => `# ${x.toLowerCase()}\n${GI[x.toLowerCase()]}`).join('\n\n');
    },
  },
};
