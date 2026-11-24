'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const tmp = (name, c) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')), name); fs.writeFileSync(p, c); return p; };
const J = async (...x) => JSON.parse(await call(...x));

test('json-flatten / unflatten round trip', async () => {
  const src = { a: { b: [1, { c: 2 }], d: null }, e: [], f: 'x' };
  const flat = await J('json-flatten', [], {}, JSON.stringify(src));
  assert.deepStrictEqual(flat, { 'a.b[0]': 1, 'a.b[1].c': 2, 'a.d': null, e: [], f: 'x' });
  assert.deepStrictEqual(await J('json-unflatten', [], {}, JSON.stringify(flat)), src);
  await assert.rejects(call('json-flatten', [], {}, '{bad'), /JSON non valido/);
});
test('json-sort', async () => {
  assert.strictEqual(await call('json-sort', [], { indent: 0 }, '{"b":1,"a":{"z":1,"y":[{"d":1,"c":2}]}}'), '{"a":{"y":[{"c":2,"d":1}],"z":1},"b":1}');
});
test('csv2json con virgolette, delimitatori, tipi', async () => {
  const csv = 'nome,eta,nota\n"Rossi, Mario",42,"ha detto ""ciao"""\nBianchi,7,\n';
  assert.deepStrictEqual(await J('csv2json', [], { types: true }, csv), [{ nome: 'Rossi, Mario', eta: 42, nota: 'ha detto "ciao"' }, { nome: 'Bianchi', eta: 7, nota: '' }]);
  assert.deepStrictEqual(await J('csv2json', [], { delim: ';', 'no-header': true }, 'a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepStrictEqual(await J('csv2json', [], {}, 'a,b\r\n1,2\r\n'), [{ a: '1', b: '2' }]);
});
test('json2csv round trip', async () => {
  const data = [{ a: 1, b: 'x,y' }, { a: 2, c: 'q"r' }];
  const csv = await call('json2csv', [], {}, JSON.stringify(data));
  assert.strictEqual(csv, 'a,b,c\n1,"x,y",\n2,,"q""r"');
  assert.deepStrictEqual(await J('csv2json', [], {}, csv), [{ a: '1', b: 'x,y', c: '' }, { a: '2', b: '', c: 'q"r' }]);
});
test('json-query', async () => {
  const d = JSON.stringify({ u: [{ n: 'a', t: [1, 2] }, { n: 'b', t: [3] }] });
  assert.strictEqual(await call('json-query', ['u[0].n'], { file: tmp('d.json', d) }), 'a');
  assert.deepStrictEqual(await J('json-query', ['u[*].n'], {}, d), ['a', 'b']);
  assert.strictEqual(await call('json-query', ['u[-1].t[0]'], {}, d), '3');
  assert.strictEqual(await call('json-query', ['u[0].n', tmp('d.json', d)]), 'a');
});
test('env2json', async () => {
  const env = '# c\nA=1\nexport B="x y" # nota\nC=\'q#r\'\nD=senza # commento\nE="riga\\nnuova"\n';
  assert.deepStrictEqual(await J('env2json', [], {}, env), { A: '1', B: 'x y', C: 'q#r', D: 'senza', E: 'riga\nnuova' });
});
test('json-diff', async () => {
  const a = tmp('a.json', '{"x":1,"y":{"z":2},"k":[1,2]}'), b = tmp('b.json', '{"x":1,"y":{"z":3},"k":[1],"n":true}');
  assert.strictEqual(await call('json-diff', [a, b]), '~ y.z: 2 -> 3\n- k[1]: 2\n+ n: true');
  assert.strictEqual(await call('json-diff', [a, a]), 'Nessuna differenza');
});
test('jsonl', async () => {
  assert.deepStrictEqual(await J('jsonl', [], { to: 'array' }, '{"a":1}\n\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
  assert.strictEqual(await call('jsonl', [], { to: 'lines' }, '[{"a":1},{"a":2}]'), '{"a":1}\n{"a":2}');
  await assert.rejects(call('jsonl', [], {}, '{"a":1}\nxx'), /Riga 2/);
});
test('csv-stats', async () => {
  const r = await J('csv-stats', [], {}, 'nome,prezzo,qta\na,10,1\nb,20.5,2\nc,3,x\n');
  assert.deepStrictEqual(r.prezzo, { count: 3, sum: 33.5, mean: 11.1667, min: 3, max: 20.5, median: 10 });
  assert.strictEqual(r.qta.count, 2); assert.ok(!r.nome);
  assert.deepStrictEqual(Object.keys(await J('csv-stats', [], { col: 'qta' }, 'qta\n1\n2')), ['qta']);
  await assert.rejects(call('csv-stats', [], {}, 'a\nx'));
});
