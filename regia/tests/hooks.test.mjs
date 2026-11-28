// Hooks of phase 3 and 7: post-edit, stop, subagent start/stop, session-start, status line, /costi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = mkdtempSync(join(tmpdir(), 'regia-hooks-'));
const ENV = { ...process.env, REGIA_DATA_DIR: DATA, REGIA_OLLAMA_URL: 'http://127.0.0.1:9' };
process.env.REGIA_DATA_DIR = DATA;
process.env.REGIA_OLLAMA_URL = 'http://127.0.0.1:9';

const hook = (file, input, env = {}) => spawnSync(process.execPath, [join(ROOT, ...file.split('/'))], { input: JSON.stringify(input), env: { ...ENV, ...env }, encoding: 'utf8' });

// Transcript with real-shaped lines: one message split over two lines (same id), one without usage.
function transcript(dir, msgs) {
  const p = join(dir, 'sessione.jsonl');
  writeFileSync(p, '');
  for (const m of msgs) appendFileSync(p, JSON.stringify(m) + '\n');
  return p;
}
const asst = (id, usage, text = 'ok') => ({ type: 'assistant', message: { id, role: 'assistant', content: [{ type: 'text', text }], ...(usage ? { usage } : {}) } });
const U = (i, o, cr = 0, cw = 0) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw });

test('post-edit: segreto nel file -> decision block, motivo in italiano', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regia-pe-'));
  const f = join(dir, 'config.ts');
  writeFileSync(f, `export const k = "ghp_${'A1b2C3d4'.repeat(5)}";\n`);
  const r = hook('hooks/post-edit.mjs', { tool_name: 'Write', tool_input: { file_path: f }, cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /Segreto trovato in config\.ts \(token GitHub\)/);
});

test('post-edit: file normale e .env non bloccano', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regia-pe-'));
  writeFileSync(join(dir, 'a.ts'), 'export const x = process.env.API_KEY;\n');
  writeFileSync(join(dir, '.env'), `API_KEY=sk_live_${'x9Y8z7W6'.repeat(3)}\n`);
  for (const f of ['a.ts', '.env']) {
    const r = hook('hooks/post-edit.mjs', { tool_name: 'Write', tool_input: { file_path: join(dir, f) }, cwd: dir });
    assert.equal(r.stdout, '', f);
  }
});

test('stop: token dal transcript (id duplicati contati una volta), incrementale, avviso una volta sola', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regia-st-'));
  const t = transcript(dir, [
    { type: 'user', message: { role: 'user', content: 'ciao' } },
    asst('m1', U(10, 100, 5000, 1000)), asst('m1', U(10, 100, 5000, 1000), 'seconda parte'),
    asst('m2', U(5, 50, 6000, 200)),
  ]);
  const r1 = hook('hooks/stop.mjs', { session_id: 'S1', transcript_path: t, cwd: dir }, { REGIA_CONFIG: writeCfg(dir, 1000) });
  const c1 = JSON.parse(readFileSync(join(DATA, 'consumi.json'), 'utf8'));
  assert.equal(c1.sessioni.S1.tot.netto, 10 + 100 + 1000 + 5 + 50 + 200);
  assert.equal(c1.sessioni.S1.tot.cacheRead, 11000);
  assert.match(JSON.parse(r1.stdout).systemMessage, /superato/);
  appendFileSync(t, JSON.stringify(asst('m3', U(1, 9))) + '\n');
  const r2 = hook('hooks/stop.mjs', { session_id: 'S1', transcript_path: t, cwd: dir }, { REGIA_CONFIG: writeCfg(dir, 1000) });
  assert.equal(r2.stdout, '', 'l\'avviso non si ripete');
  const c2 = JSON.parse(readFileSync(join(DATA, 'consumi.json'), 'utf8'));
  assert.equal(c2.sessioni.S1.tot.netto, 1365 + 10);
  const giorno = Object.values(c2.giorni)[0];
  assert.equal(giorno.agenti.principale, 1375, 'il giorno somma solo i delta');
});

