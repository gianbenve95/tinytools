// Installer tests: merge with existing config, idempotent reinstall, byte-identical uninstall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER = join(ROOT, 'scripts', 'installer.mjs');

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'regia-inst-'));
  const home = join(base, 'home');
  const proj = join(base, 'progetto');
  mkdirSync(home, { recursive: true });
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(home, '.gitconfig'), '[user]\n\tname = Prova\n\temail = prova@example.invalid\n[init]\n\tdefaultBranch = main\n');
  const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: join(home, '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1', CLAUDE_CONFIG_DIR: join(home, '.cc'), PATH: process.env.PATH };
  const sh = (cmd) => {
    const r = spawnSync('bash', ['-c', cmd], { cwd: proj, env, encoding: 'utf8' });
    assert.equal(r.status, 0, `${cmd}\n${r.stderr}`);
    return r.stdout;
  };
  const run = (...args) => {
    const r = spawnSync(process.execPath, [INSTALLER, ...args, '--project', proj], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, `installer ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
    return r.stdout;
  };
  sh('git init -q && echo "# prova" > README.md && git add . && git commit -qm iniziale');
  return { base, home, proj, env, sh, run, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

// path -> sha of every file in the project, .git/info/exclude included, git objects excluded
function snapshot(proj) {
  const out = {};
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const rel = relative(proj, p);
      if (rel === '.git') { walk(join(p, 'info')); continue; }
      if (statSync(p).isDirectory()) { out[rel + '/'] = 'dir'; walk(p); }
      else out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(proj);
  return out;
}

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cmds = (groups = []) => groups.flatMap((g) => g.hooks.map((h) => h.command));

test('progetto con configurazione esistente: merge, reinstall idempotente, uninstall identico', () => {
  const s = sandbox();
  try {
    mkdirSync(join(s.proj, '.claude'));
    // custom formatting (4 spaces, no final newline) to prove byte-identical restore
    const settingsText = JSON.stringify({
      permissions: { allow: ['Bash(npm test)'], deny: ['Read(./.env)'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mio-hook' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'echo fatto' }] }],
      },
      statusLine: { type: 'command', command: 'echo mia-status', padding: 1 },
      enabledMcpjsonServers: ['mio-server'],
    }, null, 4);
    writeFileSync(join(s.proj, '.claude', 'settings.local.json'), settingsText);
    writeFileSync(join(s.proj, '.mcp.json'), '{"mcpServers":{"mio-server":{"command":"npx","args":["mio"]}}}');
    const before = snapshot(s.proj);
    const statusBefore = s.sh('git status --porcelain');

    s.run('install');
    const st = json(join(s.proj, '.claude', 'settings.local.json'));
    assert.ok(cmds(st.hooks.PreToolUse).includes('echo mio-hook'), 'hook esistente tenuto');
    assert.ok(cmds(st.hooks.PreToolUse).some((c) => c.includes('/.claude/regia/hooks/guard.mjs')), 'guard aggiunto');
    assert.ok(cmds(st.hooks.Stop).includes('echo fatto'));
    assert.deepEqual(st.permissions.deny, ['Read(./.env)']);
    assert.ok(st.permissions.allow.includes('Bash(npm test)') && st.permissions.allow.includes('mcp__regia-memory'));
    assert.ok(st.statusLine.command.includes('statusline.mjs'));
    assert.equal(st.statusLine.padding, 1);
    assert.equal(json(join(s.proj, '.claude', 'regia', 'statusline', 'chain.json')).comando, 'echo mia-status');
    assert.deepEqual(st.enabledMcpjsonServers, ['mio-server', 'regia-memory', 'regia-local']);
    const mcp = json(join(s.proj, '.mcp.json'));
    assert.deepEqual(Object.keys(mcp.mcpServers), ['mio-server', 'regia-memory', 'regia-local']);
    assert.equal(s.sh('git status --porcelain'), statusBefore, 'i file di REGIA non compaiono in git status');
    const guardGroup = st.hooks.PreToolUse.find((g) => g.hooks[0].command.includes('guard.mjs'));
    assert.equal(guardGroup.hooks[0].onFailure, 'block');
    assert.equal(guardGroup.hooks[0].timeout, 10, 'timeout in secondi');

    const afterFirst = snapshot(s.proj);
    s.run('install');
    const afterSecond = snapshot(s.proj);
    for (const f of ['.claude/settings.local.json', '.mcp.json', '.git/info/exclude']) assert.equal(afterSecond[f], afterFirst[f], `reinstall idempotente: ${f}`);

    s.run('uninstall');
    assert.deepEqual(snapshot(s.proj), before, 'dopo uninstall il progetto è identico al byte');
    const state = readdirSync(join(s.home, '.regia', 'installazioni'));
    assert.equal(state.length, 1);
    assert.ok(readdirSync(join(s.home, '.regia', 'installazioni', state[0])).some((f) => f.startsWith('backup-')), 'backup con timestamp presenti');
  } finally { s.cleanup(); }
});

test('progetto vuoto: crea tutto, git status pulito, uninstall non lascia nulla', () => {
  const s = sandbox();
  try {
    const before = snapshot(s.proj);
    s.run('install');
    assert.ok(existsSync(join(s.proj, '.claude', 'agents', 'regia')));
    assert.equal(s.sh('git status --porcelain'), '', 'niente da committare');
    s.run('install'); // reinstall: the uninstall must still know what was created
    s.run('uninstall');
    assert.deepEqual(snapshot(s.proj), before);
    assert.ok(!existsSync(join(s.proj, '.claude')));
  } finally { s.cleanup(); }
});

test('modifica fatta da te dopo l\'installazione resta dopo uninstall', () => {
  const s = sandbox();
  try {
    s.run('install');
    const p = join(s.proj, '.claude', 'settings.local.json');
    const st = json(p);
    st.permissions.allow.push('Bash(npm run lint)');
    writeFileSync(p, JSON.stringify(st, null, 2));
    s.run('uninstall');
    const after = json(p);
    assert.deepEqual(after, { permissions: { allow: ['Bash(npm run lint)'] } });
  } finally { s.cleanup(); }
});

test('.mcp.json tracciato da git: non viene toccato, MCP via claude CLI (scope local)', { skip: spawnSync('claude', ['--version']).status !== 0 && 'CLI claude assente' }, () => {
  const s = sandbox();
  try {
    writeFileSync(join(s.proj, '.mcp.json'), '{\n  "mcpServers": {}\n}\n');
    mkdirSync(join(s.proj, '.claude', 'commands'), { recursive: true });
    writeFileSync(join(s.proj, '.claude', 'commands', 'stato.md'), 'comando mio\n');
    s.sh('git add . && git commit -qm "mcp e comando"');
    const before = snapshot(s.proj);
    s.run('install');
    assert.equal(readFileSync(join(s.proj, '.mcp.json'), 'utf8'), '{\n  "mcpServers": {}\n}\n');
    assert.equal(readFileSync(join(s.proj, '.claude', 'commands', 'stato.md'), 'utf8'), 'comando mio\n', 'comando non di REGIA non sovrascritto');
    const cj = json(join(s.home, '.cc', '.claude.json'));
    const projEntry = Object.entries(cj.projects || {}).find(([k]) => k.endsWith('progetto'))?.[1];
    assert.ok(projEntry?.mcpServers?.['regia-memory'], 'regia-memory registrato in scope local');
    s.run('uninstall');
    const cj2 = json(join(s.home, '.cc', '.claude.json'));
    const projEntry2 = Object.entries(cj2.projects || {}).find(([k]) => k.endsWith('progetto'))?.[1];
    assert.ok(!projEntry2?.mcpServers?.['regia-memory'], 'rimosso dopo uninstall');
    assert.deepEqual(snapshot(s.proj), before);
  } finally { s.cleanup(); }
});

test('installazione globale senza conferma rifiutata', () => {
  const s = sandbox();
  try {
    const r = spawnSync(process.execPath, [INSTALLER, 'install', '--global'], { env: s.env, encoding: 'utf8' });
    assert.equal(r.status, 3);
    assert.ok(!existsSync(join(s.home, '.claude', 'regia')));
  } finally { s.cleanup(); }
});

test('settings non validi: nessuna scrittura', () => {
  const s = sandbox();
  try {
    mkdirSync(join(s.proj, '.claude'));
    writeFileSync(join(s.proj, '.claude', 'settings.local.json'), '{ rotto');
    const r = spawnSync(process.execPath, [INSTALLER, 'install', '--project', s.proj], { env: s.env, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.equal(readFileSync(join(s.proj, '.claude', 'settings.local.json'), 'utf8'), '{ rotto');
  } finally { s.cleanup(); }
});

test('globale con --yes in una home di prova: merge su ~/.claude/settings.json e ripristino identico', { skip: spawnSync('claude', ['--version']).status !== 0 && 'CLI claude assente' }, () => {
  const s = sandbox();
  try {
    mkdirSync(join(s.home, '.claude'), { recursive: true });
    const original = '{\n  "model": "opus",\n  "permissions": { "allow": ["Bash(ls:*)"] },\n  "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "echo mio" } ] } ] }\n}\n';
    writeFileSync(join(s.home, '.claude', 'settings.json'), original);
    const r = spawnSync(process.execPath, [INSTALLER, 'install', '--global', '--yes'], { env: s.env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const st = json(join(s.home, '.claude', 'settings.json'));
    assert.equal(st.model, 'opus');
    assert.ok(cmds(st.hooks.Stop).includes('echo mio'));
    assert.ok(cmds(st.hooks.PreToolUse).some((c) => c.includes(join(s.home, '.claude', 'regia', 'hooks', 'guard.mjs'))));
    assert.ok(existsSync(join(s.home, '.claude', 'agents', 'regia', 'revisore.md')));
    const cj = json(join(s.home, '.cc', '.claude.json'));
    assert.ok(cj.mcpServers?.['regia-memory'], 'MCP in scope user');
    const u = spawnSync(process.execPath, [INSTALLER, 'uninstall', '--global'], { env: s.env, encoding: 'utf8' });
    assert.equal(u.status, 0, u.stderr);
    assert.equal(readFileSync(join(s.home, '.claude', 'settings.json'), 'utf8'), original, 'settings globali identici al byte');
    assert.ok(!existsSync(join(s.home, '.claude', 'regia')));
    assert.ok(!existsSync(join(s.home, '.claude', 'agents')));
    assert.ok(!json(join(s.home, '.cc', '.claude.json')).mcpServers?.['regia-memory']);
  } finally { s.cleanup(); }
});

test('manifest di una versione precedente (senza informazioni sui contenitori): uninstall pulito', () => {
  const s = sandbox();
  try {
    const before = snapshot(s.proj);
    s.run('install');
    const state = join(s.home, '.regia', 'installazioni', readdirSync(join(s.home, '.regia', 'installazioni'))[0], 'manifest.json');
    const m = json(state);
    m.settings = { permissionsAdded: m.settings.permissionsAdded, mcpjsonAdded: m.settings.mcpjsonAdded, dirsAdded: m.settings.dirsAdded };
    delete m.mcp.mcpServersCreated;
    writeFileSync(state, JSON.stringify(m));
    s.run('uninstall');
    assert.deepEqual(snapshot(s.proj), before);
  } finally { s.cleanup(); }
});

test('cartella home: l\'installazione di progetto viene rifiutata (diventerebbe globale)', () => {
  const s = sandbox();
  try {
    const r = spawnSync(process.execPath, [INSTALLER, 'install', '--project', s.home], { env: s.env, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /non nella cartella di un progetto/);
    assert.ok(!existsSync(join(s.home, '.claude')), 'nulla scritto in ~/.claude');
  } finally { s.cleanup(); }
});

test('guard: se non riesce a partire, il comando dell\'hook esce con 2 (blocco in ogni versione)', () => {
  const s = sandbox();
  try {
    s.run('install');
    const st = json(join(s.proj, '.claude', 'settings.local.json'));
    const cmd = st.hooks.PreToolUse.find((g) => g.hooks[0].command.includes('guard.mjs')).hooks[0].command;
    const broken = cmd.replace(/node "[^"]+"/, 'node "/non/esiste/guard.mjs"');
    const r = spawnSync('bash', ['-c', broken], { input: '{}', encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /REGIA: il guard non è partito/);
    const ok = spawnSync('bash', ['-c', cmd], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: s.proj }), encoding: 'utf8', env: s.env });
    assert.equal(ok.status, 0, 'quando parte, il guard decide da sé');
    s.run('uninstall');
  } finally { s.cleanup(); }
});

test('installazione già finita nella home (versione precedente): uninstall dalla home la toglie', async () => {
  const s = sandbox();
  try {
    mkdirSync(join(s.home, '.claude'), { recursive: true });
    const original = '{\n  "model": "opus"\n}\n';
    writeFileSync(join(s.home, '.claude', 'settings.local.json'), original);
    const before = readdirSync(join(s.home, '.claude')).sort();
    const prevHome = process.env.HOME;
    process.env.HOME = s.home;
    process.env.CLAUDE_CONFIG_DIR = join(s.home, '.cc');
    try {
      const { install } = await import('../scripts/installer.mjs');
      install({ project: s.home, _permettiHome: true }); // as the old version did
    } finally { process.env.HOME = prevHome; delete process.env.CLAUDE_CONFIG_DIR; }
    assert.ok(existsSync(join(s.home, '.claude', 'regia')));
    const r = spawnSync(process.execPath, [INSTALLER, 'uninstall', '--project', s.home], { env: s.env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readdirSync(join(s.home, '.claude')).sort(), before);
    assert.equal(readFileSync(join(s.home, '.claude', 'settings.local.json'), 'utf8'), original);
    assert.ok(!existsSync(join(s.home, '.mcp.json')));
  } finally { s.cleanup(); }
});

test('reinstallazione: la configurazione modificata da te resta', () => {
  const s = sandbox();
  try {
    s.run('install');
    const f = join(s.proj, '.claude', 'regia', 'config', 'regia.json');
    const mine = json(f);
    mine.ollama.url = 'http://host-a.local:11434, http://host-b.local:11434';
    mine.guard.extraAsk = ['\\breboot\\b'];
    writeFileSync(f, JSON.stringify(mine, null, 2));
    const out = s.run('install');
    assert.match(out, /tenuta la tua/);
    assert.equal(json(f).ollama.url, 'http://host-a.local:11434, http://host-b.local:11434');
    assert.deepEqual(json(f).guard.extraAsk, ['\\breboot\\b']);
    assert.ok(existsSync(join(s.proj, '.claude', 'regia', 'config', 'regia.nuovo.json')));
    s.run('uninstall');
  } finally { s.cleanup(); }
});
