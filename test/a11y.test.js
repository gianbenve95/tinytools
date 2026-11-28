'use strict';
const { test } = require('node:test'); const assert = require('node:assert');
const { call } = require('../src/core');
const J = async (...x) => JSON.parse(await call(...x));
const BAD = `<html><head><meta name="viewport" content="width=device-width, user-scalable=no"></head><body>
<h1>A</h1><h1>B</h1><h4>Salto</h4>
<img src="a.png"><img src="b.png" alt="">
<input type="text" id="n"><label for="x">x</label>
<a href="/x"><img src="i.png"></a><a href="/y">clicca qui</a>
<button></button><div id="d"></div><div id="d"></div>
<div tabindex="3"></div><iframe src="x"></iframe><div role="boh"></div>
<table><tr><td>1</td></tr></table></body></html>`;
const GOOD = `<!doctype html><html lang="it"><head><title>Pagina</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<a href="#main">Salta al contenuto</a><main id="main"><h1>Titolo</h1><h2>Sezione</h2>
<img src="a.png" alt="Logo" width="10" height="10"><label for="n">Nome</label><input id="n" type="text">
<a href="/x">Prezzi</a><button>Invia</button><table><tr><th>A</th></tr><tr><td>1</td></tr></table></main></body></html>`;
test('a11y-check rileva i problemi principali', async () => {
  const r = await J('a11y-check', [BAD], { json: true }); const rules = new Set(r.dettagli.map(i => i.rule));
  for (const k of ['html-lang', 'document-title', 'img-alt', 'label', 'link-name', 'link-vago', 'button-name', 'h1', 'heading-order', 'duplicate-id', 'zoom', 'tabindex', 'iframe-title', 'aria-role', 'table-th', 'landmark-main']) assert.ok(rules.has(k), 'manca ' + k);
  assert.strictEqual(r.esito, 'DA CORREGGERE'); assert.ok(r.riepilogo.errori >= 8);
});
test('a11y-check: pagina corretta senza errori', async () => {
  const r = await J('a11y-check', [GOOD]); assert.strictEqual(r.riepilogo.errori, 0); assert.strictEqual(r.riepilogo.avvisi, 0);
});
test('a11y-check: --only e input non HTML', async () => {
  const r = await J('a11y-check', [BAD], { only: 'errore' }); assert.ok(r.problemi.every(p => p.startsWith('ERRORE'))); await assert.rejects(call('a11y-check', ['solo testo']));
});
test('page-glance', async () => {
  const r = await J('page-glance', [GOOD]); assert.strictEqual(r.titolo, 'Pagina'); assert.strictEqual(r.lingua, 'it'); assert.strictEqual(r.immagini.totale, 1); assert.strictEqual(r.titoli.h1, 1); assert.ok(r.problemi.some(p => /meta description/.test(p)));
  const b = await J('page-glance', [BAD]); assert.ok(b.problemi.some(p => /più di un h1/.test(p))); assert.ok(b.problemi.some(p => /errori di accessibilità/.test(p))); assert.strictEqual(b.immagini.senzaAlt, 2);
});
