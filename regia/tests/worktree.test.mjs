// Swarm worktrees: 3 parallel sub-tasks, ordered merge, conflict stop, report, cleanup, limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const HOME = mkdtempSync(join(tmpdir(), 'regia-wt-home-'));
process.env.HOME = HOME;
process.env.REGIA_DATA_DIR = join(HOME, 'data');
process.env.GIT_CONFIG_GLOBAL = join(HOME, '.gitconfig');
process.env.GIT_CONFIG_NOSYSTEM = '1';
writeFileSync(join(HOME, '.gitconfig'), '[user]\n\tname = Prova\n\temail = prova@example.invalid\n[init]\n\tdefaultBranch = main\n');
const { crea, esito, unisci, report, pulisci } = await import('../bin/worktree.mjs');

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'regia-wt-'));
  const sh = (c, cwd = dir) => { const r = spawnSync('bash', ['-c', c], { cwd, encoding: 'utf8', env: process.env }); assert.equal(r.status, 0, c + r.stderr); return r.stdout.trim(); };
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'src', 'b.js'), 'export const b = 1;\n');
  writeFileSync(join(dir, 'index.html'), '<title>x</title>\n');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  sh('git init -q && git add . && git commit -qm iniziale');
  mkdirSync(join(dir, 'node_modules', 'pacchetto'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'pacchetto', 'index.js'), 'x');
  return { dir, sh };
}

test('3 sotto-task in parallelo, merge ordinato pulito, report e pulizia', () => {
  const { dir, sh } = repo();
  const s = crea(dir, 'demo', ['bug', 'seo', 'test'], { agenti: ['sviluppatore', 'seo-tecnico', 'tester'], titoli: ['Bug del form', 'Meta tag', 'Test'] });
  assert.equal(s.base, 'regia/demo-lavoro', 'da main nasce un ramo di lavoro');
  assert.equal(sh('git rev-parse --abbrev-ref HEAD'), 'regia/demo-lavoro');
  const excludeBefore = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8');
  for (const t of s.sotto_task) {
    assert.ok(existsSync(t.percorso));
    assert.ok(existsSync(join(t.percorso, 'node_modules', 'pacchetto', 'index.js')), 'node_modules collegato');
    assert.equal(sh('git status --porcelain', t.percorso), '', 'il link non compare in git status');
  }
  const [bug, seo, tst] = s.sotto_task;
  writeFileSync(join(bug.percorso, 'src', 'a.js'), 'export const a = 2;\n');
  sh('git add . && git commit -qm "fix a"', bug.percorso);
  writeFileSync(join(seo.percorso, 'index.html'), '<title>x</title>\n<meta name="description" content="y">\n');
  sh('git add . && git commit -qm "meta"', seo.percorso);
  writeFileSync(join(tst.percorso, 'src', 'a.test.js'), 'test\n');
  sh('git add . && git commit -qm "test"', tst.percorso);
  for (const id of ['bug', 'seo', 'test']) esito('demo', id, { esito: 'completato', test: '3/3' });
  const res = unisci('demo', ['bug', 'seo', 'test']);
  assert.deepEqual(res.map((r) => r.esito), ['unito', 'unito', 'unito']);
  assert.equal(sh('cat src/a.js'), 'export const a = 2;');
  const rep = report('demo');
  assert.match(rep, /\| sotto-task \| agente \| esito \| file toccati \| test \| tempo \|/);
  assert.match(rep, /\| Bug del form \| sviluppatore \| completato \| src\/a\.js \| 3\/3 \|/);
  const clean = pulisci('demo');
  assert.equal(clean.length, 3);
  for (const t of s.sotto_task) assert.ok(!existsSync(t.percorso));
  assert.ok(!existsSync(dirname(s.sotto_task[0].percorso)), 'nessuna cartella vuota lasciata');
  assert.match(rep, /creato da main\)/);
  assert.equal(sh('git worktree list').split('\n').length, 1);
  assert.ok(existsSync(join(dir, 'node_modules', 'pacchetto', 'index.js')), 'la pulizia non tocca i pacchetti veri');
  assert.ok(!readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8').includes('REGIA sciame'), 'riga di exclude tolta');
  assert.ok(excludeBefore.includes('REGIA sciame'));
});

test('conflitto: il merge si ferma al primo, senza lasciare il repo a metà', () => {
  const { dir, sh } = repo();
  sh('git checkout -q -b lavoro');
  const s = crea(dir, 'conflitto', ['uno', 'due']);
  assert.equal(s.base, 'lavoro', 'se non sei su main resta il tuo ramo');
  writeFileSync(join(s.sotto_task[0].percorso, 'src', 'b.js'), 'export const b = 2;\n');
  sh('git commit -qam uno', s.sotto_task[0].percorso);
  writeFileSync(join(s.sotto_task[1].percorso, 'src', 'b.js'), 'export const b = 3;\n');
  sh('git commit -qam due', s.sotto_task[1].percorso);
  const res = unisci('conflitto');
  assert.deepEqual(res.map((r) => r.esito), ['unito', 'conflitto']);
  assert.equal(sh('git status --porcelain'), '', 'merge annullato, albero pulito');
  pulisci('conflitto');
});

test('limiti: massimo 3 sotto-task e niente worktree con modifiche non committate', () => {
  const { dir } = repo();
  assert.throws(() => crea(dir, 'troppi', ['a', 'b', 'c', 'd']), /Massimo 3/);
  writeFileSync(join(dir, 'src', 'a.js'), 'modificato\n');
  assert.throws(() => crea(dir, 'sporco', ['a']), /non committate/);
});
