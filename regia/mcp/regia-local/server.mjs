#!/usr/bin/env node
// MCP server "regia-local": delegates mechanical tasks to a local model (Qwen on Ollama).
// Only network call: the configured Ollama host (localhost or LAN). If it is not there,
// the tool says so clearly and the work continues without it.
import { serve } from '../../hooks/lib/mcp-server.mjs';
import { loadConfig, ollamaFetch, ollamaPick, ollamaHosts, ollamaUrls, pickModel, appendJsonl, isMain } from '../../hooks/lib/common.mjs';

const TASKS = {
  riassumi: (a) => `Riassumi il testo in italiano, in modo schematico (al massimo ${a.max_punti || 7} punti brevi). Niente introduzioni.`,
  classifica: (a) => `Classifica il testo in una sola di queste categorie: ${(a.categorie || []).join(', ') || 'scegli tu una categoria breve'}. Rispondi solo con JSON {"categoria": string, "motivo": string}.`,
  estrai_json: (a) => `Estrai dal testo i dati richiesti e rispondi solo con JSON valido${a.schema ? ` che rispetta questo schema: ${JSON.stringify(a.schema)}` : ''}. Non inventare: usa null se un dato manca.`,
  traduci: (a) => `Traduci il testo in ${a.lingua || 'inglese'}. Mantieni formattazione, numeri e termini tecnici. Rispondi solo con la traduzione.`,
  bozza: () => 'Scrivi una prima bozza in italiano, tono caldo e diretto, frasi brevi. È solo una bozza: verrà rivista.',
};

export async function localLlm(args, { cfg = loadConfig() } = {}) {
  const compito = String(args.compito || '');
  if (!TASKS[compito]) throw new Error(`Compito non valido: ${compito}. Usa: ${Object.keys(TASKS).join(', ')}.`);
  const testo = String(args.testo || '');
  if (!testo.trim()) throw new Error('Testo vuoto.');
  const started = Date.now();
  const p = await ollamaPick('chat', cfg.ollama.timeoutMs, args.modello);
  const model = p.ok ? p.model : null;
  if (!model) {
    const anyUp = (p.hosts || []).some((h) => h.ok);
    const why = anyUp ? 'nessun modello di chat installato in Ollama' : `Ollama non raggiungibile su ${ollamaUrls(cfg).join(', ')} (${p.error})`;
    appendJsonl('locale.jsonl', { ok: false, compito, motivo: why });
    return { ok: false, testo: `Qwen non disponibile: ${why}. Fai il compito direttamente, il lavoro non è bloccato.` };
  }
  const json = compito === 'classifica' || compito === 'estrai_json';
  const system = [TASKS[compito](args), args.istruzioni ? `Istruzioni aggiuntive: ${args.istruzioni}` : ''].filter(Boolean).join('\n');
  const r = await ollamaFetch('/api/chat', {
    model, stream: false, ...(json ? { format: args.schema || 'json' } : {}),
    options: { temperature: compito === 'bozza' ? 0.6 : 0.1 },
    messages: [{ role: 'system', content: system }, { role: 'user', content: testo.slice(0, 60000) }],
  }, cfg.ollama.timeoutGenerazioneMs, p.host);
  const ms = Date.now() - started;
  if (!r.ok) {
    appendJsonl('locale.jsonl', { ok: false, compito, modello: model, host: p.host, motivo: r.error, ms });
    return { ok: false, testo: `Qwen non disponibile: ${r.error === 'timeout' ? `nessuna risposta entro ${Math.round(cfg.ollama.timeoutGenerazioneMs / 1000)} s` : r.error}. Fai il compito direttamente.` };
  }
  const out = String(r.data?.message?.content || '').trim();
  const tokIn = r.data?.prompt_eval_count || Math.ceil((system.length + testo.length) / 4);
  const tokOut = r.data?.eval_count || Math.ceil(out.length / 4);
  appendJsonl('locale.jsonl', { ok: true, compito, modello: model, host: p.host, tokenIn: tokIn, tokenOut: tokOut, ms });
  return { ok: true, testo: `${out}\n\n(Qwen locale: ${model} su ${p.host}, ${tokIn + tokOut} token, ${(ms / 1000).toFixed(1)} s. Controlla prima di usarlo.)` };
}

export async function localStatus({ cfg = loadConfig() } = {}) {
  const hosts = await ollamaHosts(cfg.ollama.timeoutMs);
  if (!hosts.some((h) => h.ok)) return `Ollama non raggiungibile su ${ollamaUrls(cfg).join(', ')} (${hosts.map((h) => h.error).join('; ')}).`;
  const chat = await ollamaPick('chat', cfg.ollama.timeoutMs);
  const emb = await ollamaPick('embed', cfg.ollama.timeoutMs);
  const lines = hosts.map((h) => `- ${h.url}: ${h.ok ? `ok, modelli: ${h.models.join(', ') || 'nessuno'}` : `non risponde (${h.error})`}`);
  return [`Ollama, ${hosts.filter((h) => h.ok).length}/${hosts.length} host attivi:`, ...lines,
    `Chat: ${chat.ok ? `${chat.model} su ${chat.host}` : 'nessuno'}. Embedding: ${emb.ok ? `${emb.model} su ${emb.host}` : 'nessuno (memoria solo testuale)'}.`,
    `Distribuzione: ${cfg.ollama.distribuzione === 'giro' ? 'a giro tra gli host con lo stesso modello' : 'il primo host disponibile, nell\'ordine della configurazione'}.`].join('\n');
}

if (isMain(import.meta.url)) {
  serve({
    name: 'regia-local',
    version: '1.0.0',
    instructions: 'Usa local_llm per sotto-compiti meccanici (riassunti, classificazioni, estrazione JSON, traduzioni, prime bozze): gira sul modello locale e risparmia l\'abbonamento. Se risponde "Qwen non disponibile", fai il compito tu.',
    tools: [
      {
        name: 'local_llm',
        description: 'Delega a Qwen locale (Ollama) un compito meccanico: riassumi, classifica, estrai_json, traduci, bozza. Risultato da controllare. Se Ollama non c\'è risponde "Qwen non disponibile" e si prosegue senza.',
        inputSchema: {
          type: 'object',
          properties: {
            compito: { type: 'string', enum: Object.keys(TASKS) },
            testo: { type: 'string', description: 'Il testo su cui lavorare.' },
            istruzioni: { type: 'string', description: 'Indicazioni in più (facoltative).' },
            categorie: { type: 'array', items: { type: 'string' }, description: 'Per classifica.' },
            schema: { type: 'object', description: 'Per estrai_json: JSON Schema del risultato.' },
            lingua: { type: 'string', description: 'Per traduci. Default inglese.' },
            max_punti: { type: 'number', description: 'Per riassumi. Default 7.' },
            modello: { type: 'string', description: 'Facoltativo: nome del modello Ollama.' },
          },
          required: ['compito', 'testo'],
        },
        handler: async (a) => (await localLlm(a)).testo,
      },
      {
        name: 'local_status',
        description: 'Dice se Ollama è raggiungibile e quali modelli sono installati.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => localStatus(),
      },
    ],
  });
}
