'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
const tmp = (name, c) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')), name); fs.writeFileSync(p, c); return p; };

test('b64', async () => {
  assert.strictEqual(await call('b64', ['ciao è']), 'Y2lhbyDDqA==');
  assert.strictEqual(await call('b64', ['Y2lhbyDDqA=='], { decode: true }), 'ciao è');
  assert.strictEqual(await call('b64', ['??>>'], { url: true }), 'Pz8-Pg');
  assert.strictEqual(await call('b64', ['Pz8-Pg'], { decode: true }), '??>>');
});
test('hash (vettori noti)', async () => {
  assert.strictEqual(await call('hash', ['abc']), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(await call('hash', ['abc'], { algo: 'md5' }), '900150983cd24fb0d6963f7d28e17f72');
  assert.strictEqual(await call('hash', [], { file: tmp('f', 'abc'), algo: 'sha1' }), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  await assert.rejects(call('hash', ['x'], { algo: 'nope' }));
});
test('uuid v4 / v7', async () => {
  const v4 = (await call('uuid', [], { count: 20 })).split('\n'); assert.strictEqual(new Set(v4).size, 20);
  for (const u of v4) assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const t0 = Date.now(), u7 = await call('uuid', [], { v: 7 });
  assert.match(u7, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(Math.abs(parseInt(u7.replace(/-/g, '').slice(0, 12), 16) - t0) < 5000);
  await assert.rejects(call('uuid', [], { v: 5 }));
});
test('password-gen', async () => {
  const [pw, ent] = (await call('password-gen', [], { length: 24 })).split('\n');
  assert.strictEqual(pw.length, 24); assert.match(pw, /[a-z]/); assert.match(pw, /[A-Z]/); assert.match(pw, /\d/); assert.match(pw, /[^A-Za-z0-9]/); assert.match(ent, /entropia/);
  const s = (await call('password-gen', [], { length: 200, 'no-symbols': true, 'no-ambiguous': true })).split('\n')[0];
  assert.match(s, /^[A-Za-z0-9]+$/); assert.ok(!/[O0Il1o]/.test(s));
  await assert.rejects(call('password-gen', [], { length: 2 }));
});
test('jwt-decode', async () => {
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok = `${enc({ alg: 'HS256' })}.${enc({ sub: '1', exp: 1000 })}.sig`;
  const r = await J('jwt-decode', [tok], { now: 2000 });
  assert.deepStrictEqual([r.payload.sub, r.expired, r.expIso, r.signatureVerified], ['1', true, '1970-01-01T00:16:40.000Z', false]);
  assert.strictEqual((await J('jwt-decode', [tok], { now: 500 })).expired, false);
  await assert.rejects(call('jwt-decode', ['abc']), /3 parti/);
});
test('url-parse', async () => {
  const r = await J('url-parse', ['https://u:p@ex.com:8080/a/b?x=1&y=2&x=3#frag']);
  assert.deepStrictEqual([r.host, r.port, r.path, r.hash, r.username], ['ex.com', '8080', '/a/b', '#frag', 'u']);
  assert.deepStrictEqual(r.query, { x: ['1', '3'], y: '2' });
  await assert.rejects(call('url-parse', ['nope']));
});
test('hexdump', async () => {
  assert.strictEqual(await call('hexdump', ['Hello, hexdump!!\n']),
    '00000000  48 65 6c 6c 6f 2c 20 68  65 78 64 75 6d 70 21 21  |Hello, hexdump!!|\n00000010  0a                                                |.|\n00000011');
});
test('totp (RFC 6238)', async () => {
  const s = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.strictEqual(await call('totp', [s], { time: 59, digits: 8 }), '94287082');
  assert.strictEqual(await call('totp', [s], { time: 1111111109, digits: 8 }), '07081804');
  assert.strictEqual(await call('totp', [s], { time: 20000000000, digits: 8 }), '65353130');
  await assert.rejects(call('totp', ['1!']), /base32/);
});
test('entropy', async () => {
  assert.strictEqual((await J('entropy', ['aaaa'])).bitsPerChar, 0);
  const r = await J('entropy', ['abcd']); assert.deepStrictEqual([r.bitsPerChar, r.totalBits], [2, 8]);
});
