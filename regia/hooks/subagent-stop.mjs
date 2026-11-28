#!/usr/bin/env node
// REGIA SubagentStart / SubagentStop: active agents (status line), outcome and tokens per agent
// (router statistics, /costi). Outcome comes from the "ESITO: ..." line every REGIA agent writes.
import { loadConfig, readStdin, appendJsonl, projectName, isMain } from './lib/common.mjs';
import { readUsage, totals, waitStable } from './lib/usage.mjs';
import { updateJson, addConsumo, localDay, parseEsito, readData } from './lib/stats.mjs';

export function onStart(hook) {
  updateJson('attivi.json', {}, (a) => {
    const s = (a[hook.session_id] = a[hook.session_id] || {});
    s[hook.agent_id] = { tipo: hook.agent_type || 'sconosciuto', inizio: new Date().toISOString() };
    // drop anything older than 3 hours (crashed agents)
    for (const [sid, agents] of Object.entries(a)) {
      for (const [id, info] of Object.entries(agents)) if (Date.now() - Date.parse(info.inizio) > 3 * 3600e3) delete agents[id];
      if (!Object.keys(agents).length) delete a[sid];
    }
    return a;
  });
}

export function onStop(hook) {
  let started = null;
  updateJson('attivi.json', {}, (a) => {
    started = a[hook.session_id]?.[hook.agent_id]?.inizio || null;
    if (a[hook.session_id]) {
      delete a[hook.session_id][hook.agent_id];
      if (!Object.keys(a[hook.session_id]).length) delete a[hook.session_id];
    }
    return a;
  });
  waitStable(hook.agent_transcript_path);
  const usage = hook.agent_transcript_path ? totals(readUsage(hook.agent_transcript_path)) : null;
  const esito = parseEsito(hook.last_assistant_message);
  const rotta = readData('rotte.json', {})[hook.session_id];
  const progetto = projectName(hook.cwd || process.cwd());
  const agente = hook.agent_type || 'sconosciuto';
  const rec = {
    sessione: hook.session_id, agentId: hook.agent_id, progetto, agente, esito,
    tipo: rotta?.agente === agente ? rotta.tipo : 'generico',
    ms: started ? Date.now() - Date.parse(started) : null,
    token: usage?.netto ?? null, stimato: Boolean(usage?.stimati),
  };
  appendJsonl('agenti.jsonl', rec);
  if (usage) {
    updateJson('consumi.json', { sessioni: {}, giorni: {} }, (c) => addConsumo(c, { giorno: localDay(), progetto, agente, delta: usage }));
    // the main Stop hook counts again later and adds what was still being written
    updateJson('ricontare.json', {}, (r) => {
      (r[hook.session_id] = r[hook.session_id] || {})[hook.agent_id] = { path: hook.agent_transcript_path, agente, progetto, contati: usage };
      return r;
    });
  }
  return rec;
}

async function main() {
  let hook;
  try { hook = JSON.parse(await readStdin()); } catch { return; }
  if (!hook.session_id || !hook.agent_id) return;
  loadConfig();
  if (hook.hook_event_name === 'SubagentStart') onStart(hook);
  else onStop(hook);
}

if (isMain(import.meta.url)) main().catch(() => { /* stats never break an agent */ });
