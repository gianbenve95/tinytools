'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
function repo(commits, tagAfter = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-git2-')), g = (args, env = {}) => execFileSync('git', ['-C', d, '-c', 'user.name=Test', '-c', 'user.email=t@e.st', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { env: { ...process.env, ...env }, stdio: 'pipe' });
  g(['init', '-q']);
  commits.forEach(([date, msg, files, author], i) => { for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); } g(['add', '-A']); g(['commit', '-q', '-m', msg, ...(author ? ['--author', author] : [])], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }); if (tagAfter[i]) g(['tag', '-a', tagAfter[i], '-m', tagAfter[i]], { GIT_COMMITTER_DATE: date }); });
  return d;
}
const R = () => repo([
  ['2026-03-02T09:00:00+01:00', 'feat: base', { 'src/a.js': '1', 'src/b.js': '1', 'docs/d.md': '1', 'README.md': 'r' }],
  ['2026-03-03T09:00:00+01:00', 'fix(core): bug', { 'src/a.js': '2' }, 'Bea <b@e.st>'],
  ['2026-03-04T09:00:00+01:00', 'docs: guida', { 'docs/d.md': '2' }],
  ['2026-03-10T09:00:00+01:00', 'feat(ui)!: nuova ui', { 'src/a.js': '3', 'src/c.js': '3' }],
  ['2026-03-11T09:00:00+01:00', 'sistemato qualcosa', { 'src/a.js': '4' }, 'Bea <b@e.st>'],
], { 2: 'v1.0.0' });

test('git-changelog', async () => {
  const c = await call('git-changelog', [R()]); assert.match(c, /^## Da v1\.0\.0 \(2 commit\)/); assert.match(c, /### Novità\n- \*\*ui:\*\* nuova ui ⚠️ \*\*BREAKING\*\* \(/); assert.match(c, /### Altro\n- sistemato qualcosa/); assert.ok(!c.includes('guida'));
  const all = await call('git-changelog', [R()], { from: 'v1.0.0', to: 'HEAD' }); assert.match(all, /2 commit/); const full = await call('git-changelog', [repo([['2026-03-02T09:00:00+01:00', 'feat: x', { a: '1' }], ['2026-03-03T09:00:00+01:00', 'fix: y', { a: '2' }]])]); assert.match(full, /Storico completo \(2 commit\)/); assert.match(full, /### Novità/); assert.match(full, /### Correzioni/);
});
test('git-conflict-markers', async () => { assert.strictEqual(await call('git-conflict-markers', [R()]), 'Nessun marcatore di conflitto'); const d = repo([['2026-03-02T09:00:00+01:00', 'x', { 'a.txt': 'ok\n<<<<<<< HEAD\nuno\n=======\ndue\n>>>>>>> ramo\n', 'b.txt': 'a == b\n=== ok\n' }]]); assert.strictEqual(await call('git-conflict-markers', [d]), 'a.txt:2: <<<<<<<\na.txt:4: =======\na.txt:6: >>>>>>>'); });
test('git-large-commits', async () => { const o = (await call('git-large-commits', [R()], { top: 2 })).split('\n'); assert.match(o[0], /^\s+4 file\s+\+4\/-0\s+\w+\s+feat: base/); assert.match(o[1], /^\s+2 file/); assert.strictEqual(o.length, 2); });
test('git-author-span', async () => { const r = await J('git-author-span', [R()]); assert.deepStrictEqual(r.map(x => [x.author, x.commits, x.activeDays, x.first, x.last]), [['Test', 3, 3, '2026-03-02', '2026-03-10'], ['Bea', 2, 2, '2026-03-03', '2026-03-11']]); });
test('git-file-history', async () => { const d = R(), r = await J('git-file-history', ['src/a.js'], { repo: d }); assert.deepStrictEqual([r.commits, r.authors, r.firstCommit, r.lastCommit], [4, { Test: 2, Bea: 2 }, '2026-03-02', '2026-03-11']); assert.strictEqual(r.recent[0].subject, 'sistemato qualcosa'); await assert.rejects(call('git-file-history', ['nope.txt'], { repo: d }), /Nessuna storia/); await assert.rejects(call('git-file-history', [], { repo: d })); });
test('git-tags', async () => { const t = await J('git-tags', [R()]); assert.deepStrictEqual(t, [{ tag: 'v1.0.0', date: t[0].date, commitsSincePrevious: 3 }]); assert.strictEqual(await call('git-tags', [repo([['2026-03-02T09:00:00+01:00', 'x', { a: '1' }]])]), 'Nessun tag'); });
test('git-commit-size', async () => { const r = await J('git-commit-size', [R()]); assert.deepStrictEqual([r.commits, r.averageFiles, r.distribution], [5, 1.8, { '1 file': 3, '2-5 file': 2, '6-20 file': 0, 'oltre 20 file': 0 }]); });
test('git-bus-factor', async () => { const r = await J('git-bus-factor', [R()]); assert.deepStrictEqual(r.overall, { busFactor: 1, authors: 2 }); assert.strictEqual(r.byDirectory.src.authors, 2); assert.strictEqual(r.byDirectory.docs.busFactor, 1); const solo = await J('git-bus-factor', [repo([['2026-03-02T09:00:00+01:00', 'x', { 'a/b.txt': '1' }]])]); assert.strictEqual(solo.overall.busFactor, 1); });
test('git-dir-churn', async () => { assert.strictEqual(await call('git-dir-churn', [R()]), '    4  src\n    2  docs\n    1  (radice)'); assert.strictEqual(await call('git-dir-churn', [R()], { since: '2026-03-09T00:00:00+01:00' }), '    2  src'); });
test('git-weekly', async () => { const o = (await call('git-weekly', [R()])).split('\n'); assert.deepStrictEqual(o.map(l => l.split(/\s+/)[0]), ['2026-W10', '2026-W11']); assert.match(o[0], /█+ 3$/); assert.match(o[1], /█+ 2$/); assert.ok(o[0].split('█').length - 1 > o[1].split('█').length - 1); assert.strictEqual((await call('git-weekly', [R()], { weeks: 1 })).split('\n').length, 1); });
