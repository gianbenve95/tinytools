#!/usr/bin/env node
// REGIA swarm helper: one git worktree per sub-task, ordered merge, report, cleanup.
// Usage (from the project root):
//   worktree.mjs crea <run> <id> [<id> ...] [--agenti a,b,c] [--titoli "t1|t2|t3"]
//   worktree.mjs esito <run> <id> esito=completato test="12/12" agente=sviluppatore
//   worktree.mjs unisci <run> [<id> ...]      merge in the given order (default: creation order)
//   worktree.mjs report <run>
//   worktree.mjs pulisci <run>
//   worktree.mjs stato <run>
import { join, resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, readdirSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadConfig, dataDir, readJson, writeJsonAtomic, projectName, isMain } from '../hooks/lib/common.mjs';

function git(cwd, args, { allowFail = false } = {}) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task';
const stateFile = (run) => join(dataDir(), 'sciame', `${slug(run)}.json`);
const load = (run) => { const s = readJson(stateFile(run), null); if (!s) throw new Error(`Sciame "${run}" non trovato.`); return s; };
const save = (s) => writeJsonAtomic(stateFile(s.run), s);
const EXCLUDE_BLOCK = '# REGIA sciame: link ai pacchetti del progetto (tolto da pulisci)\n/node_modules\n';

