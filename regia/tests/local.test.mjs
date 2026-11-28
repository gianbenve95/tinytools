// local_llm tests: clear fallback without Ollama, real call shape with a fake local Ollama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fakeOllama } from './helpers/fake-ollama.mjs';

process.env.REGIA_DATA_DIR = mkdtempSync(join(tmpdir(), 'regia-local-'));
process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9';
const common = await import('../hooks/lib/common.mjs');
const { localLlm, localStatus } = await import('../mcp/regia-local/server.mjs');

test('senza Ollama: "Qwen non disponibile" e nessun errore', async () => {
  common.resetConfigCache();
  const r = await localLlm({ compito: 'riassumi', testo: 'Un testo lungo da riassumere.' });
  assert.equal(r.ok, false);
  assert.match(r.testo, /^Qwen non disponibile: Ollama non raggiungibile/);
  assert.match(await localStatus(), /non raggiungibile/);
});

test('compito non valido viene rifiutato', async () => {
  await assert.rejects(localLlm({ compito: 'paga', testo: 'x' }), /Compito non valido/);
});

test('con Ollama: modello rilevato (qwen preferito), JSON per estrai_json, log dei token', async () => {
  const o = await fakeOllama({ models: ['llama3.2:3b', 'qwen2.5:14b', 'nomic-embed-text:latest'], chat: (b) => (b.format ? '{"cliente":"Comune di Prova"}' : '- punto uno\n- punto due') });
  try {
    process.env.REGIA_OLLAMA_URL = o.url;
    common.resetConfigCache();
    const r = await localLlm({ compito: 'riassumi', testo: 'Testo della riunione.' });
    assert.equal(r.ok, true);
    assert.match(r.testo, /punto uno/);
    assert.match(r.testo, /Qwen locale: qwen2\.5:14b/);
    const j = await localLlm({ compito: 'estrai_json', testo: 'Offerta per il Comune di Prova', schema: { type: 'object', properties: { cliente: { type: 'string' } } } });
    assert.match(j.testo, /Comune di Prova/);
    const chatCall = o.calls.filter((c) => c.path === '/api/chat').pop();
    assert.equal(chatCall.body.model, 'qwen2.5:14b');
    assert.deepEqual(chatCall.body.format, { type: 'object', properties: { cliente: { type: 'string' } } });
    const log = readFileSync(join(process.env.REGIA_DATA_DIR, 'locale.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(log.filter((l) => l.ok).length, 2);
    assert.equal(log.at(-1).tokenIn + log.at(-1).tokenOut, 70);
    assert.match(await localStatus(), /Chat: qwen2\.5:14b su http:\/\/127\.0\.0\.1:\d+\. Embedding: nomic-embed-text:latest su/);
  } finally { await o.close(); process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9'; common.resetConfigCache(); }
});

test('cluster: host spento saltato, modello preferito trovato sul secondo, distribuzione a giro', async () => {
  const a = await fakeOllama({ models: ['llama3.2:3b'], chat: () => 'da A' });
  const b = await fakeOllama({ models: ['qwen2.5:7b'], chat: () => 'da B' });
  const c = await fakeOllama({ models: ['qwen2.5:7b'], chat: () => 'da C' });
  try {
    process.env.REGIA_OLLAMA_URL = `http://127.0.0.1:9, ${a.url}, ${b.url}, ${c.url}`;
    common.resetConfigCache();
    const t0 = Date.now();
    const r = await localLlm({ compito: 'riassumi', testo: 'x' });
    assert.ok(Date.now() - t0 < 2500, 'gli host si interrogano in parallelo');
    assert.match(r.testo, /^da B/, 'qwen preferito: B prima di A, host spento saltato');
    const forced = await localLlm({ compito: 'riassumi', testo: 'x', modello: 'llama3.2:3b' });
    assert.match(forced.testo, /^da A/, 'modello richiesto: va dove c\'è');
    const st = await localStatus();
    assert.match(st, /Ollama, 3\/4 host attivi/);
    assert.match(st, /127\.0\.0\.1:9: non risponde/);
    common.loadConfig().ollama.distribuzione = 'giro';
    const outs = [];
    for (let i = 0; i < 4; i++) outs.push((await localLlm({ compito: 'riassumi', testo: 'x' })).testo.slice(0, 4));
    assert.deepEqual([...new Set(outs)].sort(), ['da B', 'da C'], 'a giro tra B e C, che hanno lo stesso modello');
  } finally {
    await a.close(); await b.close(); await c.close();
    process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9';
    common.resetConfigCache();
  }
});

test('scelta del modello per la delega: un 4-14B prima di un 27B lento, qwen a parità, su qualsiasi host', async () => {
  assert.equal(common.modelSizeB('qwen3.8:27b-q4_K_M'), 27);
  assert.equal(common.modelSizeB('mistral:latest'), null);
  assert.equal(common.pickModel(['bge-m3:latest', 'gemma4:12b', 'qwen3.8:27b-q4_K_M']), 'gemma4:12b', 'il 27B non è la prima scelta');
  assert.equal(common.pickModel(['gemma4:12b', 'qwen3.5:9b']), 'qwen3.5:9b', 'stessa fascia: qwen');
  assert.equal(common.pickModel(['qwen3.8:27b', 'llama3.3:70b']), 'qwen3.8:27b', 'solo grandi: il più piccolo');
  assert.equal(common.pickModel(['gemma4:12b', 'qwen3.5:9b'], 'gemma4:12b'), 'gemma4:12b', 'il modello in config vince');
  // A second computer: the big qwen on 11434, a 9B qwen on 11435.
  const a = await fakeOllama({ models: ['bge-m3:latest', 'gemma4:12b', 'qwen3.8:27b-q4_K_M', 'qwen3.8:27b'], chat: () => 'da A' });
  const b = await fakeOllama({ models: ['qwen3.5:9b'], chat: () => 'da B' });
  try {
    process.env.REGIA_OLLAMA_URL = `${a.url}, ${b.url}`;
    common.resetConfigCache();
    const p = await common.ollamaPick('chat');
    assert.equal(p.model, 'qwen3.5:9b');
    assert.equal(p.host, b.url, 'il modello migliore vince anche se sta sul secondo host');
    assert.match((await localLlm({ compito: 'riassumi', testo: 'x' })).testo, /^da B/);
    assert.equal((await common.ollamaPick('embed')).model, 'bge-m3:latest');
  } finally {
    await a.close(); await b.close();
    process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9';
    common.resetConfigCache();
  }
});

test('scelta del modello, casi della revisione: MoE per dimensione totale, latest, rerank, dimensioni da Ollama', () => {
  assert.equal(common.modelSizeB('qwen3:30b-a3b'), 30, 'MoE: conta quanto va caricato');
  assert.equal(common.pickModel(['gemma3:12b', 'qwen3:30b-a3b']), 'gemma3:12b');
  assert.equal(common.pickModel(['qwen2.5:32b', 'qwen3:235b-a22b']), 'qwen2.5:32b');
  assert.equal(common.pickModel(['qwen3:235b-a22b', 'llama3.3:70b', 'gpt-oss:120b']), 'llama3.3:70b');
  assert.equal(common.pickModel(['qwen2.5:latest', 'gemma3:4b']), 'qwen2.5:latest', 'dimensione ignota: resta nella fascia veloce, qwen prima');
  assert.equal(common.pickModel(['paraphrase-multilingual:278m', 'qwen3:32b']), 'qwen3:32b', 'un modello di embedding non chatta');
  assert.equal(common.pickModel(['bge-reranker-v2-m3', 'nomic-embed-text'], null, 'embed'), 'nomic-embed-text', 'un reranker non fa embedding');
  assert.equal(common.pickModel(['qwen2.5:latest', 'gemma3:12b'], null, 'chat', { 'qwen2.5:latest': 32 }), 'gemma3:12b', 'la dimensione dichiarata da Ollama vince sul nome');
  for (const x of [null, undefined, 42, 'latest', '']) assert.doesNotThrow(() => common.chatRank(x));
});
