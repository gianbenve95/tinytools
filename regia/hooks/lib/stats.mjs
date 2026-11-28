// Local statistics for REGIA: consumption per day/project/agent, agent outcomes, active agents.
// Everything stays in dataDir(); nothing leaves the machine.
import { mkdirSync, rmdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, readJson, writeJsonAtomic } from './common.mjs';

export function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Tiny cross-process lock (mkdir is atomic). Parallel subagents finish at the same time.
export function withLock(name, fn) {
  const lock = join(dataDir(), `${name}.lock`);
  for (let i = 0; i < 80; i++) {
    try { mkdirSync(lock); break; } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 5000) rmdirSync(lock); } catch { /* gone */ }
      const until = Date.now() + 25; while (Date.now() < until) { /* spin 25 ms */ }
    }
  }
  try { return fn(); } finally { try { rmdirSync(lock); } catch { /* ignore */ } }
}

export function updateJson(name, fallback, fn) {
  const path = join(dataDir(), name);
  return withLock(name, () => {
    const cur = readJson(path, fallback);
    const next = fn(cur) ?? cur;
    writeJsonAtomic(path, next);
    return next;
  });
}

export const readData = (name, fallback) => readJson(join(dataDir(), name), fallback);

// Adds a token delta to the day, the project and the agent ("principale" = main thread).
export function addConsumo(c, { giorno = localDay(), progetto, agente = 'principale', delta }) {
  c.giorni = c.giorni || {};
  const g = (c.giorni[giorno] = c.giorni[giorno] || { netto: 0, totale: 0, output: 0, cache: 0, stimati: 0, progetti: {}, agenti: {} });
  g.netto += delta.netto || 0;
  g.totale += delta.totale || 0;
  g.output += delta.output || 0;
  g.cache += (delta.cacheRead || 0) + (delta.cacheWrite || 0);
  g.stimati += delta.stimati || 0;
  g.progetti[progetto] = (g.progetti[progetto] || 0) + (delta.netto || 0);
  g.agenti[agente] = (g.agenti[agente] || 0) + (delta.netto || 0);
  return c;
}

export function diff(a, b) {
  const out = {};
  for (const k of Object.keys(b)) out[k] = Math.max(0, (b[k] || 0) - (a?.[k] || 0));
  return out;
}

// Agent outcomes (from SubagentStop) for the router tiebreak.
export function readEsiti() {
  const p = join(dataDir(), 'agenti.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function successRates(esiti) {
  const rates = {};
  for (const e of esiti) {
    const key = `${e.agente}|${e.tipo || 'generico'}`;
    const r = (rates[key] = rates[key] || { ok: 0, tot: 0 });
    r.tot += 1;
    if (e.esito === 'completato') r.ok += 1;
    else if (e.esito === 'parziale') r.ok += 0.5;
  }
  return rates;
}

export function parseEsito(text) {
  const m = String(text || '').match(/ESITO:\s*(completato|parziale|fallito)/i);
  return m ? m[1].toLowerCase() : 'sconosciuto';
}
