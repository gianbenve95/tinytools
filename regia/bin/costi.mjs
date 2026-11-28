#!/usr/bin/env node
// /costi: estimated consumption today and over the last 7 days, per project and agent,
// plus the share delegated to local Qwen. Source: local REGIA data only.
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { loadConfig, dataDir, isMain } from '../hooks/lib/common.mjs';
import { readData, localDay } from '../hooks/lib/stats.mjs';
import { fmtTokens } from '../hooks/lib/usage.mjs';

function days(n) {
  const out = [];
  for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() - i); out.push(localDay(d)); }
  return out;
}

function sumDays(giorni, list) {
  const acc = { netto: 0, totale: 0, output: 0, cache: 0, stimati: 0, progetti: {}, agenti: {} };
  for (const d of list) {
    const g = giorni[d];
    if (!g) continue;
    for (const k of ['netto', 'totale', 'output', 'cache', 'stimati']) acc[k] += g[k] || 0;
    for (const [p, v] of Object.entries(g.progetti || {})) acc.progetti[p] = (acc.progetti[p] || 0) + v;
    for (const [a, v] of Object.entries(g.agenti || {})) acc.agenti[a] = (acc.agenti[a] || 0) + v;
  }
  return acc;
}

function localUsage(list) {
  const p = join(dataDir(), 'locale.jsonl');
  const set = new Set(list);
  const acc = { chiamate: 0, ok: 0, token: 0 };
  if (!existsSync(p)) return acc;
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (!set.has(localDay(new Date(o.ts)))) continue;
    acc.chiamate++;
    if (o.ok) { acc.ok++; acc.token += (o.tokenIn || 0) + (o.tokenOut || 0); }
  }
  return acc;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');
const top = (obj, n = 6) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

export function costi() {
  const cfg = loadConfig();
  const c = readData('consumi.json', { sessioni: {}, giorni: {} });
  const oggi = sumDays(c.giorni || {}, days(1));
  const sett = sumDays(c.giorni || {}, days(7));
  const qOggi = localUsage(days(1));
  const qSett = localUsage(days(7));
  const sopra = Object.values(c.sessioni || {}).filter((s) => s.avvisato && days(7).includes(localDay(new Date(s.ultimo)))).length;
  const L = [];
  L.push('Consumi stimati REGIA (token "netti" = input + output + cache scritta; la cache letta è a parte)', '');
  L.push('| periodo | netti | output | cache | delegati a Qwen | quota Qwen |', '|---|---|---|---|---|---|');
  L.push(`| oggi | ${fmtTokens(oggi.netto)} | ${fmtTokens(oggi.output)} | ${fmtTokens(oggi.cache)} | ${fmtTokens(qOggi.token)} (${qOggi.ok}/${qOggi.chiamate} chiamate) | ${pct(qOggi.token, oggi.netto + qOggi.token)} |`);
  L.push(`| 7 giorni | ${fmtTokens(sett.netto)} | ${fmtTokens(sett.output)} | ${fmtTokens(sett.cache)} | ${fmtTokens(qSett.token)} (${qSett.ok}/${qSett.chiamate} chiamate) | ${pct(qSett.token, sett.netto + qSett.token)} |`);
  L.push('', 'Per agente (7 giorni, token netti):', '', '| agente | token | quota |', '|---|---|---|');
  for (const [a, v] of top(sett.agenti, 12)) L.push(`| ${a} | ${fmtTokens(v)} | ${pct(v, sett.netto)} |`);
  L.push('', 'Per progetto (7 giorni):', '', '| progetto | token | quota |', '|---|---|---|');
  for (const [p, v] of top(sett.progetti)) L.push(`| ${p} | ${fmtTokens(v)} | ${pct(v, sett.netto)} |`);
  L.push('', `- Soglia di avviso per sessione: ${fmtTokens(cfg.costi.sogliaAvvisoToken)} (solo avviso). Sessioni sopra soglia in 7 giorni: ${sopra}.`);
  if (sett.stimati) L.push(`- ${sett.stimati} messaggi senza campo usage: stimati da caratteri/4.`);
  L.push('- Fonte: transcript di Claude Code letti dagli hook Stop e SubagentStop. Sono stime locali, non la fattura: l\'abbonamento non ha costo per token.');
  return L.join('\n');
}

if (isMain(import.meta.url)) console.log(costi());
