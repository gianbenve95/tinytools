// Router tests: 30 Italian prompts, complexity, output limits, silent fallback without Ollama,
// level 2 with a fake local Ollama, level 3 tiebreak with past outcomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { fakeOllama } from './helpers/fake-ollama.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.REGIA_DATA_DIR = mkdtempSync(join(tmpdir(), 'regia-route-'));
process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9';
const common = await import('../hooks/lib/common.mjs');
const { classifyKeywords, tiebreak, route, render } = await import('../hooks/route.mjs');

// Written together with the keyword table: they show it works, not how well it generalizes.
export const PROMPTS = [
  ['Calcola la luminanza nella zona di soglia della galleria secondo UNI 11095', 'illuminotecnico'],
  ['Verifica che le tabelle di illuminamento della strada rispettino la EN 13201 classe M3', 'illuminotecnico'],
  ['Controlla la coerenza delle unità tra lux e cd/m2 nel motore di calcolo', 'illuminotecnico'],
  ['Il file eulumdat del proiettore non viene letto, controlla il parser delle fotometrie', 'illuminotecnico'],
  ['Aggiungi la sitemap e il robots.txt al sito', 'seo-tecnico'],
  ['La pagina prodotti non ha meta description né canonical, sistemala', 'seo-tecnico'],
  ['Perché Search Console dice che 200 pagine non sono indicizzate?', 'seo-tecnico'],
  ['Migliora LCP e CLS della home, Lighthouse dà 60 su mobile', 'seo-tecnico'],
  ['Controlla se ci sono segreti esposti nel repository', 'sicurezza'],
  ['Fai un npm audit e sistema le dipendenze vulnerabili', 'sicurezza'],
  ['Le policy RLS di Supabase lasciano leggere gli ordini a tutti?', 'sicurezza'],
  ['Il form di contatto è vulnerabile a XSS?', 'sicurezza'],
  ['Dopo il merge controlla che la produzione su Vercel risponda e non ci siano errori in console', 'verificatore-live'],
  ['Il deploy della preview è andato? Controlla il sito', 'verificatore-live'],
  ['Scrivi i test con vitest per la funzione di calcolo del preventivo', 'tester'],
  ['Aumenta la copertura dei test sul carrello', 'tester'],
  ['Fai una code review del diff di questo branch', 'revisore'],
  ['Rivedi la PR #42 e dimmi se ci sono regressioni', 'revisore'],
  ['Dobbiamo scegliere tra Supabase e un database Postgres gestito: scrivi un ADR', 'architetto'],
  ['Quale architettura per il configuratore 3D? Valuta i trade-off', 'architetto'],
  ['Pianifica il lavoro per il nuovo catalogo: scomponi in fasi', 'pianificatore'],
  ['Da dove parto per migrare il sito? Fammi un piano di lavoro', 'pianificatore'],
  ['Aggiorna il README con le istruzioni di installazione', 'documentatore'],
  ['Prepara la bozza della mail di fine lavoro per il cliente', 'documentatore'],
  ['Scrivi il changelog della versione 2.3', 'documentatore'],
  ['Cerca la documentazione ufficiale di React Router 7 con i link', 'ricercatore'],
  ['Confronta le librerie per generare PDF in Node, con fonti', 'ricercatore'],
  ['Il pulsante di invio del form non funziona, correggi il bug', 'sviluppatore'],
  ['Implementa un componente React per il filtro dei prodotti', 'sviluppatore'],
  ['Aggiungi un endpoint API che restituisce le schede tecniche', 'sviluppatore'],
];

test('30 prompt in italiano: agente corretto (livello 1)', () => {
  assert.equal(PROMPTS.length, 30);
  const wrong = PROMPTS.filter(([p, exp]) => classifyKeywords(p).ranked[0]?.agente !== exp);
  assert.deepEqual(wrong, []);
});

test('complessità: task piccolo 1-2, task multi-dominio >= 3 con sciame', () => {
  const small = classifyKeywords('Correggi il refuso nel titolo della pagina contatti');
  assert.ok(small.complessita <= 2);
  assert.equal(small.serveSciame, false);
  const big = classifyKeywords('Sistema il bug del form di contatto, aggiungi meta description e canonical a tutte le pagine e scrivi i test con vitest');
  assert.ok(big.complessita >= 3, `complessità ${big.complessita}`);
  assert.equal(big.serveSciame, true);
});

test('parole che contengono "test" non sono test', () => {
  assert.notEqual(classifyKeywords('Riscrivi il testo della pagina chi siamo').ranked[0]?.agente, 'tester');
});

