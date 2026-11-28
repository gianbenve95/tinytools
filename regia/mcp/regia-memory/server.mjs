#!/usr/bin/env node
// MCP server "regia-memory": persistent memory per project + global.
// Only explicit saves (decisions, constraints, state, lessons). Secrets are refused.
import { serve } from '../../hooks/lib/mcp-server.mjs';
import { projectName } from '../../hooks/lib/common.mjs';
import { openStore, memoryStore, memorySearch, memoryList, memoryForget, memoryExport, TIPI } from './store.mjs';

const PROJECT = projectName(process.env.REGIA_PROJECT_DIR || process.cwd());
const store = await openStore();
const proj = (p) => (p === undefined || p === null || p === '' ? PROJECT : p);

serve({
  name: 'regia-memory',
  version: '1.0.0',
  instructions: `Memoria di REGIA. Progetto corrente: ${PROJECT}. Salva solo decisioni, vincoli, stato e lezioni quando l’utente lo chiede (/memoria salva). Mai segreti.`,
  tools: [
    {
      name: 'memory_store',
      description: `Salva un ricordo (decisione, vincolo, stato o lezione) per il progetto corrente o "globale". Solo su richiesta esplicita. I segreti vengono rifiutati. Backend: ${store.kind}.`,
      inputSchema: {
        type: 'object',
        properties: {
          testo: { type: 'string', description: 'Il ricordo, una o due frasi.' },
          tipo: { type: 'string', enum: TIPI },
          progetto: { type: 'string', description: `Default: ${PROJECT}. "globale" vale per tutti i progetti.` },
          tag: { type: 'string', description: 'Parole chiave separate da virgola.' },
        },
        required: ['testo', 'tipo'],
      },
      handler: async (a) => {
        const r = await memoryStore(store, { ...a, progetto: proj(a.progetto) });
        return r.duplicato ? `Già presente (id ${r.id}).` : `Salvato (id ${r.id}, ${a.tipo}, ${proj(a.progetto)})${r.semantica ? ', con ricerca semantica' : ''}.`;
      },
    },
    {
      name: 'memory_search',
      description: 'Cerca nei ricordi del progetto corrente e in quelli globali. Testo (FTS5) e, se Ollama ha un modello di embedding, anche per significato.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          progetto: { type: 'string' },
          tipo: { type: 'string', enum: TIPI },
          limite: { type: 'number', description: 'Default 5, max 20.' },
        },
        required: ['query'],
      },
      handler: async (a) => {
        const r = await memorySearch(store, { ...a, progetto: proj(a.progetto) });
        if (!r.risultati.length) return `Nessun ricordo trovato per "${a.query}" (ricerca: ${r.modo}).`;
        return `Ricerca: ${r.modo}\n` + r.risultati.map((x) => `[${x.id}] (${x.tipo}, ${x.progetto}) ${x.testo}`).join('\n');
      },
    },
    {
      name: 'memory_list',
      description: 'Elenca gli ultimi ricordi (progetto corrente + globali).',
      inputSchema: { type: 'object', properties: { progetto: { type: 'string' }, tipo: { type: 'string', enum: TIPI }, limite: { type: 'number' } } },
      handler: async (a) => {
        const r = memoryList(store, { ...a, progetto: proj(a.progetto) });
        return r.length ? r.map((x) => `[${x.id}] (${x.tipo}, ${x.progetto}, ${x.creato.slice(0, 10)}) ${x.testo}`).join('\n') : 'Memoria vuota.';
      },
    },
    {
      name: 'memory_forget',
      description: 'Cancella un ricordo per id. Usalo solo su richiesta esplicita.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
      handler: async (a) => {
        const r = memoryForget(store, a);
        return r.cancellato ? `Cancellato [${r.ricordo.id}] ${r.ricordo.testo}` : r.motivo;
      },
    },
    {
      name: 'memory_export',
      description: 'Esporta i ricordi in markdown leggibile (progetto corrente + globali, oppure "tutti").',
      inputSchema: { type: 'object', properties: { progetto: { type: 'string', description: 'Default progetto corrente; "tutti" per tutto.' } } },
      handler: async (a) => memoryExport(store, { progetto: a.progetto === 'tutti' ? undefined : proj(a.progetto) }),
    },
  ],
});
