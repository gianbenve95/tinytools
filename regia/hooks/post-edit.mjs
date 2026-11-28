#!/usr/bin/env node
// REGIA PostToolUse on Write/Edit/MultiEdit: secret scan of the whole file (always),
// then quick lint of the file if the project has its own eslint, optional format and sibling test.
// Never installs anything, never uses the network.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, extname, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, readStdin, findSecret, appendJsonl, emit, isEntry } from './lib/common.mjs';

const CODE = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);

function findUp(start, rel, stop) {
  let d = start;
  for (let i = 0; i < 12; i++) {
    const p = join(d, rel);
    if (existsSync(p)) return { path: p, root: d };
    if (d === stop || d === dirname(d)) return null;
    d = dirname(d);
  }
  return null;
}

function run(bin, args, cwd, timeoutMs) {
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: timeoutMs });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), timedOut: r.error?.code === 'ETIMEDOUT' };
}

export function checkFile(file, { cfg = loadConfig(), projectDir = process.cwd() } = {}) {
  const notes = [];
  if (!file || !existsSync(file) || statSync(file).size > 2_000_000) return { block: null, notes };
  const base = basename(file);
  const isEnv = /^\.env(\.|$)/.test(base) && !/\.(example|sample|template)$/.test(base);
  const secret = isEnv ? null : findSecret(readFileSync(file, 'utf8'));
  if (secret) {
    return { block: `Segreto trovato in ${base} (${secret.label}). Toglilo subito dal file e leggilo da una variabile d'ambiente: non deve finire nel repository.`, notes };
  }
  const ext = extname(file);
  const t = cfg.postEdit.timeoutMs;
  if (cfg.postEdit.lint && CODE.has(ext)) {
    const eslint = findUp(dirname(file), 'node_modules/.bin/eslint', projectDir);
    if (eslint) {
      const r = run(eslint.path, ['--no-warn-ignored', '--format', 'unix', file], eslint.root, t);
      if (r.code === 1 && r.out) notes.push(`Lint (${base}):\n${r.out.split('\n').slice(0, 8).join('\n')}`);
      if (r.timedOut) notes.push('Lint saltato: oltre il tempo massimo.');
    }
  }
  if (cfg.postEdit.format && CODE.has(ext)) {
    const prettier = findUp(dirname(file), 'node_modules/.bin/prettier', projectDir);
    if (prettier) run(prettier.path, ['--write', file], prettier.root, t);
  }
  if (cfg.postEdit.test && CODE.has(ext) && !/\.test\./.test(base)) {
    const stem = base.slice(0, -ext.length);
    const sib = ['.test' + ext, '.test.ts', '.test.mjs', '.test.js'].map((e) => join(dirname(file), stem + e)).find(existsSync);
    if (sib) {
      const vitest = findUp(dirname(file), 'node_modules/.bin/vitest', projectDir);
      const r = vitest ? run(vitest.path, ['run', sib], vitest.root, t) : /\.m?js$/.test(sib) ? run(process.execPath, ['--test', sib], dirname(sib), t) : null;
      if (r && r.code !== 0) notes.push(`Test veloce fallito (${basename(sib)}):\n${r.out.split('\n').slice(-8).join('\n')}`);
    }
  }
  return { block: null, notes };
}

async function main() {
  let hook;
  try { hook = JSON.parse(await readStdin()); } catch { return; }
  const input = hook.tool_input || {};
  const file = input.file_path ? resolve(hook.cwd || process.cwd(), input.file_path) : null;
  const { block, notes } = checkFile(file, { projectDir: process.env.CLAUDE_PROJECT_DIR || hook.cwd || process.cwd() });
  if (block) {
    appendJsonl('guard.jsonl', { decisione: 'blocco-post-edit', regola: 'segreto-nel-file', motivo: block, tool: hook.tool_name, dettaglio: file, sessione: hook.session_id });
    emit({ decision: 'block', reason: `REGIA: ${block}` });
    return;
  }
  if (notes.length) emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n').slice(0, 2000) } });
}

if (isEntry(import.meta.url)) main().catch(() => { /* never break an edit */ });
