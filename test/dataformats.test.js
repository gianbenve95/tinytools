'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));

const YML = `# compose
version: "3.8"
services:
  web:
    image: nginx:1.25   # tag fisso
    ports:
      - "80:80"
      - 443:443
    environment:
      - KEY=value
      - DEBUG=true
    depends_on: [db, cache]
    labels: {tier: front, n: 2}
  db:
    image: 'postgres:16'
    command:
      - run
      - --flag
    healthcheck:
      test: ["CMD", "pg_isready"]
      retries: 5
      enabled: yes
empty:
nulls: ~
items:
  - name: uno
    qty: 1.5
  - name: due
    tags: [a]
  - - nested
    - list
script: |
  echo "ciao"
  echo 'mondo'

folded: >-
  una frase
  su due righe
`;
test('yaml2json: configurazione realistica', async () => {
  const r = await J('yaml2json', [], {}, YML); assert.strictEqual(r.version, '3.8'); assert.deepStrictEqual(r.services.web.ports, ['80:80', '443:443']); assert.strictEqual(r.services.web.image, 'nginx:1.25'); assert.deepStrictEqual(r.services.web.depends_on, ['db', 'cache']); assert.deepStrictEqual(r.services.web.labels, { tier: 'front', n: 2 }); assert.strictEqual(r.services.db.image, 'postgres:16'); assert.deepStrictEqual(r.services.db.healthcheck, { test: ['CMD', 'pg_isready'], retries: 5, enabled: 'yes' });
  assert.deepStrictEqual([r.empty, r.nulls], [null, null]); assert.deepStrictEqual(r.items, [{ name: 'uno', qty: 1.5 }, { name: 'due', tags: ['a'] }, ['nested', 'list']]); assert.strictEqual(r.script, 'echo "ciao"\necho \'mondo\'\n'); assert.strictEqual(r.folded, 'una frase su due righe');
});
test('yaml2json: sequenza allo stesso livello della chiave, errori espliciti', async () => {
  assert.deepStrictEqual(await J('yaml2json', [], {}, 'a:\n- 1\n- 2\nb: x'), { a: [1, 2], b: 'x' }); assert.deepStrictEqual(await J('yaml2json', [], {}, '- a\n- b: 1\n  c: 2'), ['a', { b: 1, c: 2 }]); assert.strictEqual(await call('yaml2json', [], {}, '"solo testo"'), 'solo testo'); assert.strictEqual(await J('yaml2json', [], {}, '42'), 42); assert.strictEqual(await call('yaml2json', [], {}, 'ciao mondo'), 'ciao mondo');
  await assert.rejects(call('yaml2json', [], {}, 'a: 1\na: 2'), /duplicata/); await assert.rejects(call('yaml2json', [], {}, 'a: &x 1'), /Ancore/); await assert.rejects(call('yaml2json', [], {}, 'a: 1\n---\nb: 2'), /Più documenti/); await assert.rejects(call('yaml2json', [], {}, 'a:\n\tb: 1'), /tabulazioni/); await assert.rejects(call('yaml2json', [], {}, 'a: "aperta'), /non chiusa/); await assert.rejects(call('yaml2json', [], {}, 'a: [1, 2'), /flow|inatteso|non valida/i);
});
test('json2yaml e round trip', async () => {
  const src = { name: 'x', n: 3, f: 1.5, ok: true, nil: null, text: 'a: b', num: '123', yes: 'yes', empty: '', list: [1, 'due', { a: 1, b: [2, 3] }, [4, 5], {}], obj: { deep: { deeper: ['x'] } }, multi: 'riga1\nriga2', ea: [], eo: {} };
  const y = await call('json2yaml', [], {}, JSON.stringify(src)); assert.match(y, /^name: x\n"n": 3/); /* "n" tra virgolette: in YAML 1.1 n significa false */ assert.match(y, /text: "a: b"/); assert.match(y, /num: "123"/); assert.match(y, /"yes": "yes"/); assert.deepStrictEqual(await J('yaml2json', [], {}, y), src); assert.strictEqual(await call('json2yaml', [], {}, '[1,2]'), '- 1\n- 2'); await assert.rejects(call('json2yaml', [], {}, '{'));
});
test('ini2json', async () => { const ini = '; c\nglobal=1\n[server]\nhost = "localhost" ; nota\nport=8080\n[db.main]\nuser: root\nok=true'; assert.deepStrictEqual(await J('ini2json', [], {}, ini), { global: '1', server: { host: 'localhost', port: '8080' }, db: { main: { user: 'root', ok: 'true' } } }); assert.deepStrictEqual((await J('ini2json', [], { types: true }, ini)).server, { host: 'localhost', port: 8080 }); await assert.rejects(call('ini2json', [], {}, 'senza uguale')); });
test('toml2json', async () => {
  const t = '# c\ntitle = "TOML"\nn = 1_000\nf = 3.14\nok = true\nd = 2026-03-10\nlist = [1, 2, 3]\nnames = ["a", "b"]\ninline = { x = 1, y = "s" }\na.b = 5\n\n[owner]\nname = \'lit\'\n\n[database]\nports = [ 8000, 8001 ]\n[database.limits]\nmax = 10\n\n[[products]]\nname = "Hammer"\n[[products]]\nname = "Nail"\n';
  assert.deepStrictEqual(await J('toml2json', [], {}, t), { title: 'TOML', n: 1000, f: 3.14, ok: true, d: '2026-03-10', list: [1, 2, 3], names: ['a', 'b'], inline: { x: 1, y: 's' }, a: { b: 5 }, owner: { name: 'lit' }, database: { ports: [8000, 8001], limits: { max: 10 } }, products: [{ name: 'Hammer' }, { name: 'Nail' }] });
  await assert.rejects(call('toml2json', [], {}, 's = """x"""'), /multilinea/); await assert.rejects(call('toml2json', [], {}, 'senza uguale')); await assert.rejects(call('toml2json', [], {}, 'a = boh'), /Riga 1/);
});
test('xml2json / json2xml', async () => {
  const xml = '<?xml version="1.0"?>\n<!-- c --><catalog id="7"><book id="1"><title>A &amp; B</title><price>10</price></book><book id="2"><title><![CDATA[<C>]]></title></book><empty/><note lang="it">ciao</note></catalog>';
  const j = await J('xml2json', [], {}, xml); assert.deepStrictEqual(j, { catalog: { '@id': '7', book: [{ '@id': '1', title: 'A & B', price: '10' }, { '@id': '2', title: '<C>' }], empty: null, note: { '@lang': 'it', '#text': 'ciao' } } });
  const back = await call('json2xml', [], {}, JSON.stringify(j)); assert.deepStrictEqual(await J('xml2json', [], {}, back), j); assert.match(await call('json2xml', [], { root: 'r' }, '{"a":[1,2],"b":"<x>"}'), /<r>\n  <a>1<\/a>\n  <a>2<\/a>\n  <b>&lt;x&gt;<\/b>\n<\/r>/);
  await assert.rejects(call('xml2json', [], {}, '<a><b></a>'), /Chiusura inattesa/); await assert.rejects(call('xml2json', [], {}, '<a>')); await assert.rejects(call('xml2json', [], {}, 'testo')); await assert.rejects(call('json2xml', [], { root: '1x' }, '{}'));
});
test('properties2json', async () => { const p = '# c\n! c2\napp.name = Mio\\ App\napp.url=http://x.it/a\\:b\nmulti = uno \\\n   due\nuni=caf\\u00e9\nsolo\nk2 : v2'; assert.deepStrictEqual(await J('properties2json', [], {}, p), { 'app.name': 'Mio App', 'app.url': 'http://x.it/a:b', multi: 'uno due', uni: 'café', solo: '', k2: 'v2' }); assert.deepStrictEqual((await J('properties2json', [], { nested: true }, 'a.b=1\na.c=2')), { a: { b: '1', c: '2' } }); });
test('html-table2csv', async () => { const h = '<table><tr><th>Nome</th><th>Prezzo</th></tr><tr><td>A &amp; B</td><td><b>1,5</b></td></tr><tr><td>Con "virgolette"</td><td>x<br>y</td></tr></table><table><tr><td>2</td></tr></table>'; assert.strictEqual(await call('html-table2csv', [], {}, h), 'Nome,Prezzo\nA & B,"1,5"\n"Con ""virgolette""",x y'); assert.strictEqual(await call('html-table2csv', [], { index: 2 }, h), '2'); await assert.rejects(call('html-table2csv', [], { index: 3 }, h)); await assert.rejects(call('html-table2csv', [], {}, '<p>no</p>')); });
test('json2sql / csv2sql', async () => {
  const d = JSON.stringify([{ nome: "L'Aquila", eta: 30, ok: true, x: null, o: { a: 1 } }, { nome: 'B', eta: 1.5 }]);
  assert.strictEqual(await call('json2sql', [], { table: 'utenti' }, d), 'INSERT INTO "utenti" ("nome", "eta", "ok", "x", "o") VALUES\n  (\'L\'\'Aquila\', 30, TRUE, NULL, \'{"a":1}\'),\n  (\'B\', 1.5, NULL, NULL, NULL);'); assert.match(await call('json2sql', [], { table: 't', dialect: 'mysql' }, '[{"a":true}]'), /INSERT INTO `t` \(`a`\) VALUES\n  \(TRUE\);/); assert.match(await call('json2sql', [], { table: 't', dialect: 'sqlite' }, '[{"a":true}]'), /\(1\);/);
  assert.strictEqual(await call('csv2sql', [], { table: 't', types: true }, 'a,b,c\n1,x,\n007,true,2.5'), 'INSERT INTO "t" ("a", "b", "c") VALUES\n  (1, \'x\', NULL),\n  (\'007\', TRUE, 2.5);'); assert.match(await call('csv2sql', [], { table: 't' }, 'a\n1'), /\('1'\);/);
  await assert.rejects(call('json2sql', [], { table: 'x; DROP TABLE y' }, '[{"a":1}]')); await assert.rejects(call('json2sql', [], { table: 't' }, '[{"a b":1}]')); await assert.rejects(call('json2sql', [], {}, '[{"a":1}]')); await assert.rejects(call('json2sql', [], { table: 't' }, '{"a":1}')); await assert.rejects(call('json2sql', [], { table: 't', dialect: 'oracle' }, '[{"a":1}]')); await assert.rejects(call('json2sql', [], { table: 't' }, '[]'));
});
