'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
const tmp = (name, c) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-jt-')), name); fs.writeFileSync(p, typeof c === 'string' ? c : JSON.stringify(c)); return p; };

test('json-merge', async () => {
  const a = tmp('a.json', { x: 1, o: { p: 1, q: [1] }, k: 'a' }), b = tmp('b.json', { o: { q: [2], r: 3 }, k: null }), c = tmp('c.json', { z: 9 });
  assert.deepStrictEqual(await J('json-merge', [a, b, c]), { x: 1, o: { p: 1, q: [2], r: 3 }, k: null, z: 9 }); assert.deepStrictEqual((await J('json-merge', [a, b], { arrays: 'concat' })).o.q, [1, 2]); await assert.rejects(call('json-merge', [])); await assert.rejects(call('json-merge', [tmp('bad.json', '{')]));
});
test('json-pick / json-omit', async () => {
  const d = { nome: 'A', pw: 'x', ind: { citta: 'R', cap: '1' }, l: [1, { a: 2 }] };
  assert.deepStrictEqual(await J('json-pick', [], { paths: 'nome,ind.citta,l[1].a,nope' }, JSON.stringify(d)), { nome: 'A', ind: { citta: 'R' }, l: [null, { a: 2 }].slice(0, 0).concat([undefined, { a: 2 }]).map(x => x === undefined ? null : x) });
  assert.deepStrictEqual(await J('json-omit', [], { paths: 'pw,ind.cap,l[0]' }, JSON.stringify(d)), { nome: 'A', ind: { citta: 'R' }, l: [{ a: 2 }] }); await assert.rejects(call('json-omit', [], {}, '{}'));
});
test('json-fmt', async () => { assert.strictEqual(await call('json-fmt', [], { minify: true }, '{ "a" : [1, 2] }'), '{"a":[1,2]}'); assert.strictEqual(await call('json-fmt', [], { indent: 4 }, '{"a":1}'), '{\n    "a": 1\n}'); assert.strictEqual(await call('json-fmt', [], { tabs: true }, '{"a":1}'), '{\n\t"a": 1\n}'); await assert.rejects(call('json-fmt', [], {}, '{')); });
test('json-validate', async () => {
  const schema = tmp('s.json', { type: 'object', required: ['nome', 'eta'], additionalProperties: false, properties: { nome: { type: 'string', minLength: 2, pattern: '^[A-Z]' }, eta: { type: 'integer', minimum: 0, maximum: 150 }, ruolo: { enum: ['admin', 'user'] }, tags: { type: 'array', items: { type: 'string' }, maxItems: 2 }, x: { anyOf: [{ type: 'string' }, { type: 'null' }] } } });
  assert.deepStrictEqual(await J('json-validate', [tmp('ok.json', { nome: 'Ann', eta: 30, ruolo: 'user', tags: ['a'], x: null })], { schema }), { valid: true, errors: [] });
  const bad = await J('json-validate', [tmp('bad.json', { nome: 'a', eta: 200.5, ruolo: 'boss', tags: ['a', 2, 'c'], x: 5, extra: 1 })], { schema }); const e = bad.errors.join('\n'); assert.strictEqual(bad.valid, false);
  for (const s of ['nome: più corto di 2', 'nome: non rispetta il pattern', 'eta: atteso integer, trovato number', 'ruolo: valore non ammesso', 'tags: più di 2 elementi', 'tags[1]: atteso string, trovato integer', 'x: non corrisponde a nessuna alternativa', 'extra: proprietà non prevista']) assert.ok(e.includes(s), s);
  assert.ok((await J('json-validate', [tmp('m.json', {})], { schema })).errors.some(x => x.includes('nome: campo obbligatorio mancante'))); await assert.rejects(call('json-validate', [tmp('x.json', {})], {}));
});
test('json-stats', async () => { const r = await J('json-stats', [], {}, '{"a":[1,2,{"b":null}],"c":"x"}'); assert.deepStrictEqual([r.depth, r.totalKeys, r.longestArray, r.valueTypes.integer, r.valueTypes.null], [4, 3, 3, 2, 1]); });
test('json-keys', async () => { assert.strictEqual(await call('json-keys', [], {}, '{"a":{"b":1},"l":[{"x":1},{"x":"s","y":true}]}'), 'a  object\na.b  integer\nl  array\nl[]  object\nl[].x  integer|string\nl[].y  boolean'); });
test('json-redact', async () => {
  const r = await J('json-redact', [], { keys: 'matricola' }, '{"user":"a","Password":"p","cfg":{"api_key":"k","authorization":"Bearer x","ok":1},"l":[{"token":"t"}],"matricola":"123","session":{"id":1}}'); assert.deepStrictEqual(r, { user: 'a', Password: '***', cfg: { api_key: '***', authorization: '***', ok: 1 }, l: [{ token: '***' }], matricola: '***', session: { id: 1 } });
});
test('json-filter', async () => {
  const d = [{ n: 'Ann', eta: 30, c: { nome: 'Roma' } }, { n: 'Bob', eta: 17, c: { nome: 'Rimini' } }, { n: 'Cy', eta: 40, c: { nome: 'Pisa' } }]; const s = JSON.stringify(d);
  assert.deepStrictEqual((await J('json-filter', [], { where: 'eta>=18 && c.nome~^R' }, s)).map(x => x.n), ['Ann']); assert.deepStrictEqual((await J('json-filter', [], { where: 'n*=o' }, s)).map(x => x.n), ['Bob']); assert.deepStrictEqual((await J('json-filter', [], { where: 'eta=40', path: 'p' }, JSON.stringify({ p: d }))).map(x => x.n), ['Cy']); assert.deepStrictEqual(await J('json-filter', [], { where: 'zzz=1' }, s), []);
  await assert.rejects(call('json-filter', [], { where: 'eta>1' }, '{"a":1}')); await assert.rejects(call('json-filter', [], { where: '???' }, s));
});
test('json-group', async () => { const d = JSON.stringify([{ c: 'x', p: 10 }, { c: 'y', p: 5.5 }, { c: 'x', p: 2 }, { c: 'x', p: 1 }]); assert.deepStrictEqual(await J('json-group', [], { by: 'c' }, d), { x: 3, y: 1 }); assert.deepStrictEqual(await J('json-group', [], { by: 'c', sum: 'p' }, d), { x: { count: 3, sum: 13 }, y: { count: 1, sum: 5.5 } }); await assert.rejects(call('json-group', [], {}, d)); });
