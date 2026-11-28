#!/usr/bin/env node
// REGIA Stop: reads the transcript usage (incremental), updates daily consumption and,
// above the configured threshold, shows a warning once. Never blocks.
import { join } from 'node:path';
import { loadConfig, readStdin, projectName, emit, isMain, dataDir, readJson, writeJsonAtomic } from './lib/common.mjs';
import { readUsage, totals, fmtTokens, waitStable } from './lib/usage.mjs';
import { updateJson, addConsumo, diff, localDay } from './lib/stats.mjs';

export function recordSession({ sessionId, transcriptPath, cwd, cfg = loadConfig() }) {
  const stateFile = join(dataDir(), 'stato-transcript', `${sessionId}.json`);
  const prev = readJson(stateFile, null);
  waitStable(transcriptPath, { maxMs: 800, quietMs: 200 });
  const st = readUsage(transcriptPath, prev);
  writeJsonAtomic(stateFile, st);
  const now = totals(st);
  const progetto = projectName(cwd);
  let warning = null;
  updateJson('consumi.json', { sessioni: {}, giorni: {} }, (c) => {
    c.sessioni = c.sessioni || {};
    const s = c.sessioni[sessionId] || { progetto, inizio: new Date().toISOString(), tot: null, avvisato: false };
    const delta = diff(s.tot || {}, now);
    addConsumo(c, { giorno: localDay(), progetto, agente: 'principale', delta });
    s.tot = now;
    s.ultimo = new Date().toISOString();
    s.progetto = progetto;
    if (!s.avvisato && now.netto > cfg.costi.sogliaAvvisoToken) {
      s.avvisato = true;
      warning = `REGIA: questa sessione ha superato ${fmtTokens(cfg.costi.sogliaAvvisoToken)} token (esclusa la cache letta: ${fmtTokens(now.netto)}). Solo un avviso: valuta /compact, una sessione nuova o la delega a Qwen per i compiti meccanici.`;
    }
    c.sessioni[sessionId] = s;
    return c;
  });
  recountSubagents(sessionId);
  return { totals: now, warning };
}

// Subagents that finished in this turn: count their transcript again, add the difference.
export function recountSubagents(sessionId) {
  const pending = readJson(join(dataDir(), 'ricontare.json'), {})[sessionId];
  if (!pending) return 0;
  let added = 0;
  const done = [];
  for (const [id, e] of Object.entries(pending)) {
    const now = totals(readUsage(e.path));
    const delta = diff(e.contati, now);
    if (delta.netto > 0 || delta.totale > 0) {
      updateJson('consumi.json', { sessioni: {}, giorni: {} }, (c) => addConsumo(c, { giorno: localDay(), progetto: e.progetto, agente: e.agente, delta }));
      added += delta.netto;
    }
    done.push(id);
  }
  updateJson('ricontare.json', {}, (r) => {
    for (const id of done) if (r[sessionId]) delete r[sessionId][id];
    if (r[sessionId] && !Object.keys(r[sessionId]).length) delete r[sessionId];
    return r;
  });
  return added;
}

async function main() {
  let hook;
  try { hook = JSON.parse(await readStdin()); } catch { return; }
  if (!hook.session_id || !hook.transcript_path) return;
  const { warning } = recordSession({ sessionId: hook.session_id, transcriptPath: hook.transcript_path, cwd: hook.cwd || process.cwd() });
  if (warning) emit({ systemMessage: warning });
}

if (isMain(import.meta.url)) main().catch(() => { /* stats never break a turn */ });
