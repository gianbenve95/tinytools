'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
function repo(commits) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-git-')), g = (args, env = {}) => execFileSync('git', ['-C', d, '-c', 'user.name=Test', '-c', 'user.email=t@e.st', '-c', 'commit.gpgsign=false', ...args], { env: { ...process.env, ...env }, stdio: 'pipe' });
  g(['init', '-q']);
  for (const [date, msg, files, author] of commits) { for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); } g(['add', '-A']); g(['commit', '-q', '-m', msg, ...(author ? ['--author', author] : [])], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }); }
  return d;
}
// 2026-03-02 è lunedì
const R = () => repo([['2026-03-02T09:30:00+01:00', 'feat: primo', { 'a.txt': '1', 'big.bin': 'x'.repeat(5000) }], ['2026-03-03T09:45:00+01:00', 'fix(core): secondo', { 'a.txt': '2' }], ['2026-03-04T22:10:00+01:00', 'Aggiornato qualcosa.', { 'a.txt': '3', 'b.txt': 'b' }, 'Altra Persona <altra@e.st>'], ['2026-03-09T10:00:00+01:00', 'chore: dopo una pausa', { 'a.txt': '4' }]]);

test('git-authors', async () => { const r = await J('git-authors', [R()]); assert.deepStrictEqual(r.map(x => x.commits), [3, 1]); assert.match(r[1].author, /Altra Persona/); });
test('git-activity', async () => { const r = await J('git-activity', [R()]); assert.deepStrictEqual([r.byWeekday.lunedì, r.byWeekday.martedì, r.byWeekday.mercoledì, r.byWeekday.venerdì], [2, 1, 1, 0]); assert.deepStrictEqual(r.byHour, { '09': 2, '10': 1, '22': 1 }); });
test('git-hot-files', async () => { const o = (await call('git-hot-files', [R()], { top: 2 })).split('\n'); assert.match(o[0], /^\s+4  a\.txt/); assert.strictEqual(o.length, 2); });
test('git-big-files', async () => { assert.match((await call('git-big-files', [R()], { top: 1 })), /4\.9 KB  big\.bin/); });
test('git-stale-branches', async () => {
  const d = R(); execFileSync('git', ['-C', d, 'branch', 'vecchio', 'HEAD~3']); const now = Date.parse('2026-06-10T00:00:00Z') / 1000; const r = await J('git-stale-branches', [d], { days: 90, now }); assert.ok(r.length >= 1 && r.every(x => x.daysOld >= 90)); assert.match(await call('git-stale-branches', [d], { days: 90, now: Date.parse('2026-03-10T00:00:00Z') / 1000 }), /Nessun branch/);
});
test('git-unpushed senza upstream', async () => { assert.match(await call('git-unpushed', [R()]), /non ha un upstream/); });
test('git-unpushed con upstream', async () => {
  const d = R(), bare = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-bare-')); execFileSync('git', ['init', '-q', '--bare', bare]); const br = execFileSync('git', ['-C', d, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', d, 'remote', 'add', 'origin', bare]); execFileSync('git', ['-C', d, 'push', '-q', '-u', 'origin', br]); assert.strictEqual(await call('git-unpushed', [d]), 'Tutto inviato');
  fs.writeFileSync(path.join(d, 'n.txt'), 'n'); execFileSync('git', ['-C', d, 'add', '-A']); execFileSync('git', ['-C', d, '-c', 'user.name=T', '-c', 'user.email=t@e.st', 'commit', '-q', '-m', 'locale']); assert.match(await call('git-unpushed', [d]), /locale/);
});
test('git-commit-lint', async () => { const o = await call('git-commit-lint', [R()]); assert.match(o, /"Aggiornato qualcosa\.": non segue Conventional Commits, punto finale/); assert.match(o, /1 su 4 commit con problemi/); assert.ok(!o.includes('primo')); });
test('git-secrets-scan e mascheramento', async () => {
  const fake = 'AKIA' + 'ABCDEFGHIJKLMNOP', d = repo([['2026-03-02T09:00:00+01:00', 'init', { 'cfg.js': `const k = "${fake}";\nconst pw = { password: "supersegretissima123" };`, 'ok.txt': 'niente' }]]);
  const o = await call('git-secrets-scan', [d]); assert.match(o, /cfg\.js:1: AWS access key \(AKIA…20 car\.\)/); assert.match(o, /cfg\.js:2: Assegnazione sospetta/); assert.ok(!o.includes(fake) && !o.includes('supersegretissima')); assert.match(await call('git-secrets-scan', [repo([['2026-03-02T09:00:00+01:00', 'x', { 'a.txt': 'pulito' }]])]), /Nessun indizio/);
});
test('git-first-commit', async () => { const r = await J('git-first-commit', [R()], { now: '2026-03-12' }); assert.deepStrictEqual([r.firstCommit, r.ageDays, r.totalCommits, r.message], ['2026-03-02', 10, 4, 'feat: primo']); });
test('git-streak', async () => { const r = await J('git-streak', [R()], { today: '2026-03-10' }); assert.deepStrictEqual([r.longest, r.current, r.activeDays], [3, 1, 4]); assert.strictEqual((await J('git-streak', [R()], { today: '2026-03-20' })).current, 0); });
test('errori: non è un repository', async () => { await assert.rejects(call('git-authors', [fs.mkdtempSync(path.join(os.tmpdir(), 'tt-nogit-'))]), /Non è un repository Git/); });
