'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
const tmp = (name, c) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-csv-')), name); fs.writeFileSync(p, c); return p; };
const CSV = 'nome,cat,prezzo\n"Rossi, A",x,10\nBianchi,y,9\nCarli,x,100\nDoppio,y,9\n';

test('csv-sort (numerico, discendente, per indice, virgolette)', async () => {
  assert.strictEqual(await call('csv-sort', [], { col: 'prezzo' }, CSV), 'nome,cat,prezzo\nBianchi,y,9\nDoppio,y,9\n"Rossi, A",x,10\nCarli,x,100'); assert.strictEqual((await call('csv-sort', [], { col: 3, desc: true }, CSV)).split('\n')[1], 'Carli,x,100'); assert.strictEqual((await call('csv-sort', [], { col: 'nome' }, CSV)).split('\n')[1], 'Bianchi,y,9'); await assert.rejects(call('csv-sort', [], { col: 'zzz' }, CSV)); await assert.rejects(call('csv-sort', [], {}, CSV));
});
test('csv-filter', async () => {
  assert.strictEqual(await call('csv-filter', [], { where: 'prezzo>9 && cat=x' }, CSV), 'nome,cat,prezzo\n"Rossi, A",x,10\nCarli,x,100'); assert.strictEqual(await call('csv-filter', [], { where: 'nome~^b' }, CSV), 'nome,cat,prezzo\nBianchi,y,9'); assert.strictEqual(await call('csv-filter', [], { where: 'prezzo<=9' }, CSV).then(x => x.split('\n').length), 3); assert.strictEqual(await call('csv-filter', [], { where: 'nome^=Car' }, CSV), 'nome,cat,prezzo\nCarli,x,100'); await assert.rejects(call('csv-filter', [], { where: 'boh' }, CSV)); await assert.rejects(call('csv-filter', [], {}, CSV));
});
test('csv-select', async () => { assert.strictEqual(await call('csv-select', [], { cols: 'prezzo,nome' }, CSV), 'prezzo,nome\n10,"Rossi, A"\n9,Bianchi\n100,Carli\n9,Doppio'); assert.strictEqual((await call('csv-select', [], { cols: '3' }, CSV)).split('\n')[0], 'prezzo'); await assert.rejects(call('csv-select', [], { cols: 'x' }, CSV)); });
test('csv-join (inner e left)', async () => {
  const a = tmp('a.csv', 'id,nome\n1,Ann\n2,Bob\n3,Cy'), b = tmp('b.csv', 'id,nome,citta\n1,AnnB,Roma\n3,CyB,Pisa\n3,CyC,Lucca');
  assert.strictEqual(await call('csv-join', [a, b], { on: 'id' }), 'id,nome,b_nome,citta\n1,Ann,AnnB,Roma\n3,Cy,CyB,Pisa\n3,Cy,CyC,Lucca'); assert.strictEqual(await call('csv-join', [a, b], { on: 'id', left: true }), 'id,nome,b_nome,citta\n1,Ann,AnnB,Roma\n2,Bob,,\n3,Cy,CyB,Pisa\n3,Cy,CyC,Lucca'); await assert.rejects(call('csv-join', [a, b], { on: 'zz' })); await assert.rejects(call('csv-join', [a], { on: 'id' }));
});
test('csv-dedupe', async () => { assert.strictEqual(await call('csv-dedupe', [], { by: 'prezzo' }, CSV), 'nome,cat,prezzo\n"Rossi, A",x,10\nBianchi,y,9\nCarli,x,100'); assert.strictEqual((await call('csv-dedupe', [], {}, 'a,b\n1,2\n1,2\n1,3')).split('\n').length, 3); });
test('csv-transpose', async () => { assert.strictEqual(await call('csv-transpose', [], {}, 'a,b,c\n1,2,3'), 'a,1\nb,2\nc,3'); assert.strictEqual(await call('csv-transpose', [], {}, 'a,b\n1'), 'a,1\nb,'); });
test('csv-head', async () => { assert.strictEqual(await call('csv-head', [], { n: 1 }, CSV), 'nome,cat,prezzo\n"Rossi, A",x,10'); assert.strictEqual(await call('csv-head', [], { n: 1, mode: 'tail' }, CSV), 'nome,cat,prezzo\nDoppio,y,9'); await assert.rejects(call('csv-head', [], { mode: 'x' }, CSV)); });
test('csv-validate', async () => {
  assert.deepStrictEqual(await J('csv-validate', [], {}, CSV), { columns: 3, rows: 4, valid: true, problems: [] }); const r = await J('csv-validate', [], {}, 'a,,a\n1,2\n,,\n1,2,3'); assert.strictEqual(r.valid, false); const t = r.problems.join('|'); assert.match(t, /intestazione vuota alla colonna 2/); assert.match(t, /duplicate: a/); assert.match(t, /riga 2: 2 campi invece di 3/); assert.match(t, /riga 3: tutta vuota/);
});
test('csv-merge (unione per nome di colonna)', async () => { const a = tmp('a.csv', 'x,y\n1,2'), b = tmp('b.csv', 'y,z\n3,4'); assert.strictEqual(await call('csv-merge', [a, b]), 'x,y,z\n1,2,\n,3,4'); await assert.rejects(call('csv-merge', [a])); });
test('csv-group', async () => {
  assert.strictEqual(await call('csv-group', [], { by: 'cat', agg: 'sum:prezzo,avg:prezzo,max:prezzo' }, CSV), 'cat,count,sum_prezzo,avg_prezzo,max_prezzo\nx,2,110,55,100\ny,2,18,9,9'); assert.strictEqual(await call('csv-group', [], { by: 'cat' }, CSV), 'cat,count\nx,2\ny,2'); await assert.rejects(call('csv-group', [], { by: 'cat', agg: 'median:prezzo' }, CSV)); await assert.rejects(call('csv-group', [], {}, CSV));
});
test('delimitatore ; e tab', async () => { assert.strictEqual(await call('csv-select', [], { cols: 'b', delim: ';' }, 'a;b\n1;2'), 'b\n2'); assert.strictEqual(await call('csv-select', [], { cols: 'b', delim: 'tab' }, 'a\tb\n1\t2'), 'b\n2'); });
