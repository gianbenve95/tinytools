#!/usr/bin/env node
// REGIA installer: install | uninstall | status, in a project (default) or global (--global).
// Rule 6: every file is backed up with a timestamp before it is touched, settings are merged,
// and uninstall removes only what the manifest says REGIA added.
import { existsSync, realpathSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, rmdirSync, cpSync } from 'node:fs';
import { join, resolve, dirname, relative, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { billingRisks } from '../hooks/lib/common.mjs';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_MARK = '/.claude/regia/';
const MCP_NAMES = ['regia-memory', 'regia-local'];
const RUNTIME_PARTS = ['hooks', 'mcp', 'bin', 'statusline', 'config', 'agents', 'commands'];
const EXCLUDE_START = '# REGIA inizio (scritto da install.sh, tolto da uninstall.sh)';
const EXCLUDE_END = '# REGIA fine';

// ---------------------------------------------------------------- small helpers

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const readText = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',')}}`;
  return JSON.stringify(v);
}
const sameJson = (a, b) => canonical(a) === canonical(b);

function readJsonStrict(path) {
  const t = readText(path);
  if (t === null || !t.trim()) return {};
  try { return JSON.parse(t); } catch (e) { throw new Error(`${path} non è JSON valido (${e.message}): non lo tocco. Sistemalo e rilancia.`); }
}
const writeJson = (path, obj) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(obj, null, 2) + '\n'); };

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function claudeCli() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? 'claude' : null;
}

function claudeJsonPath() {
  const dir = process.env.CLAUDE_CONFIG_DIR;
  return dir ? join(dir, '.claude.json') : join(homedir(), '.claude.json');
}

function listMd(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
}

// ---------------------------------------------------------------- targets

function targets(opts) {
  const home = homedir();
  if (opts.global) {
    const base = join(home, '.claude');
    return { mode: 'globale', home, base, projectDir: null, settings: join(base, 'settings.json'), slug: 'globale', ...dirs(base), state: join(home, '.regia', 'installazioni', 'globale') };
  }
  const projectDir = resolve(opts.project || process.cwd());
  if (!existsSync(projectDir)) throw new Error(`Cartella progetto inesistente: ${projectDir}`);

  const base = join(projectDir, '.claude');
  const slug = projectDir.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '_');
  return { mode: 'progetto', home, base, projectDir, settings: join(base, 'settings.local.json'), slug, ...dirs(base), state: join(home, '.regia', 'installazioni', slug) };
}
function dirs(base) {
  return { runtime: join(base, 'regia'), agentsDir: join(base, 'agents', 'regia'), commandsDir: join(base, 'commands') };
}

// ---------------------------------------------------------------- manifest and backups

function loadManifest(t) { return existsSync(join(t.state, 'manifest.json')) ? JSON.parse(readFileSync(join(t.state, 'manifest.json'), 'utf8')) : null; }
function saveManifest(t, m) { writeJson(join(t.state, 'manifest.json'), m); }

// Copies the current bytes of every file about to be touched into a timestamped folder.
function backup(t, files, ts) {
  const dir = join(t.state, `backup-${ts}`);
  const out = {};
  for (const f of files) {
    const rec = { existed: existsSync(f) };
    if (rec.existed) {
      const dest = join(dir, f.replace(/^\/+/, '').replace(/\//g, '__'));
      mkdirSync(dir, { recursive: true });
      copyFileSync(f, dest);
      rec.backup = dest;
      rec.sha = sha(readFileSync(f));
    }
    out[f] = rec;
  }
  return out;
}

// ---------------------------------------------------------------- settings merge

function hookCommand(t, file) { return `node "${join(t.runtime, 'hooks', file)}"`; }
// If the guard cannot even start (file missing, Node missing), exit 2 blocks the tool in every
// Claude Code version. onFailure: "block" does the same, but only from 2.1.295 (2.1.283 ignores it).
const GUARD_FAILSAFE = ` || { echo 'REGIA: il guard non è partito, blocco per sicurezza. Lancia /regia-test.' >&2; exit 2; }`;

function regiaHooks(t) {
  const h = (file, timeout, extra = {}) => ({ type: 'command', command: hookCommand(t, file), timeout, ...extra });
  return {
    PreToolUse: [{ matcher: '^(Bash|Write|Edit|MultiEdit|NotebookEdit|mcp__.*)$', hooks: [{ ...h('guard.mjs', 10, { onFailure: 'block' }), command: hookCommand(t, 'guard.mjs') + GUARD_FAILSAFE }] }],
    PostToolUse: [{ matcher: '^(Write|Edit|MultiEdit)$', hooks: [h('post-edit.mjs', 20)] }],
    UserPromptSubmit: [{ hooks: [h('route.mjs', 6)] }],
    SessionStart: [{ hooks: [h('session-start.mjs', 6)] }],
    Stop: [{ hooks: [h('stop.mjs', 15)] }],
    SubagentStart: [{ hooks: [h('subagent-stop.mjs', 5)] }],
    SubagentStop: [{ hooks: [h('subagent-stop.mjs', 10)] }],
  };
}

const isRegiaHook = (x) => typeof x?.command === 'string' && x.command.includes(HOOK_MARK);

// Removes REGIA hooks (only ours, also from mixed groups). Empty events/objects disappear.
export function stripRegia(settings, manifestSettings = {}) {
  const s = structuredClone(settings);
  if (s.hooks && typeof s.hooks === 'object') {
    for (const [ev, groups] of Object.entries(s.hooks)) {
      if (!Array.isArray(groups)) continue;
      const kept = [];
      for (const g of groups) {
        const hs = Array.isArray(g?.hooks) ? g.hooks.filter((x) => !isRegiaHook(x)) : g?.hooks;
        if (Array.isArray(g?.hooks) && hs.length === 0) continue;
        kept.push(Array.isArray(g?.hooks) ? { ...g, hooks: hs } : g);
      }
      if (kept.length) s.hooks[ev] = kept; else delete s.hooks[ev];
    }

  }
  if (s.statusLine && isRegiaHook(s.statusLine)) {
    if (manifestSettings.previousStatusLine) s.statusLine = manifestSettings.previousStatusLine;
    else delete s.statusLine;
  }
  const info = manifestSettings;
  if (Array.isArray(s.enabledMcpjsonServers) && Array.isArray(info.mcpjsonAdded)) {
    s.enabledMcpjsonServers = s.enabledMcpjsonServers.filter((x) => !info.mcpjsonAdded.includes(x));
  }
  if (s.permissions && Array.isArray(s.permissions.allow) && Array.isArray(info.permissionsAdded)) {
    s.permissions.allow = s.permissions.allow.filter((x) => !info.permissionsAdded.includes(x));
  }
  if (s.permissions && Array.isArray(s.permissions.additionalDirectories) && Array.isArray(info.dirsAdded)) {
    s.permissions.additionalDirectories = s.permissions.additionalDirectories.filter((x) => !info.dirsAdded.includes(x));
  }
  return s;
}

function mergeSettings(t, current, useMcpJson, prevManifest) {
  const info = prevManifest?.settings ? structuredClone(prevManifest.settings) : {};
  const s = stripRegia(current, info);
  s.hooks = s.hooks || {};
  for (const [ev, groups] of Object.entries(regiaHooks(t))) s.hooks[ev] = [...(s.hooks[ev] || []), ...groups];

  // status line: keep the user's one and chain it
  if (s.statusLine && !isRegiaHook(s.statusLine) && !info.previousStatusLine) info.previousStatusLine = s.statusLine;
  const chain = info.previousStatusLine || (t.mode === 'progetto' ? readJsonSafe(join(t.home, '.claude', 'settings.json')).statusLine : null);
  info.chain = chain && !isRegiaHook(chain) ? chain : null;
  s.statusLine = { type: 'command', command: `node "${join(t.runtime, 'statusline', 'statusline.mjs')}"`, padding: s.statusLine?.padding ?? 0 };

  // our MCP tools are local: allow them without a prompt (the guard still runs first)
  s.permissions = s.permissions || {};
  s.permissions.allow = s.permissions.allow || [];
  const wantAllow = MCP_NAMES.map((n) => `mcp__${n}`);
  info.permissionsAdded = [...new Set([...(info.permissionsAdded || []), ...wantAllow.filter((x) => !s.permissions.allow.includes(x))])];
  for (const x of wantAllow) if (!s.permissions.allow.includes(x)) s.permissions.allow.push(x);

  // /sciame worktrees live in ~/.regia/worktrees: agents may edit there without a prompt.
  // The folder must exist when Claude Code starts, or the entry is not applied.
  const wt = join(t.home, '.regia', 'worktrees');
  mkdirSync(wt, { recursive: true });
  s.permissions.additionalDirectories = s.permissions.additionalDirectories || [];
  info.dirsAdded = [...new Set([...(info.dirsAdded || []), ...(s.permissions.additionalDirectories.includes(wt) ? [] : [wt])])];
  if (!s.permissions.additionalDirectories.includes(wt)) s.permissions.additionalDirectories.push(wt);

  if (useMcpJson) {
    s.enabledMcpjsonServers = s.enabledMcpjsonServers || [];
    info.mcpjsonAdded = [...new Set([...(info.mcpjsonAdded || []), ...MCP_NAMES.filter((x) => !s.enabledMcpjsonServers.includes(x))])];
    for (const x of MCP_NAMES) if (!s.enabledMcpjsonServers.includes(x)) s.enabledMcpjsonServers.push(x);
  }
  return { settings: s, info };
}

function readJsonSafe(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; } }

function mcpSpec(t, name) {
  const file = name === 'regia-memory' ? join(t.runtime, 'mcp', 'regia-memory', 'server.mjs') : join(t.runtime, 'mcp', 'regia-local', 'server.mjs');
  const env = t.projectDir ? { REGIA_PROJECT_DIR: t.projectDir } : {};
  return { type: 'stdio', command: 'node', args: [file], env };
}

// ---------------------------------------------------------------- install

export function install(opts) {
  const t = targets(opts);
  // in the home folder a "project" install would land in ~/.claude, i.e. a global install without consent.
  // uninstall stays allowed there, to clean up an install made before this check existed.
  if (t.mode === 'progetto' && !opts._permettiHome && (t.projectDir === resolve(t.home) || t.projectDir === '/')) {
    throw new Error(`Sei in ${t.projectDir}, non nella cartella di un progetto: qui l'installazione diventerebbe globale. Entra nel progetto (es. cd ~/Progetti/mio-sito) e rilancia, oppure usa --global.`);
  }
  const prev = loadManifest(t);
  const ts = stamp();
  const plan = [];
  const isGit = t.projectDir ? git(t.projectDir, ['rev-parse', '--is-inside-work-tree']) === 'true' : false;
  const mcpJson = t.projectDir ? join(t.projectDir, '.mcp.json') : null;
  const mcpTracked = mcpJson && isGit && git(t.projectDir, ['ls-files', '--error-unmatch', '.mcp.json']) !== null;
  const useMcpJson = t.mode === 'progetto' && !mcpTracked;
  const cli = useMcpJson ? null : claudeCli();
  const excludeFile = isGit ? resolve(t.projectDir, git(t.projectDir, ['rev-parse', '--git-path', 'info/exclude'])) : null;

  const commands = listMd(join(SRC, 'commands'));
  const agents = listMd(join(SRC, 'agents'));
  const touched = [t.settings, ...(useMcpJson ? [mcpJson] : []), ...(excludeFile ? [excludeFile] : []), ...(!useMcpJson && cli ? [claudeJsonPath()] : [])];

  // foreign commands with the same name are never overwritten
  const cmdPlan = commands.map((f) => {
    const dest = join(t.commandsDir, f);
    const ours = prev?.created?.commands?.includes(dest);
    const foreign = existsSync(dest) && !ours;
    return { f, dest, foreign };
  });

  // read and validate every JSON file before writing anything
  const current = readJsonStrict(t.settings);
  const currentMcp = useMcpJson ? readJsonStrict(mcpJson) : null;

  plan.push(['modalità', t.mode], ['destinazione', t.base], ['settings', t.settings], ['MCP', useMcpJson ? `${mcpJson} (non tracciato da git)` : cli ? `claude mcp add-json --scope ${t.mode === 'globale' ? 'user' : 'local'}` : 'manuale (CLI claude non trovata)']);
  for (const c of cmdPlan) if (c.foreign) plan.push(['salto comando', `${c.dest} esiste già e non è di REGIA`]);
  if (opts.dryRun) return { t, plan, dryRun: true };

  const dirsBefore = {
    base: existsSync(t.base),
    agentsParent: existsSync(join(t.base, 'agents')),
    commands: existsSync(t.commandsDir),
  };
  const backups = backup(t, touched, ts);
  const manifest = prev || {
    versione: 1, modalita: t.mode, progetto: t.projectDir, installatoIl: ts,
    originali: backups, cartellePrima: dirsBefore,
  };
  manifest.aggiornatoIl = ts;
  manifest.backup = [...(manifest.backup || []), `backup-${ts}`];
  // files that did not exist at first install stay "did not exist" as originals
  for (const [f, rec] of Object.entries(backups)) if (!manifest.originali[f]) manifest.originali[f] = rec;

  // 1. runtime, agents, commands. Your edited config survives a reinstall.
  const cfgFile = join(t.runtime, 'config', 'regia.json');
  const userCfg = existsSync(cfgFile) ? readFileSync(cfgFile) : null;
  rmSync(t.runtime, { recursive: true, force: true });
  mkdirSync(t.runtime, { recursive: true });
  for (const part of RUNTIME_PARTS) {
    const from = join(SRC, part);
    if (existsSync(from)) cpSync(from, join(t.runtime, part), { recursive: true, filter: (p) => !/\/(node_modules|data)(\/|$)/.test(p) });
  }
  if (userCfg && !userCfg.equals(readFileSync(join(SRC, 'config', 'regia.json')))) {
    writeFileSync(join(t.runtime, 'config', 'regia.nuovo.json'), readFileSync(cfgFile)); // new defaults, for comparison
    writeFileSync(cfgFile, userCfg);
    plan.push(['config', 'tenuta la tua (nuova versione accanto: config/regia.nuovo.json)']);
  }
  writeJson(join(t.runtime, 'install.json'), { modalita: t.mode, progetto: t.projectDir, installatoIl: manifest.installatoIl, sorgente: SRC });

  rmSync(t.agentsDir, { recursive: true, force: true });
  mkdirSync(t.agentsDir, { recursive: true });
  for (const f of agents) copyFileSync(join(SRC, 'agents', f), join(t.agentsDir, f));

  const createdCommands = [];
  mkdirSync(t.commandsDir, { recursive: true });
  const commandSha = {};
  for (const c of cmdPlan) {
    if (c.foreign) continue;
    // {{REGIA}} becomes the absolute runtime path, so commands work from worktrees too
    const text = readFileSync(join(SRC, 'commands', c.f), 'utf8').replaceAll('{{REGIA}}', t.runtime);
    writeFileSync(c.dest, text);
    createdCommands.push(c.dest);
    commandSha[c.dest] = sha(Buffer.from(text));
  }
  for (const old of prev?.created?.commands || []) if (!createdCommands.includes(old)) rmSync(old, { force: true });
  manifest.created = { runtime: t.runtime, agents: t.agentsDir, commands: createdCommands, commandSha };

  // 2. settings merge
  const { settings, info } = mergeSettings(t, current, useMcpJson, prev);
  writeJson(t.settings, settings);
  writeJson(join(t.runtime, 'statusline', 'chain.json'), { comando: info.chain?.command || null });
  delete info.chain;
  manifest.settings = info;

  // 3. MCP servers
  manifest.mcp = { modo: useMcpJson ? 'mcp.json' : cli ? 'cli' : 'manuale', file: mcpJson };
  if (useMcpJson) {
    const m = currentMcp;
    m.mcpServers = m.mcpServers || {};
    for (const n of MCP_NAMES) m.mcpServers[n] = mcpSpec(t, n);
    writeJson(mcpJson, m);
  } else if (cli) {
    const scope = t.mode === 'globale' ? 'user' : 'local';
    for (const n of MCP_NAMES) {
      spawnSync(cli, ['mcp', 'remove', '--scope', scope, n], { cwd: t.projectDir || t.home, encoding: 'utf8' });
      const r = spawnSync(cli, ['mcp', 'add-json', '--scope', scope, n, JSON.stringify(mcpSpec(t, n))], { cwd: t.projectDir || t.home, encoding: 'utf8' });
      if (r.status !== 0) plan.push(['avviso MCP', `${n}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`]);
    }
    manifest.mcp.scope = scope;
  } else {
    plan.push(['MCP da aggiungere a mano', MCP_NAMES.map((n) => `claude mcp add-json ${n} '${JSON.stringify(mcpSpec(t, n))}'`).join(' ; ')]);
  }

  // 4. git exclude: REGIA files never show up in git status
  if (excludeFile) {
    // only files REGIA created: the visibility of your own files does not change
    const lines = ['/.claude/regia/', '/.claude/agents/regia/', ...createdCommands.map((c) => '/' + relative(t.projectDir, c))];
    if (!manifest.originali[t.settings]?.existed) lines.push('/.claude/settings.local.json');
    if (useMcpJson && !manifest.originali[mcpJson]?.existed) lines.push('/.mcp.json');
    const cur = stripExclude(readText(excludeFile) || '');
    const sep = cur && !cur.endsWith('\n') ? '\n' : '';
    mkdirSync(dirname(excludeFile), { recursive: true });
    writeFileSync(excludeFile, `${cur}${sep}${EXCLUDE_START}\n${lines.join('\n')}\n${EXCLUDE_END}\n`);
    manifest.exclude = excludeFile;
  }

  saveManifest(t, manifest);
  writeJson(join(t.runtime, 'manifest.json'), manifest);
  plan.push(['agenti', String(agents.length)], ['comandi', String(createdCommands.length)], ['backup', join(t.state, `backup-${ts}`)]);
  for (const w of warnings(t, isGit)) plan.push(['ATTENZIONE', w]);
  return { t, plan, manifest };
}

