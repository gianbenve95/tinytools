'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));

test('sys-info', async () => { const r = await J('sys-info'); assert.strictEqual(r.platform, os.platform()); assert.strictEqual(r.node, process.version); assert.ok(r.cpuCores >= 1); });
test('env-list maschera i valori sensibili', async () => {
  process.env.TT_TEST_PLAIN = 'visibile'; process.env.TT_TEST_API_TOKEN = 'segretissimo'; const o = await call('env-list', [], { filter: 'tt_test' });
  assert.match(o, /TT_TEST_PLAIN=visibile/); assert.match(o, /TT_TEST_API_TOKEN=••••••••/); assert.ok(!o.includes('segretissimo')); assert.match(await call('env-list', [], { filter: 'tt_test', show: true }), /segretissimo/); assert.strictEqual(await call('env-list', [], { filter: 'zzz_nessuna_var' }), 'Nessuna variabile corrispondente');
});
test('path-doctor', async () => {
  const old = process.env.PATH, d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-p-')), f = path.join(d, 'file');
  fs.writeFileSync(f, 'x'); process.env.PATH = [d, d, '/non/esiste/mai', 'relativo', '', f].join(path.delimiter);
  try { const r = await J('path-doctor'); const t = r.problems.join('\n'); assert.match(t, /#2: duplicato/); assert.match(t, /#3: non esiste/); assert.match(t, /#4: percorso relativo "relativo"/); assert.match(t, /#5: voce vuota/); assert.match(t, /#6: non è una cartella/); assert.strictEqual(r.entries, 6); } finally { process.env.PATH = old; }
});
test('which-all', async () => {
  const old = process.env.PATH, a = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-w1-')), b = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-w2-')); for (const d of [a, b]) fs.writeFileSync(path.join(d, 'miocmd'), '#!/bin/sh\n', { mode: 0o755 }); fs.writeFileSync(path.join(a, 'nonexe'), 'x', { mode: 0o644 });
  process.env.PATH = [a, b].join(path.delimiter); try { assert.strictEqual(await call('which-all', ['miocmd']), `${path.join(a, 'miocmd')}\n${path.join(b, 'miocmd')}`); await assert.rejects(call('which-all', ['nonexe']), /non trovato/); await assert.rejects(call('which-all', ['/bin/ls'])); } finally { process.env.PATH = old; }
});
test('disk-free', async () => { const r = await J('disk-free', [os.tmpdir()]); assert.ok(r.usedPercent >= 0 && r.usedPercent <= 100); assert.match(r.total, /\d (KB|MB|GB|TB)$/); await assert.rejects(call('disk-free', ['/non/esiste'])); });
test('uptime', async () => { assert.strictEqual(await call('uptime', [], { seconds: 93784 }), '1d 2h 3m 4s'); assert.strictEqual(await call('uptime', [], { seconds: 59 }), '59s'); assert.strictEqual(await call('uptime', [], { seconds: 0 }), '0s'); assert.match(await call('uptime'), /\d+s$/); await assert.rejects(call('uptime', [], { seconds: -1 })); });
test('cpu-info', async () => { const r = await J('cpu-info'); assert.ok(r.cores >= 1); assert.strictEqual(r.loadAverage.length, 3); });
test('local-ips', async () => { const all = await call('local-ips', [], { all: true }); assert.match(all, /(127\.0\.0\.1|::1)/); const some = await call('local-ips'); assert.ok(!some.includes('(loopback)')); });
test('timezone-info', async () => {
  const s = await J('timezone-info', [], { tz: 'Europe/Rome', at: '2026-07-01T00:00:00Z' }); assert.deepStrictEqual([s.utcOffset, s.daylightSavingActive, s.usesDaylightSaving, s.localTime], ['+02:00', true, true, '2026-07-01 02:00:00']);
  const w = await J('timezone-info', [], { tz: 'Europe/Rome', at: '2026-01-15T12:00:00Z' }); assert.deepStrictEqual([w.utcOffset, w.daylightSavingActive], ['+01:00', false]); const k = await J('timezone-info', [], { tz: 'Asia/Kolkata', at: '2026-07-01T00:00:00Z' }); assert.deepStrictEqual([k.utcOffset, k.usesDaylightSaving], ['+05:30', false]);
  assert.strictEqual((await J('timezone-info', [], { tz: 'Australia/Sydney', at: '2026-01-15T00:00:00Z' })).daylightSavingActive, true); await assert.rejects(call('timezone-info', [], { tz: 'Mars/Base' })); await assert.rejects(call('timezone-info', [], { at: 'ieri' }));
});
test('locale-info', async () => {
  const it = await J('locale-info', [], { locale: 'it-IT' }); assert.strictEqual(it.number, '1.234.567,891'); assert.match(it.currency, /^1\.234\.567,89\s€$/); assert.strictEqual(it.percent.replace(/\s/g, ''), '26%'); assert.match(it.dateLong, /lunedì 9 marzo 2026/);
  const us = await J('locale-info', [], { locale: 'en-US', currency: 'USD' }); assert.strictEqual(us.number, '1,234,567.891'); assert.strictEqual(us.currency, '$1,234,567.89'); await assert.rejects(call('locale-info', [], { locale: 'xx_invalid!' }));
});
