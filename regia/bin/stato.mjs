#!/usr/bin/env node
// /stato: what REGIA is doing in this project right now.
import { join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig, dataDir, readJson, projectName, ollamaPick, ollamaUrls, isMain } from '../hooks/lib/common.mjs';
import { readData, localDay, successRates, readEsiti } from '../hooks/lib/stats.mjs';
import { fmtTokens } from '../hooks/lib/usage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function guardToday() {
  const p = join(dataDir(), 'guard.jsonl');
  if (!existsSync(p)) return { ask: 0, deny: 0, ultimi: [] };
  const today = localDay();
  const rows = readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((o) => o && localDay(new Date(o.ts)) === today);
  return { ask: rows.filter((r) => r.decisione === 'ask').length, deny: rows.filter((r) => r.decisione !== 'ask').length, ultimi: rows.slice(-3) };
}

export async function stato(cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const cfg = loadConfig();
  const progetto = projectName(cwd);
  const inst = readJson(join(ROOT, 'install.json'), null);
  const m = await ollamaPick('chat', 1500);
  const model = m.ok ? m.model : null;
  const up = (m.hosts || []).filter((h) => h.ok).length;
  const attivi = readData('attivi.json', {});
  const nAttivi = Object.values(attivi).reduce((n, s) => n + Object.keys(s).length, 0);
  const rotte = readData('rotte.json', {});
  const ultima = Object.values(rotte).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
  const g = guardToday();
  const c = readData('consumi.json', { sessioni: {}, giorni: {} });
  const sess = Object.entries(c.sessioni || {}).filter(([, s]) => s.progetto === progetto).sort((a, b) => Date.parse(b[1].ultimo) - Date.parse(a[1].ultimo))[0];
  let mem = 'non disponibile';
  try {
    const { openStore } = await import('../mcp/regia-memory/store.mjs');
    const store = await openStore();
    mem = `${store.count()} ricordi (${store.kind})`;
  } catch { /* skip */ }
  const esiti = readEsiti();
  const rates = Object.entries(successRates(esiti)).filter(([, r]) => r.tot >= 1).sort((a, b) => b[1].tot - a[1].tot).slice(0, 4)
    .map(([k, r]) => `${k.split('|')[0]} ${Math.round((r.ok / r.tot) * 100)}% su ${r.tot}`).join(', ');
  const rows = [
    ['progetto', progetto],
    ['installazione', inst ? `${inst.modalita}, dal ${String(inst.installatoIl).slice(0, 10)}` : 'sorgente (non installata qui)'],
    ['Qwen locale', model ? `on (${model}) su ${m.host}${(m.hosts || []).length > 1 ? `, ${up}/${m.hosts.length} host attivi` : ''}` : `off (${m.error || 'nessun modello'}) su ${ollamaUrls(cfg).join(', ')}`],
    ['agenti attivi', String(nAttivi)],
    ['ultima rotta', ultima ? `${ultima.agente} (${ultima.tipo}, complessità ${ultima.complessita}/5, ${ultima.fonte})` : 'nessuna'],
    ['guard oggi', `${g.ask} richieste di consenso, ${g.deny} blocchi`],
    ['memoria', mem],
    ['ultima sessione', sess ? `${fmtTokens(sess[1].tot?.netto || 0)} token netti, aggiornata ${String(sess[1].ultimo).slice(11, 16)}` : 'nessuna registrata'],
    ['esiti agenti', rates || 'nessuno ancora'],
  ];
  const w = Math.max(...rows.map((r) => r[0].length));
  const out = ['| voce | stato |', '|---|---|', ...rows.map(([k, v]) => `| ${k.padEnd(w)} | ${v} |`)];
  if (g.ultimi.length) {
    out.push('', 'Ultime decisioni del guard oggi (già applicate, niente in attesa):');
    for (const r of g.ultimi) out.push(`- ${String(r.ts).slice(11, 16)} ${r.decisione}: ${r.motivo}`);
  }
  return out.join('\n');
}

if (isMain(import.meta.url)) stato().then((s) => console.log(s));
