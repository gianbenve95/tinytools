'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const tmp = (name, c) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')), name); fs.writeFileSync(p, c); return p; };

test('slugify', async () => {
  assert.strictEqual(await call('slugify', ['Ciao Mondo! È bello']), 'ciao-mondo-e-bello');
  assert.strictEqual(await call('slugify', ['  A  b '], { sep: '_' }), 'a_b');
});
test('textstats', async () => {
  const r = JSON.parse(await call('textstats', [], {}, 'Uno due tre. Quattro!\nCinque\n'));
  assert.deepStrictEqual([r.words, r.lines, r.sentences], [5, 2, 2]);
  assert.strictEqual(JSON.parse(await call('textstats', [], { wpm: 5 }, 'a b c d e')).readingTimeMinutes, 1);
});
test('dedupe-lines', async () => {
  assert.strictEqual(await call('dedupe-lines', [], {}, 'a\nb\na\nc\nb'), 'a\nb\nc');
  assert.strictEqual(await call('dedupe-lines', [], { 'ignore-case': true }, 'a\nA\nb'), 'a\nb');
});
test('sort-lines', async () => {
  assert.strictEqual(await call('sort-lines', [], { numeric: true }, '10\n9\n100\n'), '9\n10\n100');
  assert.strictEqual(await call('sort-lines', [], { reverse: true, unique: true }, 'b\na\nb'), 'b\na');
});
test('case-convert', async () => {
  const c = to => call('case-convert', ['someHTTPTextHere-ok'], { to });
  assert.strictEqual(await call('case-convert', ['hello world_foo'], { to: 'camel' }), 'helloWorldFoo');
  assert.strictEqual(await call('case-convert', ['helloWorldFoo'], { to: 'snake' }), 'hello_world_foo');
  assert.strictEqual(await call('case-convert', ['hello world'], { to: 'constant' }), 'HELLO_WORLD');
  assert.strictEqual(await call('case-convert', ['hello world'], { to: 'pascal' }), 'HelloWorld');
  assert.strictEqual(await call('case-convert', ['hello_world'], { to: 'title' }), 'Hello World');
  await assert.rejects(c('x'));
});
test('text-diff', async () => {
  const a = tmp('a.txt', 'uno\ndue\ntre'), b = tmp('b.txt', 'uno\ntre\nquattro');
  assert.strictEqual(await call('text-diff', [a, b]), '- due\n+ quattro');
});
test('wrap-text', async () => {
  assert.strictEqual(await call('wrap-text', [], { width: 10 }, 'aaa bbb ccc ddd eee'), 'aaa bbb\nccc ddd\neee');
});
test('strip-html', async () => {
  assert.strictEqual(await call('strip-html', [], {}, '<style>x{}</style><p>Ciao <b>mondo</b> &amp; co</p><script>alert(1)</script>'), 'Ciao mondo & co');
});
test('md-toc', async () => {
  const md = '# Titolo\n```\n# non titolo\n```\n## Sezione Uno\n## Sezione Uno\n### Sotto\n';
  assert.strictEqual(await call('md-toc', [], {}, md), '- [Titolo](#titolo)\n  - [Sezione Uno](#sezione-uno)\n  - [Sezione Uno](#sezione-uno-1)\n    - [Sotto](#sotto)');
  assert.ok(!(await call('md-toc', [], { max: 2 }, md)).includes('Sotto'));
});
test('lorem', async () => {
  const a = await call('lorem', [], { words: 20, seed: 7 });
  assert.strictEqual(a, await call('lorem', [], { words: 20, seed: 7 }));
  assert.strictEqual(a.split(' ').length, 20); assert.match(a, /^[A-Z].*\.$/);
});
