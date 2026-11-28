# 0001. Hook e server MCP in Node senza dipendenze

Data: 20 novembre 2026. Stato: accettata.

## Contesto
REGIA deve costare zero, girare su ogni Mac con Claude Code e non portare codice di terzi dentro i progetti. Gli hook partono a ogni comando: devono essere veloci e non devono rompersi per un pacchetto mancante.

## Decisione
Node 20+ ESM, solo moduli integrati (`node:fs`, `node:child_process`, `node:sqlite` dove c'è). Server MCP scritti a mano su stdio (JSON-RPC, una riga per messaggio) invece dell'SDK. Memoria su `node:sqlite` con FTS5, ripiego su un file JSON.

## Alternative scartate
- SDK MCP ufficiale e `better-sqlite3`: richiedono `npm install` e, per `better-sqlite3`, una compilazione nativa.
- Python: non sempre presente con la versione giusta, e Claude Code ha già Node.

## Conseguenze
- `npm test` gira senza installare nulla.
- `node:sqlite` in Node 22 è sperimentale: l'avviso viene nascosto; su Node 20 la memoria usa il JSON (più lento oltre qualche migliaio di ricordi).
- Il server MCP implementa solo `initialize`, `ping`, `tools/list`, `tools/call`: basta per i tool, non per risorse o prompt MCP.
