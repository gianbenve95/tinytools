'use strict';
// Registro dei tool + esecuzione. Ogni tool: { desc, usage, fn(args, opts, io) -> string | object | Promise }
const fs = require('fs');
const path = require('path');

const GROUPS = ['text', 'data', 'encode', 'numbers', 'files', 'dev', 'words', 'math', 'dates', 'files2', 'net', 'markdown', 'git', 'web', 'system', 'csv', 'jsontools', 'validators', 'lines', 'crypto', 'practical', 'textplus', 'devtools2', 'git2', 'files3', 'geo', 'dataformats', 'timetools', 'secops', 'webtools', 'a11y', 'fun'];
const registry = {};
for (const g of GROUPS) {
  const mod = require('./' + g);
  for (const [name, t] of Object.entries(mod)) {
    if (registry[name]) throw new Error('Tool duplicato: ' + name);
    registry[name] = { ...t, group: g };
  }
}

function parseArgs(argv) {
  const args = [], opts = {};
  for (const a of argv) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
    if (m) opts[m[1]] = m[2] === undefined ? true : m[2];
    else args.push(a);
  }
  return { args, opts };
}

// io.text(): testo da --file=, da argomenti o da stdin
function makeIO(args, opts, stdinReader) {
  return {
    text() {
      if (opts.file) return fs.readFileSync(opts.file, 'utf8');
      if (args.length) return args.join(' ');
      return stdinReader();
    },
    file(i) { return fs.readFileSync(args[i], 'utf8'); },
    stdin: stdinReader,
  };
}

const readStdin = () => { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } };

async function call(name, args = [], opts = {}, stdin = '') {
  const t = registry[name];
  if (!t) throw new Error('Tool sconosciuto: ' + name);
  const out = await t.fn(args, opts, makeIO(args, opts, () => stdin));
  return typeof out === 'string' ? out : JSON.stringify(out, null, 2);
}

function list() {
  const w = Math.max(...Object.keys(registry).map(n => n.length));
  let s = '';
  for (const g of GROUPS) {
    s += `\n[${g}]\n`;
    for (const [n, t] of Object.entries(registry)) if (t.group === g && !t.hidden) s += `  ${n.padEnd(w)}  ${t.desc}\n`;
  }
  return s;
}

const visible = () => Object.entries(registry).filter(([, t]) => !t.hidden);
function search(term) {
  const q = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!q.length) throw new Error('Uso: tt search <parola> (es. tt search json)');
  const hits = visible().map(([n, t]) => { const hay = (n + ' ' + t.desc).toLowerCase(); const score = q.reduce((x, w) => x + (n === w ? 6 : n.includes(w) ? 3 : hay.includes(w) ? 1 : -100), 0); return { n, t, score }; }).filter(h => h.score > 0).sort((a, b) => b.score - a.score || a.n.localeCompare(b.n));
  if (!hits.length) return 'Nessun tool trovato per: ' + term;
  const w = Math.max(...hits.map(h => h.n.length));
  return hits.map(h => `${h.n.padEnd(w)}  ${h.t.desc}`).join('\n');
}
function completion(shell) {
  const names = visible().map(([n]) => n).sort().join(' ');
  if (shell === 'bash') return `_tt() { COMPREPLY=( $(compgen -W "list search completion ${names}" -- "\${COMP_WORDS[COMP_CWORD]}") ); }\ncomplete -F _tt tt`;
  if (shell === 'zsh') return `#compdef tt\n_arguments '1:tool:(list search completion ${names})'`;
  throw new Error('Uso: tt completion bash|zsh   (es. source <(tt completion bash))');
}

async function main(argv) {
  const [name, ...rest] = argv;
  if (name === '--version' || name === '-v') { console.log(require('../package.json').version); return 0; }
  if (name === 'search' || name === 'completion') {
    try { console.log(name === 'search' ? search(rest.filter(a => !a.startsWith('--')).join(' ')) : completion(rest[0])); return 0; } catch (e) { console.error('Errore: ' + e.message); return 1; }
  }
  if (!name || name === 'list' || name === '--help' || name === '-h') {
    console.log('Uso: tt <tool> [argomenti] [--opzioni]   (testo da argomenti, --file=percorso o stdin)\n' + list());
    return 0;
  }
  const t = registry[name];
  if (!t) { console.error(`Tool sconosciuto: ${name}\nUsa "tt list" per l'elenco.`); return 2; }
  const { args, opts } = parseArgs(rest);
  if (opts.help) { console.log(`${name} - ${t.desc}\nUso: tt ${name} ${t.usage || ''}`); return 0; }
  try {
    const out = await t.fn(args, opts, makeIO(args, opts, readStdin));
    process.stdout.write((typeof out === 'string' ? out : JSON.stringify(out, null, 2)) + '\n');
    return 0;
  } catch (e) { console.error('Errore: ' + e.message); return 1; }
}

module.exports = { registry, call, main, list, parseArgs, search, completion };
