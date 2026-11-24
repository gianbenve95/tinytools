'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
const tmp = (name, c) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ln-')), name); fs.writeFileSync(p, c); return p; };
const T = 'mela\nPera\nmela rossa\n\nbanana\nmela';

test('grep-lite', async () => {
  assert.strictEqual(await call('grep-lite', ['^mela'], {}, T), 'mela\nmela rossa\nmela'); assert.strictEqual(await call('grep-lite', ['pera'], { 'ignore-case': true, n: true }, T), '2:Pera'); assert.strictEqual(await call('grep-lite', ['mela'], { invert: true, count: true }, T), '3'); assert.strictEqual(await call('grep-lite', ['a.b'], { fixed: true }, 'a.b\naxb'), 'a.b'); assert.strictEqual(await call('grep-lite', ['banana'], { file: tmp('f.txt', T) }), 'banana');
  await assert.rejects(call('grep-lite', ['('], {}, T)); await assert.rejects(call('grep-lite', [], {}, T));
});
test('replace', async () => {
  assert.strictEqual(await call('replace', ['a.b', 'X'], {}, 'a.b axb a.b'), 'X axb X'); assert.strictEqual(await call('replace', ['a.b', 'X'], { first: true }, 'a.b a.b'), 'X a.b'); assert.strictEqual(await call('replace', ['(\\d+)-(\\d+)', '$2/$1'], { regex: true }, '10-20 e 30-40'), '20/10 e 40/30'); assert.strictEqual(await call('replace', ['x', '$&'], {}, 'x'), '$&'); assert.strictEqual(await call('replace', ['A', 'z'], { 'ignore-case': true }, 'aAa'), 'zzz'); await assert.rejects(call('replace', ['solo'], {}, 'x'));
});
test('number-lines', async () => { assert.strictEqual(await call('number-lines', [], {}, 'a\nb\n\nc'), '1  a\n2  b\n3  \n4  c'); assert.strictEqual(await call('number-lines', [], { start: 9, sep: ': ', 'skip-empty': true }, 'a\n\nb'), ' 9: a\n\n10: b'); });
test('cut-fields', async () => {
  assert.strictEqual(await call('cut-fields', [], { f: '1,3', d: ',' }, 'a,b,c\n1,2,3'), 'a,c\n1,3'); assert.strictEqual(await call('cut-fields', [], { f: '2-' }, 'a   b  c d'), 'b c d'); assert.strictEqual(await call('cut-fields', [], { f: '1,2', d: ':', 'out-d': ' | ' }, 'x:y:z'), 'x | y'); assert.strictEqual(await call('cut-fields', [], { f: '4', d: ',' }, 'a,b'), ''); await assert.rejects(call('cut-fields', [], {}, 'a')); await assert.rejects(call('cut-fields', [], { f: '0' }, 'a'));
});
test('uniq-count', async () => { assert.strictEqual(await call('uniq-count', [], {}, 'b\na\nb\nc\nb\na'), '     3  b\n     2  a\n     1  c'); assert.strictEqual(await call('uniq-count', [], { top: 1, 'ignore-case': true }, 'A\na\nb'), '     2  a'); });
test('line-stats', async () => { assert.deepStrictEqual(await J('line-stats', [], {}, 'ab\n\nabcd\nab\n'), { lines: 4, empty: 1, minLength: 0, maxLength: 4, averageLength: 2, longestLineNumber: 3, duplicateLines: 1 }); assert.deepStrictEqual(await J('line-stats', [], {}, ''), { lines: 0 }); });
test('trim-lines', async () => { assert.strictEqual(await call('trim-lines', [], {}, '  a  \n\n\n\n  b\n\n\n'), 'a\n\nb'); assert.strictEqual(await call('trim-lines', [], { 'no-blank': true }, ' a \n\n b '), 'a\nb'); assert.strictEqual(await call('trim-lines', [], { left: true }, '  a  '), 'a  '); assert.strictEqual(await call('trim-lines', [], { right: true }, '  a  '), '  a'); });
test('add-affix', async () => { assert.strictEqual(await call('add-affix', [], { prefix: '- ', suffix: ',' }, 'a\nb'), '- a,\n- b,'); assert.strictEqual(await call('add-affix', [], { prefix: '\\t', 'skip-empty': true }, 'a\n\nb'), '\ta\n\n\tb'); await assert.rejects(call('add-affix', [], {}, 'a')); });
test('columns', async () => { assert.strictEqual(await call('columns', [], {}, 'nome eta\nAnna 30\nGiovanni 5'), 'nome      eta\nAnna      30\nGiovanni  5'); assert.strictEqual(await call('columns', [], { d: ',', gap: 1 }, 'a, bb ,c\nxxx,y,z'), 'a   bb c\nxxx y  z'); });
test('paste-columns', async () => { assert.strictEqual(await call('paste-columns', [tmp('a.txt', '1\n2\n3'), tmp('b.txt', 'a\nb')], { d: ' | ' }), '1 | a\n2 | b\n3 | '); assert.strictEqual(await call('paste-columns', [tmp('a.txt', 'x'), tmp('b.txt', 'y')]), 'x\ty'); await assert.rejects(call('paste-columns', [tmp('a.txt', 'x')])); });