function writeCfg(dir, soglia) {
  const p = join(dir, 'cfg.json');
  writeFileSync(p, JSON.stringify({ costi: { sogliaAvvisoToken: soglia } }));
  return p;
}

test('subagent: start registra l\'agente attivo, stop registra esito e token', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regia-sa-'));
  const t = transcript(dir, [asst('a1', U(3, 30, 0, 100))]);
  hook('hooks/subagent-stop.mjs', { hook_event_name: 'SubagentStart', session_id: 'S2', agent_id: 'ag1', agent_type: 'tester', cwd: dir });
  assert.ok(JSON.parse(readFileSync(join(DATA, 'attivi.json'), 'utf8')).S2.ag1);
  hook('hooks/subagent-stop.mjs', { hook_event_name: 'SubagentStop', session_id: 'S2', agent_id: 'ag1', agent_type: 'tester', agent_transcript_path: t, last_assistant_message: 'Tutto verde.\nESITO: completato', cwd: dir });
  assert.equal(JSON.parse(readFileSync(join(DATA, 'attivi.json'), 'utf8')).S2, undefined);
  const rec = readFileSync(join(DATA, 'agenti.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).pop();
  assert.equal(rec.agente, 'tester');
  assert.equal(rec.esito, 'completato');
  assert.equal(rec.token, 133);
  const c = JSON.parse(readFileSync(join(DATA, 'consumi.json'), 'utf8'));
  assert.equal(Object.values(c.giorni)[0].agenti.tester, 133);
});

test('session-start: contesto breve con regole e Qwen spento dichiarato', () => {
  const r = hook('hooks/session-start.mjs', { session_id: 'S3', source: 'startup', cwd: tmpdir() });
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /REGIA attiva/);
  assert.match(ctx, /nessuna mail, pagamento o acquisto/);
  assert.match(ctx, /Qwen locale non raggiungibile/);
  assert.match(ctx, /Come lavorare con l’utente: Fai tutto da solo/);
  assert.ok(ctx.split('\n').length <= 8);
});

test('status line: stessi numeri di /costi e catena con la status line esistente', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'regia-sl-'));
  const t = transcript(dir, [asst('x1', U(100, 900, 50, 0))]);
  hook('hooks/stop.mjs', { session_id: 'S4', transcript_path: t, cwd: dir });
  const r = spawnSync(process.execPath, [join(ROOT, 'statusline', 'statusline.mjs')], { input: JSON.stringify({ session_id: 'S4', transcript_path: t, workspace: { project_dir: dir } }), env: ENV, encoding: 'utf8' });
  assert.match(r.stdout, /^REGIA .+ \| agenti 0 \| 1k tok \| Qwen off$/);
  const { costi } = await import('../bin/costi.mjs');
  const out = costi();
  assert.match(out, /\| oggi \|/);
  assert.match(out, /principale/);
});

test('subagent: l\'ultima riga scritta dopo SubagentStop viene aggiunta dallo Stop principale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regia-rc-'));
  const sub = transcript(dir, [asst('r1', U(1, 10, 0, 0))]);
  hook('hooks/subagent-stop.mjs', { hook_event_name: 'SubagentStop', session_id: 'S5', agent_id: 'ag5', agent_type: 'revisore', agent_transcript_path: sub, last_assistant_message: 'ESITO: completato', cwd: dir });
  appendFileSync(sub, JSON.stringify(asst('r2', U(2, 20, 0, 0))) + '\n'); // flushed late
  const main = join(dir, 'main.jsonl');
  writeFileSync(main, JSON.stringify(asst('p1', U(1, 1, 0, 0))) + '\n');
  hook('hooks/stop.mjs', { session_id: 'S5', transcript_path: main, cwd: dir });
  const c = JSON.parse(readFileSync(join(DATA, 'consumi.json'), 'utf8'));
  assert.equal(Object.values(c.giorni)[0].agenti.revisore, 33, '11 contati subito + 22 aggiunti dopo');
  assert.equal(JSON.parse(readFileSync(join(DATA, 'ricontare.json'), 'utf8')).S5, undefined);
});
