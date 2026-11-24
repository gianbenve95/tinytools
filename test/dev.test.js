'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
const tmp = (name, c) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')), name); fs.writeFileSync(p, c); return p; };

test('semver', async () => {
  const s = (...x) => call('semver', x);
  assert.strictEqual(await s('compare', '1.2.3', '1.10.0'), '-1'); assert.strictEqual(await s('compare', '2.0.0', '2.0.0'), '0'); assert.strictEqual(await s('compare', '1.0.0', '1.0.0-rc.1'), '1');
  assert.strictEqual(await s('compare', '1.0.0-alpha', '1.0.0-alpha.1'), '-1'); assert.strictEqual(await s('compare', '1.0.0-2', '1.0.0-10'), '-1'); assert.strictEqual(await s('compare', 'v1.0.0', '1.0.0+build'), '0');
  assert.strictEqual(await s('bump', '1.2.3', 'minor'), '1.3.0'); assert.strictEqual(await s('bump', '1.2.3', 'major'), '2.0.0'); assert.strictEqual(await s('bump', '1.2.3', 'patch'), '1.2.4'); assert.strictEqual(await s('bump', '1.2.3-rc.1', 'patch'), '1.2.3');
  assert.strictEqual(await s('satisfies', '1.4.0', '^1.2.0'), 'true'); assert.strictEqual(await s('satisfies', '2.0.0', '^1.2.0'), 'false'); assert.strictEqual(await s('satisfies', '0.2.5', '^0.2.1'), 'true'); assert.strictEqual(await s('satisfies', '0.3.0', '^0.2.1'), 'false');
  assert.strictEqual(await s('satisfies', '1.2.9', '~1.2.0'), 'true'); assert.strictEqual(await s('satisfies', '1.3.0', '~1.2.0'), 'false'); assert.strictEqual(await s('satisfies', '1.5.0', '>=1.2.0 <1.6.0'), 'true'); assert.strictEqual(await s('satisfies', '1.6.0', '>=1.2.0 <1.6.0'), 'false');
  await assert.rejects(s('compare', 'x', '1.0.0')); await assert.rejects(s('bump', '1.0.0', 'huge')); await assert.rejects(s('nope'));
});
test('regex-test', async () => {
  const r = await J('regex-test', ['(\\d+)-(?<b>\\d+)', '10-20 e 30-40']); assert.strictEqual(r.matches, 2); assert.deepStrictEqual(r.results[1], { match: '30-40', index: 8, groups: ['30', '40'], named: { b: '40' } });
  assert.strictEqual((await J('regex-test', ['a', 'aaa'], { flags: 'i' })).matches, 1); await assert.rejects(call('regex-test', ['(', 'x']), /Regex non valida/);
});
test('json-to-ts', async () => {
  const ts = await call('json-to-ts', [], { name: 'User' }, JSON.stringify({ id: 1, name: 'x', tags: ['a'], address: { city: 'R', zip: null }, items: [{ a: 1 }, { a: 2, b: true }], 'odd-key': 1, mixed: [1, 'a'] }));
  assert.match(ts, /interface User \{/); assert.match(ts, /id: number;/); assert.match(ts, /tags: string\[\];/); assert.match(ts, /address: Address;/); assert.match(ts, /interface Address \{\n {2}city: string;\n {2}zip: null;/);
  assert.match(ts, /items: ItemsItem\[\];/); assert.match(ts, /b\?: boolean;/); assert.match(ts, /"odd-key": number;/); assert.match(ts, /mixed: \(number \| string\)\[\];/);
  assert.strictEqual(await call('json-to-ts', [], {}, '[1,2]'), 'type Root = number[];'); await assert.rejects(call('json-to-ts', [], {}, '{'));
});
test('json-schema-infer', async () => {
  const s = await J('json-schema-infer', [], {}, '{"a":1,"b":[{"x":"s"},{"x":"t","y":1.5}],"c":null}');
  assert.strictEqual(s.properties.a.type, 'integer'); assert.deepStrictEqual(s.properties.b.items.required, ['x']); assert.strictEqual(s.properties.b.items.properties.y.type, 'number'); assert.deepStrictEqual(s.required, ['a', 'b', 'c']); assert.strictEqual(s.properties.c.type, 'null');
});
test('env-diff non rivela i valori', async () => {
  const a = tmp('a', 'A=1\nB=segreto1\nC=3'), b = tmp('b', 'B=segreto2\nC=3\nD=4'); const out = await call('env-diff', [a, b]);
  assert.deepStrictEqual(JSON.parse(out), { onlyInFirst: ['A'], onlyInSecond: ['D'], differentValues: ['B'] }); assert.ok(!out.includes('segreto'));
});
test('http-headers', async () => {
  const r = await J('http-headers', [], {}, 'HTTP/2 200 OK\r\nContent-Type: text/html\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\n\r\ncorpo: ignorato');
  assert.deepStrictEqual([r.status, r.headers['content-type'], r.headers['set-cookie']], [200, 'text/html', ['a=1', 'b=2']]); await assert.rejects(call('http-headers', [], {}, 'niente'));
});
test('cookie-parse', async () => {
  assert.deepStrictEqual(await J('cookie-parse', ['sid=abc; Path=/; HttpOnly; Max-Age=3600']), { cookies: { sid: 'abc' }, attributes: { path: '/', 'max-age': '3600' }, flags: ['httponly'] });
  assert.deepStrictEqual((await J('cookie-parse', ['a=1; b=2; c=x=y'], { request: true })).cookies, { a: '1', b: '2', c: 'x=y' });
});
test('query-string', async () => {
  assert.deepStrictEqual(await J('query-string', ['parse', 'https://x.it/p?a=1&b=due%20tre&a=3']), { a: ['1', '3'], b: 'due tre' }); assert.strictEqual(await call('query-string', ['build', '{"a":[1,3],"b":"x y"}']), 'a=1&a=3&b=x+y'); await assert.rejects(call('query-string', ['build', '{x']));
});
test('glob-test', async () => {
  const r = (await call('glob-test', ['src/**/*.{js,ts}', 'src/a.js', 'src/x/y/b.ts', 'src/c.css', 'a/src/a.js', 'README.md'])).split('\n'); assert.deepStrictEqual(r.map(l => l.slice(0, 2)), ['SI', 'SI', 'NO', 'NO', 'NO']);
  assert.match(await call('glob-test', ['file?.[ab]*', 'file1.a.txt', 'file12.a']), /^SI {1,2}file1\.a\.txt\nNO/); assert.match(await call('glob-test', ['*.md', 'x/README.md']), /^NO/);
});
test('line-endings', async () => {
  assert.deepStrictEqual(await J('line-endings', [], {}, 'a\r\nb\nc\rd'), { lf: 1, crlf: 1, cr: 1, style: 'LF+CRLF+CR' }); assert.strictEqual(await call('line-endings', [], { to: 'lf' }, 'a\r\nb\rc'), 'a\nb\nc'); assert.strictEqual(await call('line-endings', [], { to: 'crlf' }, 'a\nb'), 'a\r\nb');
  await assert.rejects(call('line-endings', [], { to: 'x' }, 'a'));
});
