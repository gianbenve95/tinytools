// The scripts behind the slash commands, run as processes the way Claude Code runs them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, symlinkSync, linkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = { ...process.env, REGIA_DATA_DIR: mkdtempSync(join(tmpdir(), 'regia-bin-')), REGIA_OLLAMA_URL: 'http://127.0.0.1:9', HOME: mkdtempSync(join(tmpdir(), 'regia-bin-home-')) };
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) delete ENV[k];
const run = (script, args = []) => spawnSync(process.execPath, [join(ROOT, 'bin', script), ...args], { env: ENV, encoding: 'utf8', timeout: 30000 });

test('/regia-test: tutti i controlli senza righe NO e senza errori', () => {
  const r = run('autotest.mjs');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /\| guard \(6 casi\) \| ok \|/);
  assert.match(r.stdout, /\| MCP regia-memory \| ok \|/);
  assert.match(r.stdout, /\| MCP regia-local \| ok \|/);
  assert.match(r.stdout, /\| agenti \(11\) \| ok \|/);
  assert.ok(!/\| NO \|/.test(r.stdout), r.stdout);
});

test('/stato e /costi: tabelle senza errori anche senza dati', () => {
  const s = run('stato.mjs');
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /\| voce \| stato \|/);
  assert.match(s.stdout, /Qwen locale\s+\| off/);
  const c = run('costi.mjs');
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /\| oggi \| 0 \|/);
});

test('memoria da terminale: salva, cerca, dimentica, rifiuta segreti', () => {
  const a = run('memoria.mjs', ['salva', 'vincolo', 'Deploy solo da PR con preview verde', '--progetto', 'prova']);
  assert.match(a.stdout, /Salvato \(id \d+, vincolo, prova\)/);
  const id = a.stdout.match(/id (\d+)/)[1];
  assert.match(run('memoria.mjs', ['cerca', 'preview', '--progetto', 'prova']).stdout, new RegExp(`\\[${id}\\]`));
  assert.match(run('memoria.mjs', ['dimentica', id]).stdout, /Cancellato/);
  const bad = run('memoria.mjs', ['salva', 'stato', 'token', 'ghp_' + 'Q'.repeat(36)]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Non salvo segreti/);
});

test('/regia-test segnala la chiave API a pagamento senza mostrarne il valore', () => {
  const key = 'sk-ant-api03-' + 'Z'.repeat(40);
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'autotest.mjs')], { env: { ...ENV, ANTHROPIC_API_KEY: key }, encoding: 'utf8', timeout: 30000 });
  assert.match(r.stdout, /\| abbonamento, non API a pagamento \| NO \| la variabile ANTHROPIC_API_KEY è impostata/);
  assert.ok(!r.stdout.includes(key), 'il valore non compare mai');
});

test('prova.sh si ferma senza toccare nulla: cartella home e chiave API', () => {
  const home = mkdtempSync(join(tmpdir(), 'regia-prova-home-'));
  spawnSync('git', ['init', '-q'], { cwd: home });
  const r1 = spawnSync('bash', [join(ROOT, 'prova.sh'), home], { env: { ...ENV, HOME: home }, encoding: 'utf8', timeout: 30000 });
  assert.equal(r1.status, 1);
  assert.match(r1.stdout, /Cartella\s+NO\s+è la home/);
  const proj = mkdtempSync(join(tmpdir(), 'regia-prova-proj-'));
  spawnSync('git', ['init', '-q'], { cwd: proj });
  const r2 = spawnSync('bash', [join(ROOT, 'prova.sh'), proj], { env: { ...ENV, ANTHROPIC_API_KEY: 'finta' }, encoding: 'utf8', timeout: 30000 });
  assert.equal(r2.status, 1);
  assert.match(r2.stdout, /Fatturazione\s+NO\s+ANTHROPIC_API_KEY/);
  assert.ok(!r2.stdout.includes('finta'), 'il valore non compare');
  assert.equal(spawnSync('git', ['branch', '--show-current'], { cwd: proj, encoding: 'utf8' }).stdout.trim() === 'prova/regia', false, 'nessun ramo creato');
});

test('controlla.mjs: il guard da qualsiasi linguaggio, con codici di uscita', () => {
  const c = (...args) => spawnSync(process.execPath, [join(ROOT, 'bin', 'controlla.mjs'), ...args], { env: ENV, encoding: 'utf8' });
  const ok = c('bash', 'ls -la');
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).decisione, 'allow');
  const mail = c('tool', 'mcp__Microsoft_365__outlook_send_mail', '{"to":"cliente@example.com"}');
  assert.equal(mail.status, 1);
  assert.equal(JSON.parse(mail.stdout).regola, 'mail');
  const rm = c('bash', 'rm -rf /');
  assert.equal(rm.status, 2);
  const key = 'ghp_' + 'K'.repeat(36);
  const f = spawnSync(process.execPath, [join(ROOT, 'bin', 'controlla.mjs'), 'file', '/tmp/x/config.py'], { env: ENV, encoding: 'utf8', input: `TOKEN = "${key}"` });
  assert.equal(f.status, 2);
  assert.ok(!f.stdout.includes(key));
  assert.equal(c('tool', 'mcp__x__y', '{non json').status, 2, 'input rotto: blocco');
  assert.equal(c('boh').status, 3);
});

