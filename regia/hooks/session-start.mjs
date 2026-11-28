#!/usr/bin/env node
// REGIA SessionStart: short project context, the rules in one line, last decisions, Qwen status.
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, readStdin, projectName, emit, isMain, ollamaPick, ollamaUrls, dataDir, writeJsonAtomic, billingRisks } from './lib/common.mjs';

function branch(cwd) {
  try { return execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).toString().trim(); } catch { return null; }
}

export async function sessionContext(cwd, { cfg = loadConfig() } = {}) {
  const progetto = projectName(cwd);
  const info = cfg.progetti?.[progetto];
  const lines = [];
  const desc = info && typeof info === 'object' ? [info.tipo, info.sito, info.norma].filter(Boolean).join(', ') : '';
  const b = branch(cwd);
  lines.push(`REGIA attiva. Progetto: ${progetto}${desc ? ` (${desc})` : ''}${b ? `. Ramo: ${b}` : ''}.`);
  lines.push('Regole: nessuna mail, pagamento o acquisto senza consenso esplicito di l’utente; nessun segreto in file, log o memoria; push diretto su main solo con conferma. Il guard le fa rispettare.');
  const prefs = (Array.isArray(cfg.preferenze) ? cfg.preferenze : []).map((x) => String(x).trim()).filter(Boolean);
  if (prefs.length) lines.push(`Come lavorare con l’utente: ${prefs.join(' ')}`);
  const risks = billingRisks();
  if (risks.length) lines.push(`ATTENZIONE, dillo subito a l’utente: ${risks[0]}`);

  const p = await ollamaPick('chat', Math.min(cfg.ollama.timeoutMs, 1500));
  writeJsonAtomic(join(dataDir(), 'ollama.json'), { ok: p.ok, modelli: p.models || [], url: p.host || ollamaUrls(cfg).join(', '), host: p.hosts, controllato: new Date().toISOString(), errore: p.error || null });
  const model = p.ok ? p.model : null;
  const up = (p.hosts || []).filter((h) => h.ok).length;
  lines.push(model
    ? `Qwen locale disponibile (${model} su ${p.host}${up > 1 ? `, ${up} host attivi` : ''}): usa mcp__regia-local__local_llm per riassunti, classificazioni, estrazioni JSON, traduzioni e prime bozze.`
    : 'Qwen locale non raggiungibile: lavora senza delega locale.');

  try {
    const { openStore, memoryList } = await import('../mcp/regia-memory/store.mjs');
    const store = await openStore();
    const recent = [...memoryList(store, { progetto, tipo: 'vincolo', limite: 3 }), ...memoryList(store, { progetto, tipo: 'decisione', limite: 3 })].slice(0, 4);
    if (recent.length) {
      lines.push('Ultime decisioni e vincoli (memoria REGIA):');
      for (const r of recent) lines.push(`- [${r.id}] ${r.tipo}: ${r.testo.length > 200 ? r.testo.slice(0, 199) + '…' : r.testo}`);
    }
  } catch { /* memory not available: skip */ }
  return lines.join('\n');
}

async function main() {
  let hook = {};
  try { hook = JSON.parse(await readStdin()); } catch { /* defaults */ }
  const ctx = await sessionContext(hook.cwd || process.cwd());
  emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } });
}

if (isMain(import.meta.url)) main().catch(() => { /* never break a session start */ });
