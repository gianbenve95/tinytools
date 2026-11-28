#!/usr/bin/env node
// /regia-test: self-check of an installation. Every line is a real check, not a claim.
import { join, dirname } from 'node:path';
import { existsSync, readFileSync, readdirSync, mkdtempSync, accessSync, constants } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, dataDir, ollamaPick, ollamaUrls, isMain, readJson, billingRisks } from '../hooks/lib/common.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function mcpHandshake(file, timeoutMs = 4000) {
  return new Promise((res) => {
    const child = spawn(process.execPath, [file], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, REGIA_DATA_DIR: mkdtempSync(join(tmpdir(), 'regia-at-')) } });
    let buf = '';
    let finished = false;
    const done = (v) => { if (finished) return; finished = true; clearTimeout(t); child.stdin.end(); child.kill(); res(v); };
    const t = setTimeout(() => done({ ok: false, nota: 'nessuna risposta' }), timeoutMs);
    const send = (msg) => { if (!finished) child.stdin.write(JSON.stringify(msg) + '\n'); };
    child.stdin.on('error', () => { /* child already gone */ });
    child.on('error', (e) => done({ ok: false, nota: e.message }));
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        if (m.id === 2) done({ ok: true, nota: (m.result?.tools || []).map((x) => x.name).join(', ') });
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  });
}

function settingsFiles() {
  const inst = readJson(join(ROOT, 'install.json'), null);
  if (inst?.modalita === 'globale') return [join(homedir(), '.claude', 'settings.json')];
  if (inst?.progetto) return [join(inst.progetto, '.claude', 'settings.local.json')];
  return [];
}

export async function autotest() {
  const cfg = loadConfig();
  const rows = [];
  const add = (voce, ok, nota = '') => rows.push([voce, ok === null ? 'n/d' : ok ? 'ok' : 'NO', nota]);

  const major = Number(process.versions.node.split('.')[0]);
  add('Node 20+', major >= 20, process.version);
  const risks = billingRisks();
  add('abbonamento, non API a pagamento', !risks.length, risks.length ? risks.join(' ') : 'nessuna chiave API nell\'ambiente');

  const { decide } = await import('../hooks/guard.mjs');
  const proj = '/tmp/regia-autotest';
  const d = (tool_name, tool_input) => decide({ tool_name, tool_input, cwd: proj }, { branch: 'lavoro' }).decision;
  const fakeKey = 'sk_live_' + 'Ab12Cd34'.repeat(3);
  const checks = [
    ['mail -> ask', d('mcp__Gmail__send_message', { to: 'x@y.it' }) === 'ask'],
    ['pagamento -> ask', d('mcp__Stripe__stripe_api_write', {}) === 'ask'],
    ['rm -rf / -> deny', d('Bash', { command: 'rm -rf /' }) === 'deny'],
    ['force push main -> deny', d('Bash', { command: 'git push --force origin main' }) === 'deny'],
    ['segreto in file -> deny', d('Write', { file_path: `${proj}/a.ts`, content: `k="${fakeKey}"` }) === 'deny'],
    ['npm test -> passa', d('Bash', { command: 'npm test' }) === 'allow'],
  ];
  add('guard (6 casi)', checks.every((c) => c[1]), checks.filter((c) => !c[1]).map((c) => c[0]).join(', ') || 'mail, pagamenti, rm, push, segreti, normale');

  const sf = settingsFiles();
  if (sf.length) {
    const s = readJson(sf[0], {});
    const cmds = Object.values(s.hooks || {}).flat().flatMap((g) => g.hooks || []).map((h) => h.command || '');
    const want = ['guard.mjs', 'route.mjs', 'post-edit.mjs', 'session-start.mjs', 'stop.mjs', 'subagent-stop.mjs'];
    const missing = want.filter((w) => !cmds.some((c) => c.includes('/.claude/regia/hooks/' + w)));
    add('hook registrati', !missing.length, missing.length ? `mancano: ${missing.join(', ')}` : sf[0]);
    add('status line', Boolean(s.statusLine?.command?.includes('statusline.mjs')), '');
  } else add('hook registrati', null, 'REGIA non installata da qui (copia sorgente)');

  const agentsDir = existsSync(join(ROOT, '..', 'agents', 'regia')) ? join(ROOT, '..', 'agents', 'regia') : join(ROOT, 'agents');
  const agents = existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith('.md')) : [];
  const bad = agents.filter((f) => {
    const t = readFileSync(join(agentsDir, f), 'utf8');
    return !/^---\nname: [a-z-]+\ndescription: ".+"\n[\s\S]*?model: (opus|sonnet|haiku)\n[\s\S]*?---\n/.test(t) || !t.includes('ESITO:');
  });
  add('agenti (11)', agents.length === 11 && !bad.length, bad.length ? `frontmatter da sistemare: ${bad.join(', ')}` : `${agents.length} in ${agentsDir}`);

  try {
    const { openStore, resetStore, memoryStore, memorySearch, memoryForget } = await import('../mcp/regia-memory/store.mjs');
    resetStore();
    const store = await openStore({ dir: mkdtempSync(join(tmpdir(), 'regia-at-mem-')) });
    const r = await memoryStore(store, { testo: 'prova di autotest REGIA', tipo: 'stato', progetto: 'autotest' }, { embeddings: false });
    const s = await memorySearch(store, { query: 'autotest', progetto: 'autotest' }, { embeddings: false });
    const f = memoryForget(store, { id: r.id });
    let secretRefused = false;
    try { await memoryStore(store, { testo: 'token ghp_' + 'x'.repeat(36), tipo: 'stato' }, { embeddings: false }); } catch { secretRefused = true; }
    resetStore();
    add('memoria salva/cerca/dimentica', s.risultati.length === 1 && f.cancellato && secretRefused, `${store.kind}, segreti rifiutati`);
  } catch (e) { add('memoria', false, e.message); }

  const m = await ollamaPick('chat', 2000);
  const up = (m.hosts || []).filter((h) => h.ok).length;
  add('Qwen locale', m.ok ? true : null, m.ok ? `${m.model} su ${m.host} (${up}/${m.hosts.length} host attivi)` : `non raggiungibile su ${ollamaUrls(cfg).join(', ')}: fallback attivo, nessun blocco`);

  for (const name of ['regia-memory', 'regia-local']) {
    const r = await mcpHandshake(join(ROOT, 'mcp', name, 'server.mjs'));
    add(`MCP ${name}`, r.ok, r.nota);
  }

  try { accessSync(dataDir(), constants.W_OK); add('cartella dati', true, dataDir()); } catch (e) { add('cartella dati', false, e.message); }

  const fails = rows.filter((r) => r[1] === 'NO').length;
  return [
    '| controllo | esito | nota |', '|---|---|---|',
    ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`),
    '', fails ? `${fails} controlli da sistemare.` : 'Tutto ok (n/d = non applicabile o non disponibile, senza blocchi).',
  ].join('\n');
}

if (isMain(import.meta.url)) autotest().then((s) => { console.log(s); });
