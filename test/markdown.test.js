'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
const tmp = (name, c) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-md-')); fs.writeFileSync(path.join(d, name), c); return path.join(d, name); };
const MD = '# Titolo\n\nTesto con [link](https://a.it) e ![img](x.png) e `[no](code)`.\n\n```\n[skip](nope)\n# non titolo\n```\n\n## Sezione\n\n- [x] fatto\n- [ ] da fare\n';

test('md-links', async () => { const l = await J('md-links', [], {}, MD); assert.deepStrictEqual(l.map(x => [x.type, x.url, x.line]), [['link', 'https://a.it', 3], ['image', 'x.png', 3]]); });
test('md-headings', async () => { assert.strictEqual(await call('md-headings', [], {}, MD), 'Titolo  (h1, riga 1)\n  Sezione  (h2, riga 10)'); });
test('md-lint', async () => {
  assert.strictEqual(await call('md-lint', [], {}, MD), 'Nessun problema trovato');
  const out = await call('md-lint', [], { max: 20 }, '# A\n\n\n### Salto  \n#Senza\n## A\n## A\ntesto molto molto lungo qui\t'); for (const s of ['riga 3: più righe vuote', 'riga 4: salto di livello da h1 a h3', 'riga 4: spazi a fine riga', 'riga 5: manca lo spazio', 'titolo duplicato "A"', 'oltre 20 caratteri', 'tabulazione', 'manca il newline finale']) assert.ok(out.includes(s), s);
});
test('md-to-html', async () => {
  const h = await call('md-to-html', [], {}, '# T <x>\n\nciao **grassetto** e *corsivo* `a<b` [l](http://x.it) [bad](javascript:alert(1))\n\n- uno\n- [x] due\n\n1. a\n2. b\n\n> citazione\n\n```js\nlet a = 1 < 2;\n```\n\n---\n');
  for (const s of ['<h1>T &lt;x&gt;</h1>', '<strong>grassetto</strong>', '<em>corsivo</em>', '<code>a&lt;b</code>', '<a href="http://x.it">l</a>', '<ul>', '<input type="checkbox" disabled checked> due', '<ol>', '<blockquote>', '<p>citazione</p>', '<pre><code class="language-js">let a = 1 &lt; 2;', '<hr>']) assert.ok(h.includes(s), s);
  assert.ok(!h.includes('javascript:')); assert.ok(!(await call('md-to-html', [], {}, '<script>alert(1)</script>')).includes('<script>'));
});
test('md-strip', async () => { assert.strictEqual(await call('md-strip', [], {}, '# Titolo\n\n**Grassetto** e [link](http://x) e `code`\n\n- [x] voce\n> cit'), 'Titolo\n\nGrassetto e link e code\n\nvoce\ncit'); });
test('md-tasks', async () => { const t = await J('md-tasks', [], {}, MD); assert.deepStrictEqual([t.total, t.done, t.open, t.progress, t.openTasks], [2, 1, 1, '50%', ['riga 13: da fare']]); assert.strictEqual((await J('md-tasks', [], {}, 'niente'))['progress'], 'n/d'); });
test('md-front-matter', async () => {
  const r = await J('md-front-matter', [], {}, '---\ntitle: "Ciao: mondo"\ndraft: true\nn: 3\ntags: [a, b]\nauthors:\n  - Anna\n  - Bruno\n---\n# Corpo'); assert.deepStrictEqual(r.data, { title: 'Ciao: mondo', draft: true, n: 3, tags: ['a', 'b'], authors: ['Anna', 'Bruno'] }); assert.strictEqual(r.bodyStartsAtLine, 10); await assert.rejects(call('md-front-matter', [], {}, '# Niente')); await assert.rejects(call('md-front-matter', [], {}, '---\n???\n---\n'));
});
test('md-table-sort', async () => {
  const t = '| Nome | Eta |\n|---|---|\n| Carlo | 9 |\n| anna | 30 |\n| Bruno | 100 |';
  assert.strictEqual((await call('md-table-sort', [], { col: 'Nome' }, t)).split('\n').slice(2).map(x => x.split('|')[1].trim()).join(), 'anna,Bruno,Carlo'); assert.strictEqual((await call('md-table-sort', [], { col: 2, numeric: true, desc: true }, t)).split('\n')[2], '| Bruno | 100 |'); await assert.rejects(call('md-table-sort', [], { col: 'X' }, t)); await assert.rejects(call('md-table-sort', [], { col: 1 }, 'non una tabella'));
});
test('md-anchor-check', async () => {
  const f = tmp('a.md', '# Intro Veloce\n\n[ok](#intro-veloce) [no](#sparito) [file](esiste.txt) [manca](nope.md) [web](https://x.it)\n'); fs.writeFileSync(path.join(path.dirname(f), 'esiste.txt'), 'x');
  const out = await call('md-anchor-check', [], { file: f }); assert.match(out, /ancora mancante #sparito/); assert.match(out, /file mancante nope\.md/); assert.ok(!out.includes('esiste.txt') && !out.includes('intro-veloce') && !out.includes('x.it'));
  const g = tmp('b.md', '# A\n[x](#a)\n'); assert.strictEqual(await call('md-anchor-check', [], { file: g }), 'Tutti i link interni sono validi'); await assert.rejects(call('md-anchor-check', [], {}, '# A'));
});
test('md-wordcount', async () => { const r = await J('md-wordcount', [], {}, '# Ciao mondo\n\n`codice` [vai qui](http://x.it) http://y.it\n\n```\nuno due tre quattro\n```\nfine'); assert.strictEqual(r.words, 5); });
