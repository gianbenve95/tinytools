'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call } = require('../src/core');
const crypto = require('crypto');
const J = async (...x) => JSON.parse(await call(...x));

test('iban-validate', async () => {
  for (const i of ['IT60X0542811101000000123456', 'GB82 WEST 1234 5698 7654 32', 'DE89370400440532013000', 'FR1420041010050500013M02606', 'ES9121000418450200051332']) assert.strictEqual((await J('iban-validate', [i])).valid, true, i);
  const it = await J('iban-validate', ['it60x0542811101000000123456']); assert.deepStrictEqual(it.italy, { cin: 'X', abi: '05428', cab: '11101', account: '000000123456' }); assert.strictEqual(it.formatted, 'IT60 X054 2811 1010 0000 0123 456');
  assert.match((await J('iban-validate', ['IT60X0542811101000000123457'])).problems.join(), /checksum/); assert.match((await J('iban-validate', ['IT60X054281110100000012345'])).problems.join(), /lunghezza 26 invece di 27/); assert.strictEqual((await J('iban-validate', ['12345'])).valid, false);
});
test('codice-fiscale', async () => {
  const r = await J('codice-fiscale', ['RSSMRA85T10A562S'], { today: '2026-03-10' }); assert.deepStrictEqual([r.valid, r.sex, r.birthDate, r.birthPlaceCode], [true, 'M', '1985-12-10', 'A562']);
  assert.strictEqual((await J('codice-fiscale', ['RSSMRA85T10A562X'])).valid, false); assert.match((await J('codice-fiscale', ['RSSMRA85T10A562X'])).problems[0], /controllo errato/); assert.strictEqual((await J('codice-fiscale', ['abc'])).valid, false);
  const f = await J('codice-fiscale', ['BNCLRA90A41H501Q'], { today: '2026-03-10' }); assert.deepStrictEqual([f.sex, f.birthDate], ['F', f.valid ? '1990-01-01' : undefined]); // 41 = 1 + 40
});
test('partita-iva', async () => { assert.strictEqual((await J('partita-iva', ['12345678903'])).valid, true); assert.strictEqual((await J('partita-iva', ['IT 12345678903'])).valid, true); const bad = await J('partita-iva', ['12345678904']); assert.deepStrictEqual([bad.valid, bad.problems[0]], [false, 'cifra di controllo attesa 3']); assert.strictEqual((await J('partita-iva', ['123'])).valid, false); });
test('luhn', async () => {
  assert.deepStrictEqual(await J('luhn', ['4111 1111 1111 1111']), { validLuhn: true, length: 16, brand: 'Visa' }); assert.strictEqual((await J('luhn', ['5555555555554444'])).brand, 'Mastercard'); assert.strictEqual((await J('luhn', ['378282246310005'])).brand, 'American Express'); assert.strictEqual((await J('luhn', ['4111111111111112'])).validLuhn, false);
  assert.deepStrictEqual(await J('luhn', ['411111111111111'], { complete: true }), { checkDigit: 1, full: '4111111111111111' }); await assert.rejects(call('luhn', ['abc']));
});
test('isbn', async () => { assert.deepStrictEqual(await J('isbn', ['0-306-40615-2']), { type: 'ISBN-10', valid: true, isbn13: '9780306406157' }); assert.deepStrictEqual(await J('isbn', ['9780306406157']), { type: 'ISBN-13', valid: true }); assert.strictEqual((await J('isbn', ['9780306406158'])).valid, false); assert.strictEqual((await J('isbn', ['080442957X'])).valid, true); assert.strictEqual((await J('isbn', ['0306406153'])).valid, false); await assert.rejects(call('isbn', ['123'])); });
test('ean', async () => { assert.deepStrictEqual(await J('ean', ['4006381333931']), { type: 'EAN-13', valid: true }); assert.strictEqual((await J('ean', ['4006381333932'])).valid, false); assert.deepStrictEqual(await J('ean', ['400638133393'], { complete: true }), { checkDigit: 1, full: '4006381333931' }); assert.strictEqual((await J('ean', ['96385074'])).valid, true); assert.strictEqual((await J('ean', ['036000291452'])).type, 'UPC-A'); await assert.rejects(call('ean', ['12345'])); });
test('uuid-validate', async () => { const v4 = await J('uuid-validate', [crypto.randomUUID()]); assert.deepStrictEqual([v4.valid, v4.version], [true, 4]); assert.strictEqual((await J('uuid-validate', ['c232ab00-9414-11ec-b3c8-9f6bdeced846'])).version, 1); assert.strictEqual((await J('uuid-validate', ['00000000-0000-0000-0000-000000000000'])).nil, true); assert.strictEqual((await J('uuid-validate', ['zzz'])).valid, false); });
test('bic-validate', async () => { assert.deepStrictEqual(await J('bic-validate', ['DEUTDEFF500']), { valid: true, bank: 'DEUT', country: 'DE', location: 'FF', branch: '500' }); assert.strictEqual((await J('bic-validate', ['BCITITMM'])).branch, 'XXX (sede principale)'); assert.strictEqual((await J('bic-validate', ['ABC'])).valid, false); });
test('phone-it', async () => { assert.deepStrictEqual(await J('phone-it', ['347 123 4567']), { valid: true, type: 'cellulare', e164: '+393471234567', national: '3471234567' }); assert.strictEqual((await J('phone-it', ['+39 06 1234 5678'])).type, 'fisso'); assert.strictEqual((await J('phone-it', ['0039 02-1234567'])).e164, '+39021234567'); assert.strictEqual((await J('phone-it', ['800 123456'])).type, 'numero verde'); assert.strictEqual((await J('phone-it', ['12345'])).valid, false); assert.strictEqual((await J('phone-it', ['34x'])).valid, false); });
test('password-strength', async () => {
  const w = await J('password-strength', ['password']); assert.strictEqual(w.score, 0); assert.ok(w.issues.some(i => /comuni/.test(i))); assert.strictEqual((await J('password-strength', ['1234'])).score, 0); const s = await J('password-strength', ['correct-horse-battery-staple-92!']); assert.ok(s.score >= 3); assert.strictEqual(s.issues.length, 0);
  assert.ok((await J('password-strength', ['aaaaaaaaaaaa'])).estimatedEntropyBits <= 8); assert.ok((await J('password-strength', ['Abc12345xyz!'])).issues.some(i => /sequenza/.test(i))); await assert.rejects(call('password-strength', [''])); assert.ok(!JSON.stringify(s).includes('horse'));
});
