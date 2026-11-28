#!/usr/bin/env node
// REGIA router: UserPromptSubmit hook. Suggests an agent and injects a few relevant memories.
// HONEST NOTE: this is a heuristic (keyword table + optional local Qwen + past outcomes),
// not a trained model. It suggests; Claude and you decide.
import { join } from 'node:path';
import { loadConfig, readStdin, appendJsonl, projectName, emit, isMain, ollamaFetch, ollamaPick, ollamaUrls, dataDir, readJson, writeJsonAtomic } from './lib/common.mjs';
import { readEsiti, successRates, updateJson } from './lib/stats.mjs';

export const AGENTS = ['pianificatore', 'architetto', 'sviluppatore', 'tester', 'revisore', 'sicurezza', 'seo-tecnico', 'verificatore-live', 'illuminotecnico', 'documentatore', 'ricercatore'];

// [agent, task type, weight, regex]. Text is lowercased and stripped of accents first.
const RULES = [
  ['illuminotecnico', 'calcolo', 4, /\b(galleri[ae]|uni ?11095|en ?13201|illuminament\w*|luminanz\w*|lux|cd\/m2|lumen|ugr|uniformita|fotometri\w*|eulumdat|ldt|ies|relamping|dialux|fattore di manutenzione|classe (m|p|c)\d|m[1-6]\b|apparecch\w* (led|di illuminazione)|illuminazione stradale|imbocco|zona di soglia)\b/],
  ['seo-tecnico', 'seo', 4, /\b(seo|sitemap\w*|robots(\.txt)?|meta ?(tag|description|title)?|canonical|hreflang|core web vitals|lcp|cls|inp|search console|indicizz\w*|ssg|prerender\w*|schema\.org|json-ld|dati strutturati|lighthouse|og:image|anteprime social)\b/],
  ['sicurezza', 'sicurezza', 4, /\b(sicurezza|vulnerab\w*|segret[io]|secret\w*|chiav[ei] (api|esposte?)|token esposti?|permessi|injection|xss|csrf|cve|npm audit|audit (delle )?dipendenze|dipendenze vulnerabili|rls|policy|owasp|cors|csp|header di sicurezza)\b/],
  ['verificatore-live', 'deploy', 3, /\b(in produzione|produzione|live|preview|deploy\w*|vercel|pubblicat[oa]|e online|va online|errori in console|console del browser|controlla il sito|status http|404|500|e andato su|dopo il merge)\b/],
  ['tester', 'test', 3, /\b(test|tests|testa|testare|testing|vitest|jest|playwright|copertura|coverage|unit test|e2e|regressione|casi di test)\b/],
  ['revisore', 'review', 3, /\b(review|rivedi|revisiona\w*|code review|controlla (il|questo) (diff|codice)|guarda il diff|semplifica\w*|regressioni|pr #?\d+)\b/],
  ['architetto', 'architettura', 3, /\b(architettur\w*|adr|decisione tecnica|stack|trade-?off|monorepo|struttur\w* (del|il) progetto|scegliere tra|quale (libreria|framework|database)|schema del database|scalabil\w*)\b/],
  ['pianificatore', 'pianificazione', 3, /\b(pianific\w*|piano di lavoro|scomponi|roadmap|fasi|organizza\w*|priorita|da dove (inizio|parto)|plan|breakdown)\b/],
  ['documentatore', 'documentazione', 3, /\b(readme|documentazion\w*|documenta|changelog|release note|bozza|mail di fine lavoro|scrivi (una|la) (mail|email)|manuale|guida utente|verbale)\b/],
  ['ricercatore', 'ricerca', 3, /\b(ricerca|cerca (la |le )?(documentazione|fonti)|fonti|con i link|confronta (le |gli )?(librerie|strumenti|opzioni)|cosa dice la documentazione|ultima versione|approfondisci|stato dell'arte|benchmark)\b/],
  ['sviluppatore', 'bugfix', 2, /\b(bug|errore|errori|non funziona|si rompe|crash|fix|correggi|sistema (il|la|lo|questo|questa))\b/],
  ['sviluppatore', 'codice', 1, /\b(implementa\w*|aggiungi|crea (un|una|il|la)|componente|funzione|endpoint|api|form|pulsante|bottone|refactor\w*|rifattorizza|modifica|feature|funzionalita|react|typescript|hook|pagina)\b/],
];

const BIG = /\b(tutto il sito|tutte le pagine|intero|intera|migra\w*|refactoring completo|end-to-end|in parallelo|e poi|inoltre|piu (file|pagine|moduli)|da zero|completo|completa)\b/;

export function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Level 1: keyword table. Returns ranked candidates and a complexity estimate 1-5.
// Extra rules and agents from config (router.regoleExtra, router.agentiExtra): a project such as
// Assistente teaches the router its own words without touching this file.
export function allRules(cfg = loadConfig()) {
  const extra = [];
  for (const r of cfg.router?.regoleExtra || []) {
    try { if (r?.agente && r?.regex) extra.push([r.agente, r.tipo || 'generico', Number(r.peso) || 3, new RegExp(r.regex, 'i')]); } catch { /* bad regex: skipped */ }
  }
  return [...extra, ...RULES];
}
export const allAgents = (cfg = loadConfig()) => [...AGENTS, ...(cfg.router?.agentiExtra || []).filter((a) => typeof a === 'string')];

export function classifyKeywords(prompt, cfg = loadConfig()) {
  const t = normalize(prompt);
  const scores = new Map();
  for (const [agent, tipo, w, re] of allRules(cfg)) {
    const hits = (t.match(new RegExp(re.source, 'g')) || []).length;
    if (!hits) continue;
    const cur = scores.get(agent) || { agente: agent, punti: 0, tipo };
    cur.punti += w * Math.min(hits, 3);
    if (w > (cur.peso || 0)) { cur.tipo = tipo; cur.peso = w; }
    scores.set(agent, cur);
  }
  const ranked = [...scores.values()].sort((a, b) => b.punti - a.punti);
  const domains = ranked.filter((r) => r.punti >= 3).length;
  let c = 1;
  if (t.length > 200) c++;
  if (domains >= 2) c++;
  if (domains >= 3) c++;
  if (BIG.test(t)) c++;
  if ((String(prompt).match(/^\s*([-*]|\d+[.)])\s+/gm) || []).length >= 3) c++;
  const complessita = Math.min(5, c);
  return { ranked, complessita, serveSciame: complessita >= 3 && domains >= 2 };
}

// Level 3: when the top two are close, the agent with the better track record wins.
export function tiebreak(ranked, rates) {
  if (ranked.length < 2) return { scelta: ranked[0], fonte: 'parole chiave' };
  const [a, b] = ranked;
  if (b.punti < a.punti * 0.8) return { scelta: a, fonte: 'parole chiave' };
  const rate = (r) => { const s = rates[`${r.agente}|${r.tipo}`]; return s && s.tot >= 3 ? s.ok / s.tot : null; };
  const ra = rate(a); const rb = rate(b);
  if (ra !== null && rb !== null && rb > ra) return { scelta: b, fonte: 'statistiche' };
  return { scelta: a, fonte: 'parole chiave' };
}

// Level 2: local Qwen within the time budget. Never throws, never blocks.
async function classifyQwen(prompt, cfg) {
  const statusFile = join(dataDir(), 'ollama.json');
  const st = readJson(statusFile, null);
  if (st && !st.ok && Date.now() - Date.parse(st.controllato) < 60000) return null; // recently down: skip
  const started = Date.now();
  const p = await ollamaPick('chat', cfg.ollama.timeoutMs);
  writeJsonAtomic(statusFile, { ok: p.ok, modelli: p.models || [], url: p.host || ollamaUrls(cfg).join(', '), host: p.hosts, controllato: new Date().toISOString(), errore: p.error || null });
  const model = p.ok ? p.model : null;
  if (!model) return null;
  const left = cfg.ollama.timeoutMs - (Date.now() - started);
  if (left < 300) return null;
  const r = await ollamaFetch('/api/chat', {
    model, stream: false, format: 'json', options: { temperature: 0, num_predict: 80 },
    messages: [
      { role: 'system', content: `Classifica la richiesta per scegliere un agente. Agenti: ${allAgents(cfg).join(', ')}. Rispondi solo con JSON {"agente": string, "tipo_task": string, "complessita": 1-5, "serve_sciame": boolean}.` },
      { role: 'user', content: String(prompt).slice(0, 2000) },
    ],
  }, left, p.host);
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.data?.message?.content || '{}');
    if (!allAgents(cfg).includes(j.agente)) return null;
    const c = Math.round(Number(j.complessita));
    return { agente: j.agente, tipo: String(j.tipo_task || 'generico').slice(0, 30), complessita: c >= 1 && c <= 5 ? c : null, serveSciame: Boolean(j.serve_sciame), modello: model };
  } catch { return null; }
}

export async function route(prompt, { cfg = loadConfig(), cwd = process.cwd(), useQwen = cfg.router.usaOllama, memory = true } = {}) {
  const l1 = classifyKeywords(prompt, cfg);
  const rates = successRates(readEsiti());
  let { scelta, fonte } = tiebreak(l1.ranked, rates);
  let complessita = l1.complessita;
  let serveSciame = l1.serveSciame;
  const q = useQwen ? await classifyQwen(prompt, cfg) : null;
  if (q) {
    const top2 = l1.ranked.slice(0, 2).map((r) => r.agente);
    if (!scelta || scelta.punti < 3 || top2.includes(q.agente)) {
      scelta = { agente: q.agente, tipo: l1.ranked.find((r) => r.agente === q.agente)?.tipo || q.tipo, punti: scelta?.punti || 0 };
      fonte = `qwen locale (${q.modello})`;
    }
    if (q.complessita) complessita = Math.round((complessita + q.complessita) / 2);
    serveSciame = complessita >= 3 && (serveSciame || q.serveSciame);
  }
  let ricordi = [];
  const progetto = projectName(cwd);
  if (memory) {
    try {
      const { openStore, memorySearch } = await import('../mcp/regia-memory/store.mjs');
      const store = await openStore();
      ricordi = (await memorySearch(store, { query: prompt, progetto, limite: cfg.router.maxRicordi }, { embeddings: false })).risultati;
    } catch { ricordi = []; }
  }
  return { agente: scelta?.agente || null, tipo: scelta?.tipo || 'generico', complessita, serveSciame, fonte, ricordi, progetto };
}

// At most 5 lines and maxCaratteri characters (~400 tokens).
export function render(r, cfg = loadConfig()) {
  const lines = [];
  if (r.agente) {
    lines.push(`REGIA (euristica, non un modello addestrato): agente suggerito "${r.agente}" (tipo ${r.tipo}, complessità ${r.complessita}/5, fonte ${r.fonte}).${r.serveSciame ? ' Più parti indipendenti: valuta /sciame.' : ''}`);
  }
  const max = cfg.router.maxCaratteri;
  for (const m of r.ricordi.slice(0, 5 - lines.length)) {
    const room = max - lines.join('\n').length - 40;
    if (room < 60) break;
    const txt = m.testo.length > Math.min(room, 300) ? m.testo.slice(0, Math.min(room, 300) - 1) + '…' : m.testo;
    lines.push(`Ricordo [${m.id}] ${m.tipo}${m.progetto === 'globale' ? ' (globale)' : ''}: ${txt}`);
  }
  return lines.join('\n').slice(0, max);
}

const SKIP = /^\s*(\/|ok\b|si\b|sì\b|no\b|grazie|procedi|vai\b|continua)/i;

async function main() {
  let hook;
  try { hook = JSON.parse(await readStdin()); } catch { return; }
  const prompt = String(hook.prompt || '');
  const cfg = loadConfig();
  if (prompt.trim().length < cfg.router.lunghezzaMinima || SKIP.test(prompt)) return;
  const r = await route(prompt, { cfg, cwd: hook.cwd || process.cwd() });
  const ctx = render(r, cfg);
  if (hook.session_id && r.agente) {
    updateJson('rotte.json', {}, (all) => {
      all[hook.session_id] = { agente: r.agente, tipo: r.tipo, complessita: r.complessita, fonte: r.fonte, ts: new Date().toISOString() };
      const keys = Object.keys(all);
      if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete all[k];
      return all;
    });
    appendJsonl('rotte.jsonl', { sessione: hook.session_id, progetto: r.progetto, agente: r.agente, tipo: r.tipo, complessita: r.complessita, fonte: r.fonte, ricordi: r.ricordi.length });
  }
  if (ctx) emit({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: ctx } });
}

if (isMain(import.meta.url)) main().catch(() => { /* the router never breaks a prompt */ });
