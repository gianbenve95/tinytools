'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call, registry, list } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
test('ascii-banner', async () => {
  const r = (await call('ascii-banner', ['tt'])).split('\n'); assert.strictEqual(r.length, 5); assert.strictEqual(r[0], '##### #####'); assert.ok((await call('ascii-banner', ['a'], { char: '*' })).includes('*'));
  await assert.rejects(call('ascii-banner', ['@'])); await assert.rejects(call('ascii-banner', [])); await assert.rejects(call('ascii-banner', ['x'.repeat(21)]));
});
test('cowsay: una riga, più righe, larghezza', async () => {
  const one = await call('cowsay', ['ciao']); assert.match(one, /< ciao >/); assert.match(one, /\(oo\)/);
  const many = await call('cowsay', ['una frase abbastanza lunga da andare a capo'], { width: 12 }); assert.match(many, /^ _+\n\/ /); assert.match(many, /\n\\ .* \/\n/);
  await assert.rejects(call('cowsay', [])); await assert.rejects(call('cowsay', ['x'], { width: 5 }));
});
test('fortune e magic-8 sono ripetibili con --seed', async () => {
  assert.strictEqual(await call('fortune', [], { seed: 3 }), await call('fortune', [], { seed: 3 })); assert.ok((await call('fortune')).length > 10);
  assert.strictEqual(await call('magic-8', ['si?'], { seed: 7 }), await call('magic-8', ['si?'], { seed: 7 })); await assert.rejects(call('magic-8', []));
});
test('passphrase', async () => {
  const r = await J('passphrase', [], { words: 6, sep: '.' }); assert.strictEqual(r.frase.split('.').length, 6); assert.ok(r.entropiaBit > 40 && r.entropiaBit < 50);
  assert.notStrictEqual((await J('passphrase')).frase, (await J('passphrase')).frase); assert.match((await J('passphrase', [], { words: 4, cap: true })).frase, /^[A-Z][a-z]+(-[A-Z][a-z]+){3}$/);
  assert.strictEqual((await J('passphrase')).giudizio, 'buona per un account'); await assert.rejects(call('passphrase', [], { words: 2 }));
});
test('pomodoro', async () => {
  const r = (await call('pomodoro', [], { start: '09:00', cycles: 5 })).split('\n'); assert.strictEqual(r[0], '09:00-09:25  Sessione 1'); assert.ok(r.includes('10:55-11:10  Pausa lunga')); assert.match(r[r.length - 1], /^Fine: 11:35 {3}\(125 minuti/);
  await assert.rejects(call('pomodoro', [], {})); await assert.rejects(call('pomodoro', [], { start: '25:00' })); await assert.rejects(call('pomodoro', [], { start: '09:00', cycles: 0 }));
});
test('easter egg: esistono, rispondono e restano fuori da "tt list"', async () => {
  for (const n of ['konami', 'xyzzy', '42']) { assert.ok(registry[n].hidden); assert.ok((await call(n)).length > 5); assert.ok(!list().includes('  ' + n + ' ')); }
  assert.match(await call('sudo', ['fai', 'un', 'panino']), /root/); assert.match(await call('sudo', ['ls']), /sudoers/); assert.ok(!list().includes('konami'));
});
