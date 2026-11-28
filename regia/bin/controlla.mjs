#!/usr/bin/env node
// Ask the REGIA guard about an action from any language (Python, shell, cron).
//   controlla.mjs bash "<comando>"
//   controlla.mjs tool <nome_tool_mcp> '<json input>'
//   controlla.mjs file <percorso>            (text to write on stdin)
// Prints {"decisione","regola","motivo"}. Exit code: 0 allow, 1 ask, 2 deny, 3 usage error.
// "ask" means: do not act, ask l’utente first. Every ask/deny goes to guard.jsonl like the hook.
import { readFileSync } from 'node:fs';
import { decide } from '../hooks/guard.mjs';
import { appendJsonl, redact, isEntry } from '../hooks/lib/common.mjs';

export function controlla(kind, a, b, cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  let hook;
  if (kind === 'bash') hook = { tool_name: 'Bash', tool_input: { command: String(a || '') } };
  else if (kind === 'tool') hook = { tool_name: String(a || ''), tool_input: b ? JSON.parse(b) : {} };
  else if (kind === 'file') hook = { tool_name: 'Write', tool_input: { file_path: String(a || ''), content: b ?? '' } };
  else return null;
  const r = decide({ ...hook, cwd });
  if (r.decision !== 'allow') {
    appendJsonl('guard.jsonl', { decisione: r.decision, regola: r.rule, motivo: r.reason, tool: hook.tool_name, fonte: 'controlla', dettaglio: redact(JSON.stringify(hook.tool_input)).slice(0, 300), cwd });
  }
  return { decisione: r.decision, regola: r.rule || null, motivo: r.reason || null };
}

if (isEntry(import.meta.url)) {
  const [kind, a, b] = process.argv.slice(2);
  let res;
  try {
    const input = kind === 'file' ? readFileSync(0, 'utf8') : b;
    res = controlla(kind, a, input);
  } catch (e) {
    // fail-safe: a broken check never means "go ahead"
    res = { decisione: 'deny', regola: 'errore-controlla', motivo: `Controllo non riuscito, blocco per sicurezza: ${e.message}` };
  }
  if (!res) { console.error('Uso: controlla.mjs bash "<comando>" | tool <nome> \'<json>\' | file <percorso> (testo su stdin)'); process.exit(3); }
  console.log(JSON.stringify(res));
  process.exit({ allow: 0, ask: 1, deny: 2 }[res.decisione] ?? 2);
}
