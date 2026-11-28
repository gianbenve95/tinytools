#!/usr/bin/env node
// REGIA status line: project, active agents, estimated session tokens, Qwen on/off.
// If you already had a status line, it runs first and REGIA is appended after it.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig, readStdin, projectName, dataDir, readJson, isMain } from '../hooks/lib/common.mjs';
import { readUsage, totals, fmtTokens } from '../hooks/lib/usage.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export function segment(input, cfg = loadConfig()) {
  const cwd = input.workspace?.project_dir || input.workspace?.current_dir || input.cwd || process.cwd();
  const progetto = projectName(cwd);
  const attivi = Object.keys(readJson(join(dataDir(), 'attivi.json'), {})[input.session_id] || {}).length;
  let tok = null;
  if (input.transcript_path) {
    // same computation as /costi: saved state + only the new bytes (nothing written here)
    const st = readJson(join(dataDir(), 'stato-transcript', `${input.session_id}.json`), null);
    tok = totals(readUsage(input.transcript_path, st)).netto;
  }
  const o = readJson(join(dataDir(), 'ollama.json'), null);
  const parts = [`REGIA ${progetto}`, `agenti ${attivi}`];
  if (tok !== null) parts.push(`${fmtTokens(tok)} tok${tok > cfg.costi.sogliaAvvisoToken ? ' (sopra soglia)' : ''}`);
  parts.push(`Qwen ${o?.ok ? 'on' : 'off'}`);
  return parts.join(' | ');
}

async function main() {
  const raw = await readStdin(1500);
  let input = {};
  try { input = JSON.parse(raw); } catch { /* empty */ }
  let prev = '';
  const chain = readJson(join(HERE, 'chain.json'), {});
  if (chain.comando) {
    const r = spawnSync('bash', ['-c', chain.comando], { input: raw, encoding: 'utf8', timeout: 1500 });
    prev = (r.stdout || '').split('\n')[0].trim();
  }
  let mine = 'REGIA';
  try { mine = segment(input); } catch { /* keep minimal */ }
  process.stdout.write(prev ? `${prev} | ${mine}` : mine);
}

if (isMain(import.meta.url)) main();