// Worktrees have no node_modules: link the project's one so tests run without reinstalling.
// A symlink is a file for git, so "node_modules/" in .gitignore does not cover it: exclude it.
function linkNodeModules(top, wt) {
  const src = join(top, 'node_modules');
  if (!existsSync(src)) return null;
  symlinkSync(src, join(wt, 'node_modules'), 'dir');
  if (spawnSync('git', ['-C', wt, 'check-ignore', '-q', 'node_modules']).status === 0) return null;
  const ex = resolve(top, git(top, ['rev-parse', '--git-path', 'info/exclude']).out);
  const cur = existsSync(ex) ? readFileSync(ex, 'utf8') : '';
  if (!cur.includes(EXCLUDE_BLOCK)) writeFileSync(ex, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${EXCLUDE_BLOCK}`);
  return ex;
}

export function crea(root, run, ids, { agenti = [], titoli = [] } = {}) {
  const cfg = loadConfig();
  run = slug(run);
  if (!ids.length) throw new Error('Serve almeno un sotto-task.');
  if (ids.length > cfg.maxAgenti) throw new Error(`Massimo ${cfg.maxAgenti} sotto-task in parallelo (config maxAgenti). Unisci quelli piccoli o fai due giri.`);
  if (existsSync(stateFile(run))) throw new Error(`Esiste già uno sciame "${run}": usa un altro nome o "pulisci".`);
  const top = git(root, ['rev-parse', '--show-toplevel']).out;
  const dirty = git(top, ['status', '--porcelain', '--untracked-files=no']).out;
  if (dirty) throw new Error('Ci sono modifiche non committate: i worktree partono dall\'ultimo commit e non le vedrebbero. Fai commit o stash e riprova.');
  let base = git(top, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
  let nuovoRamo = null;
  const daRamo = base;
  if (cfg.guard.branchProtetti.includes(base)) {
    nuovoRamo = `regia/${run}-lavoro`; // not regia/<run>: git refs cannot be both file and folder
    git(top, ['checkout', '-q', '-b', nuovoRamo]);
    base = nuovoRamo;
  }
  const baseCommit = git(top, ['rev-parse', 'HEAD']).out;
  const wtRoot = join(homedir(), '.regia', 'worktrees', slug(projectName(top)), run);
  mkdirSync(wtRoot, { recursive: true });
  let excludeFile = null;
  const sotto = ids.map((raw, i) => {
    const id = slug(raw);
    const percorso = join(wtRoot, id);
    const ramo = `regia/${run}/${id}`;
    git(top, ['worktree', 'add', '-q', '-b', ramo, percorso, baseCommit]);
    excludeFile = linkNodeModules(top, percorso) || excludeFile;
    return { id, titolo: titoli[i] || id, agente: agenti[i] || null, ramo, percorso, stato: 'in corso', esito: null, test: null, file: [], inizio: new Date().toISOString(), fine: null };
  });
  const s = { run, progetto: projectName(top), radice: top, base, baseCommit, nuovoRamo, daRamo, wtRoot, excludeFile, creato: new Date().toISOString(), sotto_task: sotto, merge: [] };
  save(s);
  return s;
}

export function esito(run, id, fields) {
  const s = load(run);
  const t = s.sotto_task.find((x) => x.id === slug(id));
  if (!t) throw new Error(`Sotto-task ${id} non trovato.`);
  Object.assign(t, fields);
  if (fields.esito) t.stato = fields.esito;
  save(s);
  return t;
}

export function unisci(run, order = []) {
  const s = load(run);
  const ids = order.length ? order.map(slug) : s.sotto_task.map((t) => t.id);
  const cur = git(s.radice, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
  if (cur !== s.base) throw new Error(`Il progetto è sul ramo ${cur}, il merge va fatto su ${s.base}.`);
  const results = [];
  for (const id of ids) {
    const t = s.sotto_task.find((x) => x.id === id);
    if (!t) { results.push({ id, esito: 'sconosciuto' }); continue; }
    if (t.esito === 'fallito') { results.push({ id, esito: 'saltato (fallito)' }); continue; }
    const ahead = git(s.radice, ['rev-list', '--count', `${s.baseCommit}..${t.ramo}`]).out;
    t.file = git(s.radice, ['diff', '--name-only', `${s.baseCommit}...${t.ramo}`]).out.split('\n').filter(Boolean);
    // time of the sub-task = from creation to its last commit
    if (ahead !== '0') t.fine = git(s.radice, ['log', '-1', '--format=%cI', t.ramo]).out;
    if (ahead === '0') { results.push({ id, esito: 'nessun commit' }); continue; }
    const m = git(s.radice, ['merge', '--no-ff', '--no-edit', '-m', `REGIA sciame ${s.run}: ${t.titolo}`, t.ramo], { allowFail: true });
    if (!m.ok) {
      git(s.radice, ['merge', '--abort'], { allowFail: true });
      t.stato = 'conflitto';
      results.push({ id, esito: 'conflitto', dettaglio: m.out.split('\n').filter((l) => /CONFLICT/.test(l)).join('; ') });
      break; // ordered merge: stop at the first conflict
    }
    t.stato = 'unito';
    results.push({ id, esito: 'unito', commit: git(s.radice, ['rev-parse', '--short', 'HEAD']).out });
  }
  s.merge.push({ quando: new Date().toISOString(), risultati: results });
  save(s);
  return results;
}

const dur = (a, b) => {
  if (!a || !b) return '-';
  const sec = Math.round((Date.parse(b) - Date.parse(a)) / 1000);
  return sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${sec % 60} s`;
};

export function report(run) {
  const s = load(run);
  const rows = s.sotto_task.map((t) => `| ${t.titolo} | ${t.agente || '-'} | ${t.esito || t.stato} | ${t.file.length ? t.file.join(', ') : '-'} | ${t.test || '-'} | ${dur(t.inizio, t.fine)} |`);
  const last = s.merge.at(-1);
  return [
    `Sciame ${s.run} su ${s.progetto} (ramo di lavoro: ${s.base}${s.nuovoRamo ? `, creato da ${s.daRamo || 'main'}` : ''})`,
    '',
    '| sotto-task | agente | esito | file toccati | test | tempo |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    last ? `Merge: ${last.risultati.map((r) => `${r.id} ${r.esito}`).join(', ')}` : 'Merge: non ancora fatto',
  ].join('\n');
}

export function pulisci(run) {
  const s = load(run);
  const out = [];
  for (const t of s.sotto_task) {
    git(s.radice, ['worktree', 'remove', '--force', t.percorso], { allowFail: true });
    const merged = git(s.radice, ['branch', '-d', t.ramo], { allowFail: true }).ok;
    out.push(`${t.id}: worktree rimosso, ramo ${merged ? 'cancellato (unito)' : 'tenuto (non unito)'}`);
  }
  git(s.radice, ['worktree', 'prune'], { allowFail: true });
  const rmEmpty = (d) => { try { if (d && existsSync(d) && !readdirSync(d).length) rmdirSync(d); } catch { /* not empty */ } };
  const wtRoot = s.wtRoot || dirname(s.sotto_task[0]?.percorso || '');
  rmEmpty(wtRoot);
  rmEmpty(dirname(wtRoot));
  if (s.excludeFile && existsSync(s.excludeFile)) {
    writeFileSync(s.excludeFile, readFileSync(s.excludeFile, 'utf8').replace(EXCLUDE_BLOCK, ''));
  }
  s.pulito = new Date().toISOString();
  save(s);
  return out;
}

function parseKv(args) {
  const o = {};
  for (const a of args) { const i = a.indexOf('='); if (i > 0) o[a.slice(0, i)] = a.slice(i + 1); }
  return o;
}

if (isMain(import.meta.url)) {
  const [cmd, run, ...rest] = process.argv.slice(2);
  const root = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  try {
    if (cmd === 'crea') {
      const flags = {}; const ids = [];
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--agenti') flags.agenti = rest[++i].split(',');
        else if (rest[i] === '--titoli') flags.titoli = rest[++i].split('|');
        else ids.push(rest[i]);
      }
      const s = crea(root, run, ids, flags);
      console.log(JSON.stringify({ run: s.run, base: s.base, nuovoRamo: s.nuovoRamo, sotto_task: s.sotto_task.map(({ id, agente, ramo, percorso }) => ({ id, agente, ramo, percorso })) }, null, 2));
    } else if (cmd === 'esito') {
      const [id, ...kv] = rest;
      console.log(JSON.stringify(esito(run, id, parseKv(kv))));
    } else if (cmd === 'unisci') {
      console.log(JSON.stringify(unisci(run, rest), null, 2));
    } else if (cmd === 'report') {
      console.log(report(run));
    } else if (cmd === 'pulisci') {
      console.log(pulisci(run).join('\n'));
    } else if (cmd === 'stato') {
      console.log(JSON.stringify(load(run), null, 2));
    } else {
      console.error('Uso: worktree.mjs crea|esito|unisci|report|pulisci|stato <run> ...');
      process.exit(2);
    }
  } catch (e) {
    console.error(`Errore: ${e.message}`);
    process.exit(1);
  }
}
