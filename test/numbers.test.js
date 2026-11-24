'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));

test('cron-next', async () => {
  const f = '2026-01-01T00:00:00Z';
  assert.strictEqual(await call('cron-next', ['*/15 9-10 * * *'], { from: f, count: 5, utc: true }),
    ['2026-01-01T09:00:00.000Z', '2026-01-01T09:15:00.000Z', '2026-01-01T09:30:00.000Z', '2026-01-01T09:45:00.000Z', '2026-01-01T10:00:00.000Z'].join('\n'));
  // 1 gen 2026 = giovedì; lun-ven alle 8:30 -> ven 2 gen, poi lun 5 gen
  assert.strictEqual(await call('cron-next', ['30 8 * * 1-5'], { from: f, count: 3, utc: true }), '2026-01-01T08:30:00.000Z\n2026-01-02T08:30:00.000Z\n2026-01-05T08:30:00.000Z');
  assert.strictEqual(await call('cron-next', ['0 0 29 2 *'], { from: f, count: 1, utc: true }), '2028-02-29T00:00:00.000Z');
  assert.strictEqual(await call('cron-next', ['0 12 13 * 5'], { from: f, count: 2, utc: true }), '2026-01-02T12:00:00.000Z\n2026-01-09T12:00:00.000Z'.split('\n')[0] + '\n2026-01-09T12:00:00.000Z'); // DOM OR DOW
  assert.strictEqual(await call('cron-next', ['0 9 * * mon'], { from: f, count: 1, utc: true }), '2026-01-05T09:00:00.000Z');
  await assert.rejects(call('cron-next', ['* * *']), /5 campi/); await assert.rejects(call('cron-next', ['61 * * * *']), /fuori intervallo/);
});
test('epoch', async () => {
  assert.strictEqual((await J('epoch', ['1700000000'])).iso, '2023-11-14T22:13:20.000Z');
  assert.strictEqual((await J('epoch', ['1700000000000'])).iso, '2023-11-14T22:13:20.000Z');
  assert.deepStrictEqual(await J('epoch', ['2023-11-14T22:13:20Z']), { seconds: 1700000000, milliseconds: 1700000000000 });
  assert.strictEqual((await J('epoch', ['1700000000'], { tz: 'Europe/Rome' }))['Europe/Rome'], '2023-11-14 23:13:20');
  await assert.rejects(call('epoch', ['boh']));
});
test('duration', async () => {
  assert.strictEqual(await call('duration', ['1h30m15s']), '5415'); assert.strictEqual(await call('duration', ['2d']), '172800');
  assert.strictEqual(await call('duration', ['5415']), '1h 30m 15s'); assert.strictEqual(await call('duration', ['0']), '0s');
  await assert.rejects(call('duration', ['abc'])); await assert.rejects(call('duration', ['1h xyz']));
});
test('bytes', async () => {
  assert.strictEqual(await call('bytes', ['1.5GB']), '1500000000'); assert.strictEqual(await call('bytes', ['1GiB']), '1073741824'); assert.strictEqual(await call('bytes', ['2 MB']), '2000000');
  assert.deepStrictEqual(await J('bytes', ['1536']), { bytes: 1536, binary: '1.5 KiB', decimal: '1.54 kB' });
  await assert.rejects(call('bytes', ['xx']));
});
test('unit-convert', async () => {
  assert.strictEqual(await call('unit-convert', ['10', 'km', 'mi']), '6.213711922'); assert.strictEqual(await call('unit-convert', ['100', 'c', 'f']), '212');
  assert.strictEqual(await call('unit-convert', ['0', 'k', 'c']), '-273.15'); assert.strictEqual(await call('unit-convert', ['1', 'lb', 'oz']), '16');
  assert.strictEqual(await call('unit-convert', ['90', 'kmh', 'ms']), '25');
  await assert.rejects(call('unit-convert', ['1', 'km', 'kg']), /non supportata/);
});
test('roman', async () => {
  assert.strictEqual(await call('roman', ['2026']), 'MMXXVI'); assert.strictEqual(await call('roman', ['1994']), 'MCMXCIV'); assert.strictEqual(await call('roman', ['MCMXCIV']), '1994'); assert.strictEqual(await call('roman', ['xiv']), '14');
  for (const n of [1, 4, 9, 40, 90, 400, 3999, 888]) assert.strictEqual(await call('roman', [await call('roman', [String(n)])]), String(n));
  await assert.rejects(call('roman', ['IIII'])); await assert.rejects(call('roman', ['4000'])); await assert.rejects(call('roman', ['ABC']));
});
test('base-convert', async () => {
  assert.strictEqual(await call('base-convert', ['FF'], { from: 16, to: 2 }), '11111111'); assert.strictEqual(await call('base-convert', ['255'], { to: 16 }), 'ff');
  assert.strictEqual(await call('base-convert', ['-zz'], { from: 36, to: 10 }), '-1295');
  assert.strictEqual(await call('base-convert', ['ffffffffffffffffffff'], { from: 16 }), '1208925819614629174706175');
  await assert.rejects(call('base-convert', ['9'], { from: 8 })); await assert.rejects(call('base-convert', ['1'], { to: 40 }));
});
test('calc', async () => {
  const c = e => call('calc', [e]);
  assert.strictEqual(await c('2*(3+4)^2 - sqrt(16)'), '94'); assert.strictEqual(await c('2^3^2'), '512'); assert.strictEqual(await c('-2^2'), '-4');
  assert.strictEqual(await c('10 % 4 + 0.5'), '2.5'); assert.strictEqual(await c('max(1, 5, 3) + min(2,9)'), '7'); assert.strictEqual(await c('round(pi*100)'), '314'); assert.strictEqual(await c('0.1+0.2'), '0.3');
  for (const bad of ['1/0', '2+', '(1', 'foo(1)', '1 $ 2', 'process.exit()']) await assert.rejects(c(bad), undefined, bad);
});
test('color-convert', async () => {
  assert.deepStrictEqual(await J('color-convert', ['#ff8800']), { hex: '#ff8800', rgb: 'rgb(255, 136, 0)', hsl: 'hsl(32, 100%, 50%)' });
  assert.strictEqual((await J('color-convert', ['hsl(120, 100%, 25%)'])).hex, '#008000'); assert.strictEqual((await J('color-convert', ['f00'])).rgb, 'rgb(255, 0, 0)');
  const c = await J('color-convert', ['#000000'], { contrast: '#ffffff' }); assert.deepStrictEqual([c.contrastRatio, c.wcagAA, c.wcagAAA], [21, true, true]);
  assert.strictEqual((await J('color-convert', ['#777777'], { contrast: '#ffffff' })).wcagAA, false);
  await assert.rejects(call('color-convert', ['blu']));
});
test('date-diff', async () => {
  assert.deepStrictEqual(await J('date-diff', ['2026-01-01', '2026-03-15']), { days: 73, weeks: 10.43, businessDays: 52, breakdown: '0y 2m 14d' });
  assert.strictEqual((await J('date-diff', ['2026-03-15', '2026-01-01'])).days, -73);
  assert.strictEqual((await J('date-diff', ['2024-02-28', '2024-03-01'])).days, 2);
  assert.strictEqual((await J('date-diff', ['2020-05-10', '2026-05-10'])).breakdown, '6y 0m 0d');
  await assert.rejects(call('date-diff', ['x', 'y']));
});
