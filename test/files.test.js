'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), crypto = require('crypto');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-fx-')), w = (p, c) => { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), c); };
  w('a.txt', 'hello world\n'); w('sub/b.txt', 'hello world\n'); w('sub/deep/c.js', '// TODO: fix this\nconst x = 1;\n\n// FIXME later\n'); w('big.bin', Buffer.alloc(3000)); w('node_modules/skip.js', '// TODO ignored\n'); w('uniq.txt', 'unico');
  return d;
}

test('dupfinder', async () => {
  const d = fixture(), r = await J('dupfinder', [d], { min: 1 });
  assert.strictEqual(r.duplicateGroups, 1); assert.strictEqual(r.groups[0].files.length, 2); assert.strictEqual(r.wastedBytes, 12);
  await assert.rejects(call('dupfinder', ['/nonexistent-dir-xyz']));
});
test('dirsize', async () => {
  const out = await call('dirsize', [fixture()]); assert.match(out.split('\n')[0], /big\.bin|sub\/|node_modules/); assert.match(out, /TOTALE/);
});
test('bulk-rename: anteprima, applicazione, conflitti', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-rn-')); for (const n of ['IMG_1.jpg', 'IMG_2.jpg', 'altro.txt']) fs.writeFileSync(path.join(d, n), n);
  const prev = await call('bulk-rename', [d], { find: 'IMG_(\\d+)', replace: 'foto-$1' });
  assert.match(prev, /IMG_1\.jpg -> foto-1\.jpg/); assert.ok(fs.existsSync(path.join(d, 'IMG_1.jpg')));
  await call('bulk-rename', [d], { find: 'IMG_(\\d+)', replace: 'foto-$1', apply: true });
  assert.deepStrictEqual(fs.readdirSync(d).sort(), ['altro.txt', 'foto-1.jpg', 'foto-2.jpg']);
  await assert.rejects(call('bulk-rename', [d], { find: 'foto-\\d', replace: 'x' }), /Conflitto/); // due file -> stesso nome
  await assert.rejects(call('bulk-rename', [d], { find: 'altro\\.txt', replace: 'foto-1.jpg' }), /Conflitto/);
  await assert.rejects(call('bulk-rename', [d], { find: 'a' }), /--find e --replace/);
});
test('file-tree', async () => {
  const t = await call('file-tree', [fixture()], { depth: 2 }); assert.match(t, /├── sub\//); assert.match(t, /└── uniq\.txt/); assert.ok(!t.includes('node_modules')); assert.ok(!t.includes('c.js'));
  assert.ok((await call('file-tree', [fixture()], { depth: 3 })).includes('c.js')); assert.ok((await call('file-tree', [fixture()], { all: true })).includes('node_modules'));
});
test('find-large', async () => {
  assert.match(await call('find-large', [fixture()], { min: '2KB' }), /big\.bin/); assert.strictEqual(await call('find-large', [fixture()], { min: '1GB' }), 'Nessun file sopra la soglia');
  await assert.rejects(call('find-large', [fixture()], { min: 'abc' }));
});
test('loc', async () => {
  const r = await J('loc', [fixture()]); assert.deepStrictEqual(r['.js'], { files: 1, code: 3, blank: 1 }); assert.ok(!('.bin' in r)); assert.strictEqual(r['.txt'].files, 3);
});
test('todo-scan', async () => {
  const t = await call('todo-scan', [fixture()]); assert.match(t, /c\.js:1: \[TODO\] fix this/); assert.match(t, /c\.js:4: \[FIXME\] later/); assert.ok(!t.includes('ignored'));
});
test('checksum-verify', async () => {
  const d = fixture(), sum = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(d, f))).digest('hex');
  fs.writeFileSync(path.join(d, 'SUMS'), `${sum('a.txt')}  a.txt\n${'0'.repeat(64)}  uniq.txt\n${sum('a.txt')}  nope.txt\n`);
  const out = await call('checksum-verify', [path.join(d, 'SUMS')]); assert.match(out, /a\.txt: OK/); assert.match(out, /uniq\.txt: FALLITO/); assert.match(out, /nope\.txt: MANCANTE/); assert.match(out, /2 problemi su 3/);
  fs.writeFileSync(path.join(d, 'OK'), `${sum('a.txt')} *a.txt\n`); assert.match(await call('checksum-verify', [path.join(d, 'OK')]), /Tutti i 1 file sono integri/);
});
test('port-check', async () => {
  const srv = net.createServer(s => s.end()).listen(0, '127.0.0.1'); await new Promise(r => srv.on('listening', r)); const p = srv.address().port;
  assert.match(await call('port-check', ['127.0.0.1', String(p)]), /APERTA/); srv.close(); await new Promise(r => srv.on('close', r));
  assert.match(await call('port-check', ['127.0.0.1', String(p)]), /CHIUSA/); await assert.rejects(call('port-check', ['x', '99999']));
});
test('http-status', async () => {
  assert.match(await call('http-status', ['404']), /^404 Not Found/); assert.match(await call('http-status', ['4xx']), /429 Too Many Requests/); await assert.rejects(call('http-status', ['999']));
});
test('gitignore-gen', async () => {
  const g = await call('gitignore-gen', ['node', 'macos']); assert.match(g, /# node\nnode_modules\//); assert.match(g, /# macos\n\.DS_Store/);
  assert.match(await call('gitignore-gen', ['list']), /python/); await assert.rejects(call('gitignore-gen', ['cobol']));
});
