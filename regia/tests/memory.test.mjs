// Memory tests: both backends, secret refusal, scope, and the MCP server over stdio, without Ollama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9'; // closed port: Ollama absent
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { openStore, resetStore, memoryStore, memorySearch, memoryList, memoryForget, memoryExport, hasSqlite } = await import('../mcp/regia-memory/store.mjs');
const SQLITE = await hasSqlite(); // Node 20 and 22 before 22.13: JSON backend only
const FAKE_TOKEN = 'ghp_' + 'Z9y8X7w6'.repeat(5);

for (const forceJson of [false, true]) {
  const label = forceJson ? 'json' : 'sqlite';
  test(`${label}: salva, cerca, elenca, dimentica, esporta`, { skip: !forceJson && !SQLITE && 'node:sqlite non disponibile in questa versione di Node' }, async () => {
    resetStore();
    const store = await openStore({ dir: mkdtempSync(join(tmpdir(), 'regia-mem-')), forceJson });
    assert.equal(store.kind.startsWith(forceJson ? 'json' : 'sqlite'), true);
    const a = await memoryStore(store, { testo: 'Le pagine prodotto usano SSG con prerender, niente SSR.', tipo: 'decisione', progetto: 'mio-sito.it', tag: 'seo,ssg' });
    await memoryStore(store, { testo: 'Mai inviare mail ai clienti senza conferma dell’utente.', tipo: 'vincolo', progetto: 'globale' });
    await memoryStore(store, { testo: 'Gallerie: luminanza di soglia calcolata secondo UNI 11095.', tipo: 'lezione', progetto: 'calcolo-esempio' });
    const dup = await memoryStore(store, { testo: 'Le pagine prodotto usano SSG con prerender, niente SSR.', tipo: 'decisione', progetto: 'mio-sito.it' });
    assert.equal(dup.duplicato, true);
    assert.equal(dup.id, a.id);

    const r = await memorySearch(store, { query: 'prerender delle pagine', progetto: 'mio-sito.it' });
    assert.equal(r.modo, 'testo', 'senza Ollama solo ricerca testuale');
    assert.equal(r.risultati[0].id, a.id);
    const g = await memorySearch(store, { query: 'mail clienti', progetto: 'mio-sito.it' });
    assert.equal(g.risultati.length, 1, 'i ricordi globali valgono in ogni progetto');
    const other = await memorySearch(store, { query: 'UNI 11095 luminanza', progetto: 'mio-sito.it' });
    assert.equal(other.risultati.length, 0, 'i ricordi di un altro progetto non si vedono');
    const accent = await memorySearch(store, { query: 'luminanza soglia', progetto: 'calcolo-esempio' });
    assert.equal(accent.risultati.length, 1);

    assert.equal(memoryList(store, { progetto: 'mio-sito.it' }).length, 2);
    const md = memoryExport(store, { progetto: 'mio-sito.it' });
    assert.match(md, /## Decisione/);
    assert.match(md, /## Vincolo/);

    const f = memoryForget(store, { id: a.id });
    assert.equal(f.cancellato, true);
    assert.equal((await memorySearch(store, { query: 'prerender', progetto: 'mio-sito.it' })).risultati.length, 0);
    assert.equal(memoryForget(store, { id: 9999 }).cancellato, false);
  });

  test(`${label}: rifiuta segreti e tipi non validi`, { skip: !forceJson && !SQLITE && 'node:sqlite non disponibile' }, async () => {
    resetStore();
    const store = await openStore({ dir: mkdtempSync(join(tmpdir(), 'regia-mem-')), forceJson });
    await assert.rejects(memoryStore(store, { testo: `token del deploy ${FAKE_TOKEN}`, tipo: 'stato' }), /Non salvo segreti/);
    await assert.rejects(memoryStore(store, { testo: 'x', tipo: 'pettegolezzo' }), /Tipo non valido/);
    await assert.rejects(memoryStore(store, { testo: '   ', tipo: 'stato' }), /vuoto/);
    assert.equal(memoryList(store).length, 0);
  });
}

function rpcClient(env) {
  const child = spawn(process.execPath, [join(ROOT, 'mcp', 'regia-memory', 'server.mjs')], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = ''; const waiting = new Map(); let next = 1;
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      const msg = JSON.parse(line);
      waiting.get(msg.id)?.(msg); waiting.delete(msg.id);
    }
  });
  const call = (method, params) => new Promise((res) => { const id = next++; waiting.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const notify = (method) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
  return { call, notify, close: () => child.stdin.end(), child };
}

test('server MCP: initialize, tools/list, store, search, segreto rifiutato', async () => {
  const c = rpcClient({ REGIA_DATA_DIR: mkdtempSync(join(tmpdir(), 'regia-mcp-')), REGIA_PROJECT_DIR: '/tmp/sito-prova' });
  try {
    const init = await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'regia-memory');
    c.notify('notifications/initialized');
    const list = await c.call('tools/list', {});
    assert.deepEqual(list.result.tools.map((t) => t.name).sort(), ['memory_export', 'memory_forget', 'memory_list', 'memory_search', 'memory_store']);
    const st = await c.call('tools/call', { name: 'memory_store', arguments: { testo: 'Deploy solo da PR con preview verde.', tipo: 'vincolo' } });
    assert.match(st.result.content[0].text, /Salvato \(id 1/);
    const se = await c.call('tools/call', { name: 'memory_search', arguments: { query: 'deploy preview' } });
    assert.match(se.result.content[0].text, /\[1\]/);
    const bad = await c.call('tools/call', { name: 'memory_store', arguments: { testo: `chiave ${FAKE_TOKEN}`, tipo: 'stato' } });
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /Non salvo segreti/);
    const unknown = await c.call('tools/call', { name: 'nope', arguments: {} });
    assert.equal(unknown.error.code, -32602);
  } finally { c.close(); }
});
