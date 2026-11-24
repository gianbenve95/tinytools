'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
function fx(files = {}) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-f2-')); for (const [p, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), c); } return d; }
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(20)]);

test('file-type', async () => {
  const d = fx({ 'a.png': png, 'b.pdf': '%PDF-1.4 x', 'c.txt': 'ciao', 'd.bin': Buffer.from([1, 0, 2, 0]), 'e.zip': Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(10)]), 'f.html': '<!DOCTYPE html><p>x', 'g.webp': Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), 'h.sh': '#!/bin/sh\n' });
  const o = await call('file-type', ['a.png', 'b.pdf', 'c.txt', 'd.bin', 'e.zip', 'f.html', 'g.webp', 'h.sh', 'nope'].map(x => path.join(d, x))); const l = o.split('\n').map(x => x.replace(d + '/', ''));
  assert.match(l[0], /a\.png: PNG \(image\/png\)/); assert.match(l[1], /PDF/); assert.match(l[2], /Testo/); assert.match(l[3], /Dati binari/); assert.match(l[4], /ZIP/); assert.match(l[5], /HTML/); assert.match(l[6], /WebP/); assert.match(l[7], /shebang/); assert.match(l[8], /non trovato/); await assert.rejects(call('file-type', []));
});
test('mime', async () => { assert.strictEqual(await call('mime', ['pdf']), 'application/pdf'); assert.strictEqual(await call('mime', ['Foto.JPG']), 'image/jpeg'); assert.strictEqual(await call('mime', ['a.tar.gz']), 'application/gzip'); await assert.rejects(call('mime', ['zzz'])); });
test('ext-count', async () => { const r = await J('ext-count', [fx({ 'a.js': 'x', 'b.JS': 'xx', 'c.md': 'y', 'd/e.js': 'zzz', Makefile: 'q' })]); assert.deepStrictEqual([r['.js'].files, r['.js'].bytes, r['.md'].files, r['(nessuna)'].files], [3, 6, 1, 1]); assert.strictEqual(Object.keys(r)[0], '.js'); });
test('newest', async () => {
  const d = fx({ 'old.txt': 'a', 'new.txt': 'b' }); fs.utimesSync(path.join(d, 'old.txt'), 1000000000, 1000000000); const o = (await call('newest', [d], { top: 2 })).split('\n'); assert.match(o[0], /new\.txt/); assert.match(o[1], /2001-09-09 .*old\.txt/);
});
test('empty-dirs', async () => {
  const d = fx({ 'a/file.txt': 'x' }); fs.mkdirSync(path.join(d, 'vuota')); fs.mkdirSync(path.join(d, 'x/y/z'), { recursive: true }); const o = (await call('empty-dirs', [d])).split('\n').map(p => path.relative(d, p)).sort();
  assert.deepStrictEqual(o, ['vuota', 'x']); assert.strictEqual(await call('empty-dirs', [fx({ 'a.txt': '1' })]), 'Nessuna cartella vuota'); assert.ok(fs.existsSync(path.join(d, 'vuota')));
});
test('path-info', async () => {
  const d = fx({ 'rel.tar.gz': 'abc' }), r = await J('path-info', [path.join(d, 'rel.tar.gz')]); assert.deepStrictEqual([r.ext, r.name, r.base, r.exists, r.type, r.bytes], ['.gz', 'rel.tar', 'rel.tar.gz', true, 'file', 3]); assert.strictEqual((await J('path-info', ['/non/esiste.x'])).exists, false);
});
test('dir-hash deterministico', async () => {
  const f = { 'a.txt': '1', 'b/c.txt': '2' }, h1 = await J('dir-hash', [fx(f)]), h2 = await J('dir-hash', [fx(f)]); assert.deepStrictEqual(h1, h2); assert.strictEqual(h1.files, 2);
  assert.notStrictEqual((await J('dir-hash', [fx({ ...f, 'a.txt': '9' })])).sha256, h1.sha256); assert.notStrictEqual((await J('dir-hash', [fx({ 'a2.txt': '1', 'b/c.txt': '2' })])).sha256, h1.sha256);
});
test('long-lines', async () => { const d = fx({ 'a.txt': 'ok\n' + 'x'.repeat(30) + '\n', 'b.bin': Buffer.from([0, 1]) }); assert.match(await call('long-lines', [d], { max: 20 }), /a\.txt:2: 30 caratteri/); assert.match(await call('long-lines', [d], { max: 50 }), /Nessuna riga oltre 50/); });
test('trailing-ws: segnala e corregge solo con --fix', async () => {
  const d = fx({ 'a.txt': 'ok\nbad  \nx\t\r\n', 'b.txt': 'pulito\n' }); const before = fs.readFileSync(path.join(d, 'a.txt'), 'utf8');
  assert.match(await call('trailing-ws', [d]), /a\.txt: righe 2, 3\n\(usa --fix/); assert.strictEqual(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), before);
  assert.match(await call('trailing-ws', [d], { fix: true }), /Corretti 1 file/); assert.strictEqual(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'ok\nbad\nx\r\n'); assert.strictEqual(await call('trailing-ws', [d]), 'Nessuno spazio a fine riga');
});
test('bom-check', async () => {
  const d = fx({ 'u8.txt': Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('ciao')]), 'u16.txt': Buffer.from([0xFF, 0xFE, 0x61, 0]), 'ok.txt': 'ciao' }); const o = await call('bom-check', [d]); assert.match(o, /u8\.txt: BOM UTF-8/); assert.match(o, /u16\.txt: BOM UTF-16 LE/); assert.ok(!o.includes('ok.txt'));
  const f = await call('bom-check', [d], { fix: true }); assert.match(f, /u8\.txt: BOM UTF-8 rimosso/); assert.match(f, /u16\.txt: BOM UTF-16 LE$/m); assert.strictEqual(fs.readFileSync(path.join(d, 'u8.txt'), 'utf8'), 'ciao'); assert.strictEqual(await call('bom-check', [fx({ 'a.txt': 'x' })]), 'Nessun BOM trovato');
});
