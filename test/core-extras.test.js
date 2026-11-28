'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { spawnSync } = require('child_process'); const path = require('path');
const { search, completion } = require('../src/core');
const tt = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'tt.js'), ...a], { encoding: 'utf8' });
test('search: trova per nome e descrizione, ordina, esclude i nascosti', () => {
  const r = search('slug'); assert.match(r.split('\n')[0], /^slugify/); assert.ok(search('json').split('\n').length > 5);
  assert.match(search('zzzznonesiste'), /Nessun tool/); assert.ok(!search('easter').includes('konami')); assert.throws(() => search('  '));
  assert.ok(search('json csv').split('\n').every(l => /json|csv/i.test(l)));
});
test('completion: bash e zsh contengono i tool visibili e non i nascosti', () => {
  for (const sh of ['bash', 'zsh']) { const c = completion(sh); assert.ok(c.includes('slugify') && c.includes('a11y-check') && c.includes('search')); assert.ok(!/\bkonami\b/.test(c)); }
  assert.match(completion('bash'), /complete -F _tt tt/); assert.throws(() => completion('fish'));
});
test('CLI: --version, search, completion', () => {
  assert.match(tt('--version').stdout, /^\d+\.\d+\.\d+\n$/); assert.strictEqual(tt('search', 'slug').status, 0); assert.match(tt('search', 'slug').stdout, /slugify/);
  assert.strictEqual(tt('search').status, 1); assert.strictEqual(tt('completion', 'fish').status, 1); assert.match(tt('completion', 'bash').stdout, /compgen/);
});
