'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call } = require('../src/core');

test('caesar', async () => {
  assert.strictEqual(await call('caesar', ['Hello, World!'], { shift: 13 }), 'Uryyb, Jbeyq!'); assert.strictEqual(await call('caesar', ['abc'], { shift: -1 }), 'zab'); assert.strictEqual(await call('caesar', ['Uryyb'], { shift: 13 }), 'Hello'); assert.strictEqual(await call('caesar', ['xyz']), 'abc');
});
test('morse', async () => {
  assert.strictEqual(await call('morse', ['SOS ok']), '... --- ... / --- -.-'); assert.strictEqual(await call('morse', ['... --- ... / --- -.-'], { decode: true }), 'SOS OK'); await assert.rejects(call('morse', ['é'])); await assert.rejects(call('morse', ['.-.-.-.-.-'], { decode: true }));
});
test('nato', async () => { assert.strictEqual(await call('nato', ['Ciao 4']), 'Charlie India Alfa Oscar / Four'); assert.strictEqual(await call('nato', ['è']), 'Echo'); });
test('word-freq', async () => {
  assert.strictEqual(await call('word-freq', ["Il gatto e il cane e il topo"], { top: 2 }), '    3  il\n    2  e'); assert.strictEqual(await call('word-freq', ['a bb ccc ccc'], { min: 2, top: 1 }), '    2  ccc');
});
test('reverse', async () => {
  assert.strictEqual(await call('reverse', ['ciao']), 'oaic'); assert.strictEqual(await call('reverse', ['uno due tre'], { by: 'words' }), 'tre due uno'); assert.strictEqual(await call('reverse', [], { by: 'lines' }, 'a\nb\nc'), 'c\nb\na'); assert.strictEqual(await call('reverse', ['a😀b']), 'b😀a');
});
test('deburr', async () => { assert.strictEqual(await call('deburr', ['Perché è così, Straße Ørsted']), 'Perche e cosi, Strasse Orsted'); });
test('number-to-words italiano', async () => {
  const it = n => call('number-to-words', [String(n)]);
  const cases = { 0: 'zero', 1: 'uno', 13: 'tredici', 21: 'ventuno', 28: 'ventotto', 33: 'trentatré', 80: 'ottanta', 100: 'cento', 101: 'centouno', 108: 'centootto', 123: 'centoventitré', 180: 'centottanta', 183: 'centottantatré', 999: 'novecentonovantanove',
    1000: 'mille', 1001: 'milleuno', 1003: 'milletré', 2000: 'duemila', 3000: 'tremila', 21000: 'ventunomila', 23000: 'ventitremila', 100000: 'centomila', 1000000: 'un milione', 2500000: 'due milioni cinquecentomila', 1234567: 'un milione duecentotrentaquattromilacinquecentosessantasette', 3000000000: 'tre miliardi', 23000000: 'ventitré milioni' };
  for (const [n, w] of Object.entries(cases)) assert.strictEqual(await it(n), w, n);
  await assert.rejects(it('-5')); await assert.rejects(call('number-to-words', ['1.5']));
});
test('number-to-words inglese', async () => {
  const en = n => call('number-to-words', [String(n)], { lang: 'en' });
  assert.strictEqual(await en(0), 'zero'); assert.strictEqual(await en(21), 'twenty-one'); assert.strictEqual(await en(100), 'one hundred'); assert.strictEqual(await en(1234567), 'one million two hundred thirty-four thousand five hundred sixty-seven'); assert.strictEqual(await en(1000000000), 'one billion'); await assert.rejects(call('number-to-words', ['1'], { lang: 'fr' }));
});
test('md-table', async () => {
  assert.strictEqual(await call('md-table', [], {}, 'nome,eta\n"Rossi, M",42\nBianchi|x,7'), '| nome     | eta |\n| -------- | --- |\n| Rossi, M | 42  |\n| Bianchi\\|x | 7   |'.replace('| nome     | eta |\n| -------- | --- |\n| Rossi, M | 42  |\n| Bianchi\\|x | 7   |', '| nome       | eta |\n| ---------- | --- |\n| Rossi, M   | 42  |\n| Bianchi\\|x | 7   |'));
  await assert.rejects(call('md-table', [], {}, ''));
});
test('sample-lines', async () => {
  const t = '1\n2\n3\n4\n5\n'; assert.strictEqual(await call('sample-lines', [], { n: 2 }, t), '1\n2'); assert.strictEqual(await call('sample-lines', [], { n: 2, mode: 'tail' }, t), '4\n5');
  const r = await call('sample-lines', [], { n: 3, mode: 'random', seed: 5 }, t); assert.strictEqual(r, await call('sample-lines', [], { n: 3, mode: 'random', seed: 5 }, t)); assert.strictEqual(new Set(r.split('\n')).size, 3); await assert.rejects(call('sample-lines', [], { mode: 'x' }, t));
});
test('join-lines', async () => {
  assert.strictEqual(await call('join-lines', [], { sep: ', ', quote: "'" }, 'a\n b \n\nc\n'), "'a', 'b', 'c'"); assert.strictEqual(await call('join-lines', [], {}, 'a\nb'), 'a,b');
});
