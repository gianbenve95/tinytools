'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { spawnSync } = require('child_process'); const path = require('path');
const { registry } = require('../src/core');
const tt = (args, input) => spawnSync(process.execPath, [path.join(__dirname, '../bin/tt.js'), ...args], { input, encoding: 'utf8' });

test('registro: nessun duplicato, ognuno con descrizione, uso e funzione', () => {
  const names = Object.keys(registry); assert.ok(names.length >= 100);
  for (const n of names) { const t = registry[n]; assert.ok(t.desc && typeof t.usage === 'string' && typeof t.fn === 'function', n); assert.match(n, /^[a-z0-9-]+$/); }
});
test('CLI: stdin, argomenti, opzioni, aiuto, errori', () => {
  assert.strictEqual(tt(['slugify'], 'Ciao Mondo').stdout, 'ciao-mondo\n');
  assert.strictEqual(tt(['calc', '2+2']).stdout, '4\n');
  assert.strictEqual(tt(['case-convert', '--to=snake', 'helloWorld']).stdout, 'hello_world\n');
  assert.match(tt(['hash', '--help']).stdout, /Uso: tt hash/);
  const list = tt(['list']).stdout; for (const n of Object.keys(registry)) assert.ok(list.includes(n), n);
  const bad = tt(['calc', '1/0']); assert.strictEqual(bad.status, 1); assert.match(bad.stderr, /Divisione per zero/);
  assert.strictEqual(tt(['nonesiste']).status, 2);
});