// Things that do not stop the install but that you must know.
export function warnings(t, isGit) {
  const out = [];
  if (t.mode === 'progetto' && !isGit) out.push('la cartella non è un repository git: lo sciame non funziona e i file di REGIA non vengono esclusi da git.');
  const v = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  const ver = v.status === 0 ? (v.stdout.match(/\d+\.\d+\.\d+/) || [])[0] : null;
  if (!ver) out.push('CLI claude non trovata nel PATH: installala o aggiornala prima di aprire il progetto.');
  else if (cmpVersion(ver, '2.1.283') < 0) out.push(`Claude Code ${ver}: REGIA è provata su 2.1.283 e 2.1.329. Aggiorna con: claude update`);
  for (const b of billingRisks(t.home)) out.push(b);
  return out;
}

export function cmpVersion(a, b) {
  const x = a.split('.').map(Number); const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

function stripExclude(text) {
  const re = new RegExp(`\\n?${EXCLUDE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?${EXCLUDE_END}\\n?`, 'g');
  return text.replace(re, (m) => (m.startsWith('\n') ? '\n' : ''));
}

// ---------------------------------------------------------------- uninstall

// After removing REGIA items, drop the containers that are now empty AND were not in your
// original file. Derived from the backup, not from flags: robust across REGIA versions.
const CONTAINERS = [['hooks'], ['permissions', 'allow'], ['permissions', 'additionalDirectories'], ['permissions'], ['enabledMcpjsonServers'], ['mcpServers']];
export function pruneCreated(obj, original) {
  const get = (o, path) => path.reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
  const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : v && typeof v === 'object' && !Object.keys(v).length);
  for (const path of CONTAINERS) {
    const v = get(obj, path);
    if (v === undefined || !isEmpty(v) || get(original, path) !== undefined) continue;
    const parent = path.length > 1 ? get(obj, path.slice(0, -1)) : obj;
    delete parent[path.at(-1)];
  }
  return obj;
}

