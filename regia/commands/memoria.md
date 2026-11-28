---
description: "Memoria REGIA: salva, cerca, lista, dimentica, esporta (solo decisioni, vincoli, stato e lezioni)"
argument-hint: "salva <decisione|vincolo|stato|lezione> <testo> | cerca <testo> | lista | dimentica <id> | esporta"
allowed-tools: mcp__regia-memory__memory_store, mcp__regia-memory__memory_search, mcp__regia-memory__memory_list, mcp__regia-memory__memory_forget, mcp__regia-memory__memory_export, Bash(node:*)
---
Richiesta: $ARGUMENTS

Interpreta la prima parola e usa i tool di `regia-memory`:

- `salva <tipo> <testo>`: `memory_store` con `tipo` (decisione, vincolo, stato, lezione; se manca, decisione) e `testo`. Salva solo ciò che l'utente ha scritto, riformulato in una o due frasi chiare se serve. Mai segreti: se il testo contiene chiavi o token, toglili e dillo.
- `cerca <testo>`: `memory_search` con `query`.
- `lista`: `memory_list`.
- `dimentica <id>`: `memory_forget` con `id`.
- `esporta`: `memory_export` e mostra il markdown.
- senza argomenti: `memory_list` e ricorda la sintassi in una riga.

Se i tool MCP non sono collegati, usa lo stesso archivio dal terminale: `node "{{REGIA}}/bin/memoria.mjs" <stessa richiesta>`.
Rispondi in modo breve: esito in una riga, poi l'elenco se c'è.
