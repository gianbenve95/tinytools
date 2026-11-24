'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));

test('ip-info', async () => {
  const k = async ip => (await J('ip-info', [ip])).kind;
  assert.strictEqual(await k('192.168.1.10'), 'privato (RFC 1918)'); assert.strictEqual(await k('172.31.255.1'), 'privato (RFC 1918)'); assert.strictEqual(await k('172.32.0.1'), 'pubblico'); assert.strictEqual(await k('127.0.0.1'), 'loopback'); assert.strictEqual(await k('8.8.8.8'), 'pubblico');
  assert.strictEqual(await k('169.254.1.1'), 'link-local'); assert.strictEqual(await k('100.64.0.1'), 'CGNAT (100.64/10)'); assert.strictEqual(await k('239.1.1.1'), 'multicast'); assert.strictEqual(await k('::1'), 'loopback'); assert.strictEqual(await k('fe80::1'), 'link-local'); assert.strictEqual(await k('fd12:3456::1'), 'unique local (privato)'); assert.strictEqual(await k('2001:db8::1'), 'pubblico/globale');
  assert.deepStrictEqual(await J('ip-info', ['192.168.1.1']), { version: 4, address: '192.168.1.1', integer: 3232235777, hex: '0xc0a80101', kind: 'privato (RFC 1918)' }); assert.strictEqual((await J('ip-info', ['2001:db8::1'])).expanded, '2001:0db8:0000:0000:0000:0000:0000:0001'); await assert.rejects(call('ip-info', ['999.1.1.1']));
});
test('cidr', async () => {
  assert.deepStrictEqual(await J('cidr', ['192.168.1.77/24']), { network: '192.168.1.0', broadcast: '192.168.1.255', netmask: '255.255.255.0', wildcard: '0.0.0.255', firstHost: '192.168.1.1', lastHost: '192.168.1.254', totalAddresses: 256, usableHosts: 254, prefix: 24 });
  const c = await J('cidr', ['10.0.0.0/8']); assert.deepStrictEqual([c.broadcast, c.usableHosts], ['10.255.255.255', 16777214]); assert.strictEqual((await J('cidr', ['10.0.0.5/32'])).usableHosts, 1); assert.strictEqual((await J('cidr', ['10.0.0.4/31'])).firstHost, '10.0.0.4'); assert.strictEqual((await J('cidr', ['0.0.0.0/0'])).totalAddresses, 4294967296);
  await assert.rejects(call('cidr', ['10.0.0.0'])); await assert.rejects(call('cidr', ['10.0.0.0/33']));
});
test('ip-to-int', async () => { assert.deepStrictEqual(await J('ip-to-int', ['192.168.1.1']), { integer: 3232235777, hex: '0xc0a80101' }); assert.strictEqual(await call('ip-to-int', ['3232235777']), '192.168.1.1'); assert.strictEqual(await call('ip-to-int', ['0']), '0.0.0.0'); await assert.rejects(call('ip-to-int', ['4294967296'])); });
test('subnet-split', async () => {
  assert.strictEqual(await call('subnet-split', ['10.0.0.0/24'], { prefix: 26 }), '10.0.0.0/26\n10.0.0.64/26\n10.0.0.128/26\n10.0.0.192/26'); await assert.rejects(call('subnet-split', ['10.0.0.0/24'], { prefix: 24 })); await assert.rejects(call('subnet-split', ['10.0.0.0/8'], { prefix: 24 }));
});
test('mac-format', async () => { const m = await J('mac-format', ['AA-BB-CC-DD-EE-FF']); assert.deepStrictEqual([m.colon, m.cisco, m.plain, m.multicast, m.locallyAdministered], ['aa:bb:cc:dd:ee:ff', 'aabb.ccdd.eeff', 'aabbccddeeff', false, true]); assert.strictEqual((await J('mac-format', ['01:00:5e:00:00:01'])).multicast, true); await assert.rejects(call('mac-format', ['zz:zz'])); });
test('punycode', async () => { assert.strictEqual(await call('punycode', ['münchen.de']), 'xn--mnchen-3ya.de'); assert.strictEqual(await call('punycode', ['xn--mnchen-3ya.de']), 'münchen.de'); });
test('hostname-check', async () => {
  assert.strictEqual((await J('hostname-check', ['esempio.com'])).valid, true); assert.strictEqual((await J('hostname-check', ['-bad-.com'])).valid, false); assert.match((await J('hostname-check', ['a..b'])).problems[0], /vuota/); assert.strictEqual((await J('hostname-check', ['a_b.com'])).valid, false); assert.strictEqual((await J('hostname-check', [`${'a'.repeat(64)}.com`])).valid, false); assert.strictEqual((await J('hostname-check', ['esempio.com.'])).valid, true);
});
test('email-validate', async () => {
  const v = async e => (await J('email-validate', [e])).validSyntax; assert.strictEqual(await v('nome.cognome+tag@esempio.it'), true); assert.strictEqual(await v('niente-chiocciola.it'), false); assert.strictEqual(await v('a@b'), false); assert.strictEqual(await v('.a@esempio.it'), false); assert.strictEqual(await v('a..b@esempio.it'), false); assert.strictEqual(await v(`${'a'.repeat(65)}@esempio.it`), false); assert.strictEqual(await v('a@-esempio.it'), false);
});
test('port-lookup', async () => { assert.strictEqual(await call('port-lookup', ['443']), '443/https'); assert.match(await call('port-lookup', ['smtp']), /25\/smtp\n.*465\/smtps/s); await assert.rejects(call('port-lookup', ['1'])); await assert.rejects(call('port-lookup', ['zzz'])); });
test('url-encode', async () => {
  assert.strictEqual(await call('url-encode', ['a b&c/é']), 'a%20b%26c%2F%C3%A9'); assert.strictEqual(await call('url-encode', ['a%20b%26'], { decode: true }), 'a b&'); assert.strictEqual(await call('url-encode', ['https://x.it/a b?q=é'], { full: true }), 'https://x.it/a%20b?q=%C3%A9'); await assert.rejects(call('url-encode', ['%E0%A4%A'], { decode: true }));
});