function originalJson(orig) {
  if (!orig?.existed) return {};
  try { return JSON.parse(readFileSync(orig.backup, 'utf8')); } catch { return {}; }
}

// Restores the exact original bytes when the cleaned result equals the original content.
function restoreJson(path, cleaned, orig, { dropIfEmpty }) {
  if (orig?.existed) {
    const origText = readFileSync(orig.backup, 'utf8');
    let origObj = null; try { origObj = JSON.parse(origText); } catch { /* not json */ }
    if (origObj && sameJson(origObj, cleaned)) { writeFileSync(path, origText); return 'ripristinato identico'; }
    writeJson(path, cleaned); return 'ripulito (avevi fatto altre modifiche: tenute)';
  }
  if (dropIfEmpty && !Object.keys(cleaned).length) { rmSync(path, { force: true }); return 'rimosso (non esisteva)'; }
  writeJson(path, cleaned); return 'ripulito';
}

export function uninstall(opts) {
  const t = targets(opts);
  const m = loadManifest(t);
  const report = [];
  if (!m) return { t, report: [['stato', 'REGIA non risulta installata qui']] };
  const ts = stamp();
  backup(t, [t.settings, m.mcp?.file, m.exclude, m.mcp?.modo === 'cli' ? claudeJsonPath() : null].filter(Boolean), `pre-uninstall-${ts}`);

  // settings
  if (existsSync(t.settings)) {
    const orig = originalJson(m.originali[t.settings]);
    const cleaned = pruneCreated(stripRegia(readJsonStrict(t.settings), { ...m.settings, previousStatusLine: m.settings?.previousStatusLine || orig.statusLine }), orig);
    report.push(['settings', restoreJson(t.settings, cleaned, m.originali[t.settings], { dropIfEmpty: true })]);
  }

  // MCP
  if (m.mcp?.modo === 'mcp.json' && m.mcp.file && existsSync(m.mcp.file)) {
    const j = readJsonStrict(m.mcp.file);
    for (const n of MCP_NAMES) if (j.mcpServers) delete j.mcpServers[n];
    pruneCreated(j, originalJson(m.originali[m.mcp.file]));
    report.push(['.mcp.json', restoreJson(m.mcp.file, j, m.originali[m.mcp.file], { dropIfEmpty: true })]);
  } else if (m.mcp?.modo === 'cli') {
    const cli = claudeCli();
    for (const n of MCP_NAMES) if (cli) spawnSync(cli, ['mcp', 'remove', '--scope', m.mcp.scope, n], { cwd: t.projectDir || t.home, encoding: 'utf8' });
    report.push(['MCP', cli ? `rimossi da claude (scope ${m.mcp.scope})` : 'CLI claude assente: rimuovi a mano regia-memory e regia-local']);
  }

  // files REGIA created
  let kept = 0;
  for (const c of m.created?.commands || []) {
    const want = m.created.commandSha?.[c];
    if (existsSync(c) && want && sha(readFileSync(c)) !== want) { kept++; continue; } // edited by you: kept
    rmSync(c, { force: true });
  }
  if (kept) report.push(['comandi', `${kept} modificati da te: lasciati`]);
  const userConfig = join(t.runtime, 'config', 'regia.json');
  if (existsSync(userConfig)) copyFileSync(userConfig, join(t.state, `config-${ts}.json`));
  rmSync(t.agentsDir, { recursive: true, force: true });
  rmSync(t.runtime, { recursive: true, force: true });

  // exclude
  if (m.exclude && existsSync(m.exclude)) {
    const orig = m.originali[m.exclude];
    const cleaned = stripExclude(readFileSync(m.exclude, 'utf8'));
    const origText = orig?.existed ? readFileSync(orig.backup, 'utf8') : '';
    writeFileSync(m.exclude, cleaned === origText || cleaned.trim() === origText.trim() ? origText : cleaned);
    if (!orig?.existed && !cleaned.trim()) rmSync(m.exclude, { force: true });
    report.push(['git exclude', 'ripulito']);
  }

  // empty folders created by REGIA
  const tryRmdir = (d) => { try { if (existsSync(d) && !readdirSync(d).length) rmdirSync(d); } catch { /* not empty */ } };
  if (!m.cartellePrima?.agentsParent) tryRmdir(join(t.base, 'agents'));
  if (!m.cartellePrima?.commands) tryRmdir(t.commandsDir);
  if (!m.cartellePrima?.base) tryRmdir(t.base);

  rmSync(join(t.state, 'manifest.json'), { force: true });
  if (opts.purge) {
    rmSync(join(t.home, '.regia'), { recursive: true, force: true });
    report.push(['dati', 'cancellati (--purge)']);
  } else report.push(['dati e backup', `tenuti in ${join(t.home, '.regia')} (cancella con --purge)`]);
  return { t, report };
}

