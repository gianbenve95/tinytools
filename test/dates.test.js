'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));

test('add-date', async () => {
  const f = (d, o) => call('add-date', [d], o);
  assert.strictEqual(await f('2026-01-31', { months: 1 }), '2026-02-28'); assert.strictEqual(await f('2024-01-31', { months: 1 }), '2024-02-29'); assert.strictEqual(await f('2026-01-31', { days: 30 }), '2026-03-02');
  assert.strictEqual(await f('2026-03-10', { weeks: 2, days: -1 }), '2026-03-23'); assert.strictEqual(await f('2024-02-29', { years: 1 }), '2025-02-28'); assert.strictEqual(await f('2026-01-15', { months: -2 }), '2025-11-15'); assert.strictEqual(await f('2026-03-10', {}), '2026-03-10');
  await assert.rejects(f('2026-02-30', {})); await assert.rejects(f('10/03/2026', {})); await assert.rejects(f('2026-01-01', { days: 'x' }));
});
test('weekday', async () => {
  assert.strictEqual(await call('weekday', ['2026-03-10']), '2026-03-10  martedì'); assert.strictEqual(await call('weekday', ['2026-12-25'], { lang: 'en' }), '2026-12-25  Friday'); await assert.rejects(call('weekday', [])); await assert.rejects(call('weekday', ['2026-03-10'], { lang: 'xx' }));
});
test('week-number (ISO 8601)', async () => {
  const w = d => call('week-number', [d]); assert.strictEqual(await w('2026-01-01'), '2026-W01'); assert.strictEqual(await w('2021-01-03'), '2020-W53'); assert.strictEqual(await w('2024-12-30'), '2025-W01'); assert.strictEqual(await w('2026-03-10'), '2026-W11');
});
test('age', async () => {
  assert.deepStrictEqual(await J('age', ['1990-05-15'], { on: '2026-03-10' }), { years: 35, months: 9, days: 23, totalDays: 13083, nextBirthday: '2026-05-15', daysToNextBirthday: 66 });
  assert.strictEqual((await J('age', ['1990-03-10'], { on: '2026-03-10' })).daysToNextBirthday, 0); assert.strictEqual((await J('age', ['2000-02-29'], { on: '2026-03-01' })).nextBirthday, '2027-02-28'); await assert.rejects(call('age', ['2030-01-01'], { on: '2026-01-01' }));
});
test('countdown', async () => {
  assert.strictEqual(await call('countdown', ['2026-12-25'], { from: '2026-03-10' }), '290 giorni (41 settimane e 3 giorni)'); assert.strictEqual(await call('countdown', ['2026-03-10'], { from: '2026-03-10' }), 'Oggi'); assert.strictEqual(await call('countdown', ['2026-03-01'], { from: '2026-03-10' }), '9 giorni fa');
});
test('tz-convert (ora legale)', async () => {
  assert.strictEqual(await call('tz-convert', ['2026-03-10 09:00', 'Europe/Rome', 'America/New_York']), '2026-03-10 04:00 America/New_York (UTC-04:00)\n2026-03-10T08:00:00.000Z UTC');
  assert.match(await call('tz-convert', ['2026-01-10 09:00', 'Europe/Rome', 'America/New_York']), /^2026-01-10 03:00 .*\(UTC-05:00\)/); assert.match(await call('tz-convert', ['2026-07-01 12:00', 'UTC', 'Asia/Kolkata']), /^2026-07-01 17:30 .*\(UTC\+05:30\)/);
  assert.match(await call('tz-convert', ['2026-07-01 12:00', 'Asia/Tokyo', 'UTC']), /^2026-07-01 03:00/); await assert.rejects(call('tz-convert', ['2026-03-10 09:00', 'Mars/Base', 'UTC']), /sconosciuto/); await assert.rejects(call('tz-convert', ['x']));
});
test('calendar', async () => {
  const c = (await call('calendar', ['2026', '3'])).split('\n'); assert.strictEqual(c[1], 'Lu Ma Me Gi Ve Sa Do'); assert.strictEqual(c[2], '                   1'); assert.strictEqual(c[3], ' 2  3  4  5  6  7  8'); assert.strictEqual(c[c.length - 1].trim(), '30 31'); assert.match(c[0], /marzo 2026/);
  const s = (await call('calendar', ['2026', '3'], { sunday: true, lang: 'en' })).split('\n'); assert.strictEqual(s[1], 'Su Mo Tu We Th Fr Sa'); assert.strictEqual(s[2], ' 1  2  3  4  5  6  7'); await assert.rejects(call('calendar', ['2026', '13']));
});
test('leap-year', async () => {
  assert.deepStrictEqual(await J('leap-year', ['2024']), { year: 2024, leap: true, nextLeapYear: 2028 }); assert.strictEqual((await J('leap-year', ['1900'])).leap, false); assert.strictEqual((await J('leap-year', ['2000'])).leap, true); assert.strictEqual((await J('leap-year', ['2099'])).nextLeapYear, 2104); await assert.rejects(call('leap-year', ['x']));
});
test('easter (date note)', async () => {
  const e = async y => (await J('easter', [String(y)])).easter; assert.strictEqual(await e(2024), '2024-03-31'); assert.strictEqual(await e(2025), '2025-04-20'); assert.strictEqual(await e(2026), '2026-04-05'); assert.strictEqual(await e(2038), '2038-04-25'); assert.strictEqual(await e(1818), '1818-03-22'); assert.strictEqual((await J('easter', ['2026'])).easterMonday, '2026-04-06'); await assert.rejects(call('easter', ['1500']));
});
test('holidays-it', async () => {
  const h = (await call('holidays-it', ['2026'])).split('\n'); assert.strictEqual(h.length, 12); assert.match(h[2], /^2026-04-05\s+domenica\s+Pasqua/); assert.match(h[3], /^2026-04-06\s+lunedì\s+Lunedì dell'Angelo/); assert.match(h[10], /^2026-12-25\s+venerdì\s+Natale/);
});
