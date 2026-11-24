'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));

test('primes', async () => {
  assert.deepStrictEqual((await J('primes', ['360'])).factors, { 2: 3, 3: 2, 5: 1 }); assert.strictEqual((await J('primes', ['360'])).expression, '2^3 x 3^2 x 5');
  assert.strictEqual((await J('primes', ['97'])).prime, true); assert.strictEqual((await J('primes', ['1'])).prime, false); assert.strictEqual((await J('primes', ['999999999989'])).prime, true);
  assert.strictEqual(await call('primes', [], { upto: 30 }), '2 3 5 7 11 13 17 19 23 29'); await assert.rejects(call('primes', ['abc'])); await assert.rejects(call('primes', [], { upto: 1e9 }));
});
test('gcd-lcm', async () => {
  assert.deepStrictEqual(await J('gcd-lcm', ['12', '18', '30']), { gcd: 6, lcm: 180 }); assert.deepStrictEqual(await J('gcd-lcm', [], {}, '7, 13'), { gcd: 1, lcm: 91 }); await assert.rejects(call('gcd-lcm', ['5'])); await assert.rejects(call('gcd-lcm', ['0', '5'])); await assert.rejects(call('gcd-lcm', ['1.5', '2']));
});
test('fibonacci', async () => {
  assert.strictEqual(await call('fibonacci', [], { n: 10 }), '0 1 1 2 3 5 8 13 21 34'); assert.strictEqual(await call('fibonacci', [], { nth: 100 }), '354224848179261915075'); assert.strictEqual(await call('fibonacci', [], { nth: 0 }), '0'); await assert.rejects(call('fibonacci', [], { n: -1 }));
});
test('stats', async () => {
  const s = await J('stats', ['2', '4', '4', '4', '5', '5', '7', '9']); assert.deepStrictEqual([s.mean, s.median, s.mode, s.populationStdDev, s.range], [5, 4.5, [4], 2, 7]); assert.strictEqual(s.sampleStdDev, 2.13809);
  assert.deepStrictEqual((await J('stats', [], {}, '1,2,3')).mode, []); assert.strictEqual((await J('stats', ['5'])).sampleStdDev, null); await assert.rejects(call('stats', ['a']));
});
test('percent', async () => {
  const p = (...x) => call('percent', x); assert.strictEqual(await p('of', '20', '150'), '30'); assert.strictEqual(await p('is', '30', '150'), '20%'); assert.strictEqual(await p('change', '100', '125'), '+25%'); assert.strictEqual(await p('change', '200', '150'), '-25%');
  await assert.rejects(p('change', '0', '5')); await assert.rejects(p('is', '1', '0')); await assert.rejects(p('x', '1', '2'));
});
test('compound-interest', async () => {
  assert.deepStrictEqual(await J('compound-interest', ['1000', '5', '10'], { n: 1 }), { finalAmount: 1628.89, totalContributed: 1000, interestEarned: 628.89 });
  assert.strictEqual((await J('compound-interest', ['1000', '5', '10'])).finalAmount, 1647.01);
  const c = await J('compound-interest', ['0', '6', '1'], { contrib: 100 }); assert.strictEqual(c.totalContributed, 1200); assert.strictEqual(c.finalAmount, 1233.56);
  assert.strictEqual((await J('compound-interest', ['1000', '0', '5'])).finalAmount, 1000); await assert.rejects(call('compound-interest', ['1', '1'])); await assert.rejects(call('compound-interest', ['1', '1', '1'], { n: 4, contrib: 5 }));
});
test('loan-payment', async () => {
  const l = await J('loan-payment', ['200000', '3.5', '30'], { schedule: 2 }); assert.strictEqual(l.monthlyPayment, 898.09); assert.strictEqual(l.payments, 360); assert.strictEqual(l.totalPaid, 323312.18); assert.strictEqual(l.totalInterest, 123312.18); assert.strictEqual(l.schedule[0].interest, 583.33); assert.strictEqual(l.schedule[0].principal, 314.76);
  assert.strictEqual((await J('loan-payment', ['1200', '0', '1'])).monthlyPayment, 100); await assert.rejects(call('loan-payment', ['0', '1', '1']));
});
test('bill-split', async () => { assert.deepStrictEqual(await J('bill-split', ['90', '3'], { tip: 10 }), { total: 99, tip: 9, perPerson: 33 }); await assert.rejects(call('bill-split', ['10', '0'])); });
test('dice', async () => {
  const d = await J('dice', ['3d6+2'], { seed: 4 }); assert.strictEqual(d.rolls.length, 3); assert.ok(d.rolls.every(x => x >= 1 && x <= 6)); assert.strictEqual(d.total, d.rolls.reduce((x, y) => x + y) + 2); assert.deepStrictEqual([d.min, d.max, d.average], [5, 20, 12.5]);
  assert.deepStrictEqual(await J('dice', ['d20'], { seed: 9 }), await J('dice', ['d20'], { seed: 9 })); const seen = new Set(); for (let s = 1; s < 200; s++) seen.add((await J('dice', ['1d6'], { seed: s })).total); assert.strictEqual(seen.size, 6);
  await assert.rejects(call('dice', ['hello'])); await assert.rejects(call('dice', ['5000d6']));
});
test('combinatorics', async () => {
  assert.deepStrictEqual(await J('combinatorics', ['10', '3']), { 'n!': '3628800', nPr: '720', nCr: '120' }); assert.strictEqual((await J('combinatorics', ['52', '5'])).nCr, '2598960'); assert.strictEqual((await J('combinatorics', ['0']))['n!'], '1'); await assert.rejects(call('combinatorics', ['3', '5']));
});