const runAsync = (cmd, args, opts) => new Promise((res) => {
  const c = spawn(cmd, args, opts);
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (status) => res({ status, out }));
});

test('percorso con link simbolico (es. /var -> /private/var su macOS): guard, controlla.mjs e installer lavorano lo stesso', () => {
  const link = join(mkdtempSync(join(tmpdir(), 'regia-link-')), 'regia');
  symlinkSync(ROOT, link, 'dir');
  const rm = spawnSync(process.execPath, [join(link, 'bin', 'controlla.mjs'), 'bash', 'rm -rf /'], { env: ENV, encoding: 'utf8' });
  assert.equal(rm.status, 2, 'controlla.mjs dal link: rm -rf / bloccato, non lasciato passare');
  const hook = spawnSync(process.execPath, [join(link, 'hooks', 'guard.mjs')], {
    env: ENV, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' }, cwd: tmpdir() }),
  });
  assert.match(hook.stdout, /"permissionDecision":"deny"/, 'il hook del guard dal link risponde deny');
  const proj = mkdtempSync(join(tmpdir(), 'regia-link-proj-'));
  const inst = spawnSync(process.execPath, [join(link, 'scripts', 'installer.mjs'), 'install', '--project', proj, '--dry-run'], { env: ENV, encoding: 'utf8' });
  assert.equal(inst.status, 0, inst.stderr);
  assert.ok(inst.stdout.trim().length > 0, "l'installer dal link scrive cosa farebbe, non resta muto");
});

test('guard e controlla.mjs non restano muti nemmeno se il confronto dei percorsi non riesce (es. maiuscole su macOS)', (t) => {
  // A hard link: another path, same file. Path comparison fails (as with letter case on macOS);
  // before, the script exited 0 in silence, which for the guard means "allow".
  const dir = mkdtempSync(join(tmpdir(), 'regia-hard-'));
  const hard = join(dir, 'guard.mjs');
  try { linkSync(join(ROOT, 'hooks', 'guard.mjs'), hard); } catch (e) { t.skip(`link fisico non possibile qui (${e.code})`); return; }
  const code = `process.argv[1] = ${JSON.stringify(hard)}; await import(${JSON.stringify(join(ROOT, 'hooks', 'guard.mjs'))});`;
  const g = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: ENV, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' }, cwd: tmpdir() }),
  });
  assert.match(g.stdout, /"permissionDecision":"deny"/, g.stderr);
});

test('uno script di qualcun altro chiamato guard.mjs che importa il guard non lo fa partire una seconda volta', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regia-wrap-'));
  writeFileSync(join(dir, 'guard.mjs'), `import { decide } from ${JSON.stringify(join(ROOT, 'hooks', 'guard.mjs'))};\nconst r = decide({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' }, cwd: '/tmp' }, { branch: 'lavoro' });\nprocess.stdout.write(JSON.stringify({ mio: r.decision }));\n`);
  const r = spawnSync(process.execPath, [join(dir, 'guard.mjs')], { env: ENV, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: tmpdir() }) });
  assert.equal(r.stdout, '{"mio":"deny"}', 'solo la sua uscita, un JSON solo');
});

test('prova.sh: abbonamento riconosciuto, chiave API e metodi sconosciuti fermati', () => {
  const casi = [
    ['{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max","apiProvider":"firstParty"}', /Login\s+ok\s+abbonamento \(claude\.ai\)/],
    ['{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}', /Login\s+ok\s+abbonamento \(oauth_token\)/],
    ['{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}', /Login\s+!!\s+Login claude\.ai senza abbonamento/],
    ['{"loggedIn":true,"authMethod":"api_key","apiProvider":"firstParty"}', /Fatturazione\s+NO\s+Metodo api_key/],
    ['{"loggedIn":true,"authMethod":"metodo_nuovo","subscriptionType":"max","apiProvider":"firstParty"}', /Fatturazione\s+NO\s+Metodo metodo_nuovo/],
  ];
  for (const [auth, atteso] of casi) {
    const home = mkdtempSync(join(tmpdir(), 'regia-auth-'));
    const bin = join(home, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\ncase "$1" in --version) echo "2.1.329 (Claude Code)";; auth) echo '${auth}';; esac\n`, { mode: 0o755 });
    // The home folder as project: prova.sh prints its checks and stops before installing anything.
    const r = spawnSync('bash', [join(ROOT, 'prova.sh'), home], { env: { ...ENV, HOME: home, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8', timeout: 30000 });
    assert.match(r.stdout, atteso, r.stdout);
    assert.equal(r.status, 1);
  }
});
