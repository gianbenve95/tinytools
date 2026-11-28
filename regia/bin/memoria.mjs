#!/usr/bin/env node
// Memory from the terminal (same store as the MCP server). Useful when MCP is not connected.
// memoria.mjs salva <tipo> <testo...> [--progetto P] [--tag a,b]
// memoria.mjs cerca <query...> | lista | dimentica <id> | esporta [--progetto P|tutti]
import { projectName, isMain } from '../hooks/lib/common.mjs';
import { openStore, memoryStore, memorySearch, memoryList, memoryForget, memoryExport, TIPI } from '../mcp/regia-memory/store.mjs';

export async function cli(argv, cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const args = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--progetto') flags.progetto = argv[++i];
    else if (argv[i] === '--tag') flags.tag = argv[++i];
    else args.push(argv[i]);
  }
  const [cmd, ...rest] = args;
  const progetto = flags.progetto || projectName(cwd);
  const store = await openStore();
  if (cmd === 'salva') {
    const tipo = TIPI.includes(rest[0]) ? rest.shift() : 'decisione';
    const r = await memoryStore(store, { testo: rest.join(' '), tipo, progetto, tag: flags.tag || '' });
    return r.duplicato ? `Già presente (id ${r.id}).` : `Salvato (id ${r.id}, ${tipo}, ${progetto}).`;
  }
  if (cmd === 'cerca') {
    const r = await memorySearch(store, { query: rest.join(' '), progetto });
    return r.risultati.length ? r.risultati.map((x) => `[${x.id}] (${x.tipo}, ${x.progetto}) ${x.testo}`).join('\n') : 'Nessun ricordo trovato.';
  }
  if (cmd === 'lista') return memoryList(store, { progetto }).map((x) => `[${x.id}] (${x.tipo}, ${x.progetto}, ${x.creato.slice(0, 10)}) ${x.testo}`).join('\n') || 'Memoria vuota.';
  if (cmd === 'dimentica') { const r = memoryForget(store, { id: rest[0] }); return r.cancellato ? `Cancellato [${r.ricordo.id}].` : r.motivo; }
  if (cmd === 'esporta') return memoryExport(store, { progetto: flags.progetto === 'tutti' ? undefined : progetto });
  return 'Uso: memoria.mjs salva <tipo> <testo> | cerca <query> | lista | dimentica <id> | esporta';
}

if (isMain(import.meta.url)) cli(process.argv.slice(2)).then((s) => console.log(s)).catch((e) => { console.error(e.message); process.exit(1); });