export function status(opts) {
  const t = targets(opts);
  const m = loadManifest(t);
  if (!m) return [['stato', 'non installata'], ['destinazione', t.base]];
  return [['stato', 'installata'], ['modalità', m.modalita], ['dal', m.installatoIl], ['aggiornata', m.aggiornatoIl], ['MCP', m.mcp?.modo], ['comandi', String(m.created?.commands?.length || 0)], ['backup', String(m.backup?.length || 0)]];
}

// ---------------------------------------------------------------- cli

function parseArgs(argv) {
  const o = { action: argv[0] || 'install' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--global') o.global = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--yes') o.yes = true;
    else if (a === '--purge') o.purge = true;
    else if (a === '--project') o.project = argv[++i];
    else if (!a.startsWith('-') && !o.project) o.project = a;
  }
  return o;
}

function table(rows) {
  const w = Math.max(...rows.map((r) => r[0].length));
  return rows.map(([k, v]) => `  ${k.padEnd(w)}  ${v}`).join('\n');
}

// realpath on both sides: on macOS the temp folder /var is a link to /private/var, and a plain
// comparison would skip the install without saying anything.
const realOrSame = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const isMain = Boolean(process.argv[1]) && realOrSame(process.argv[1]) === realOrSame(fileURLToPath(import.meta.url));
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  try {
    if (o.global && o.action === 'install' && !o.yes && !o.dryRun) {
      console.error('Installazione globale: serve la conferma esplicita (install.sh --global chiede, oppure --yes).');
      process.exit(3);
    }
    if (o.action === 'install') {
      const r = install(o);
      console.log(`REGIA ${r.dryRun ? 'installazione simulata' : 'installata'}\n${table(r.plan)}`);
      if (!r.dryRun) console.log('\nRiapri Claude Code nel progetto, poi /regia-test per la verifica.');
    } else if (o.action === 'uninstall') {
      const r = uninstall(o);
      console.log(`REGIA disinstallata\n${table(r.report)}`);
    } else if (o.action === 'status') {
      console.log(table(status(o)));
    } else {
      console.error('Uso: installer.mjs install|uninstall|status [--project DIR] [--global] [--dry-run] [--yes] [--purge]');
      process.exit(2);
    }
  } catch (e) {
    console.error(`Errore: ${e.message}`);
    process.exit(1);
  }
}