test('tiebreak: a parità vince chi ha più successi', () => {
  const ranked = [{ agente: 'sviluppatore', tipo: 'codice', punti: 4 }, { agente: 'tester', tipo: 'codice', punti: 4 }];
  const rates = { 'sviluppatore|codice': { ok: 1, tot: 4 }, 'tester|codice': { ok: 4, tot: 4 } };
  assert.equal(tiebreak(ranked, rates).scelta.agente, 'tester');
  assert.equal(tiebreak(ranked, rates).fonte, 'statistiche');
  assert.equal(tiebreak([{ agente: 'a', punti: 10 }, { agente: 'b', punti: 2 }], rates).scelta.agente, 'a');
});

test('render: massimo 5 righe e ~400 token', () => {
  const r = { agente: 'sviluppatore', tipo: 'codice', complessita: 2, serveSciame: false, fonte: 'parole chiave', ricordi: Array.from({ length: 8 }, (_, i) => ({ id: i, tipo: 'decisione', progetto: 'x', testo: 'parola '.repeat(120) })) };
  const out = render(r);
  assert.ok(out.split('\n').length <= 5);
  assert.ok(out.length <= 1500);
});

test('hook senza Ollama: fallback silenzioso, nessun errore, contesto breve', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'hooks', 'route.mjs')], {
    input: JSON.stringify({ session_id: 's1', prompt: 'Aggiungi la sitemap e il robots.txt al sito', cwd: '/tmp' }),
    env: { ...process.env, REGIA_OLLAMA_URL: 'http://127.0.0.1:9' }, encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /seo-tecnico/);
  assert.match(out.hookSpecificOutput.additionalContext, /euristica/);
});

test('hook: prompt brevi e comandi non vengono instradati', () => {
  for (const prompt of ['ok', 'procedi', '/sciame sistema tutto']) {
    const r = spawnSync(process.execPath, [join(ROOT, 'hooks', 'route.mjs')], { input: JSON.stringify({ prompt }), encoding: 'utf8' });
    assert.equal(r.stdout, '');
  }
});

test('livello 2: Qwen locale classifica entro il tempo', async () => {
  const o = await fakeOllama({ chat: () => JSON.stringify({ agente: 'documentatore', tipo_task: 'documentazione', complessita: 2, serve_sciame: false }) });
  try {
    process.env.REGIA_OLLAMA_URL = o.url;
    common.resetConfigCache();
    writeFileSync(join(process.env.REGIA_DATA_DIR, 'ollama.json'), '{}');
    const r = await route('Sistemami questa cosa per favore, grazie mille', { cwd: '/tmp', memory: false });
    assert.equal(r.agente, 'documentatore');
    assert.match(r.fonte, /qwen locale \(qwen2\.5:7b\)/);
    assert.ok(o.calls.some((c) => c.path === '/api/chat' && c.body.format === 'json'));
  } finally { await o.close(); process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9'; common.resetConfigCache(); }
});

test('livello 2: Ollama lento oltre 2 s viene ignorato', async () => {
  const o = await fakeOllama({ delayMs: 2500, chat: () => JSON.stringify({ agente: 'documentatore', complessita: 1 }) });
  try {
    process.env.REGIA_OLLAMA_URL = o.url;
    common.resetConfigCache();
    writeFileSync(join(process.env.REGIA_DATA_DIR, 'ollama.json'), '{}');
    const t0 = Date.now();
    const r = await route('Aggiungi la sitemap e il robots.txt al sito', { cwd: '/tmp', memory: false });
    assert.ok(Date.now() - t0 < 3000, 'non aspetta oltre il budget');
    assert.equal(r.agente, 'seo-tecnico');
    assert.equal(r.fonte, 'parole chiave');
  } finally { await o.close(); process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9'; common.resetConfigCache(); }
});

test('regole e agenti in più dalla configurazione (es. Assistente)', () => {
  const cfg = structuredClone(common.loadConfig());
  cfg.router.regoleExtra = [{ agente: 'postino', tipo: 'mail', peso: 4, regex: '\\b(casella|mailbox|posta)\\b' }, { agente: 'rotto', regex: '([' }];
  cfg.router.agentiExtra = ['postino'];
  const r = classifyKeywords('Riassumi le mail di oggi della casella Assistente', cfg);
  assert.equal(r.ranked[0].agente, 'postino');
  assert.equal(r.ranked[0].tipo, 'mail');
  assert.equal(classifyKeywords('Aggiungi la sitemap e il robots.txt al sito', cfg).ranked[0].agente, 'seo-tecnico', 'le regole di base restano');
});
