# Architettura di REGIA

## Schema

```
Claude Code
  |-- SessionStart ----> hooks/session-start.mjs  contesto: progetto, regole, Qwen, ultime decisioni
  |-- UserPromptSubmit > hooks/route.mjs          agente suggerito + ricordi (max 5 righe)
  |-- PreToolUse ------> hooks/guard.mjs          Bash, Write/Edit, mcp__*: ask / deny / niente
  |-- PostToolUse -----> hooks/post-edit.mjs      Write/Edit: scan segreti, lint, test facoltativi
  |-- SubagentStart/Stop hooks/subagent-stop.mjs  agenti attivi, esito, token per agente
  |-- Stop ------------> hooks/stop.mjs           token della sessione, avviso sopra soglia
  |-- statusLine ------> statusline/statusline.mjs
  |-- MCP regia-memory > mcp/regia-memory/        SQLite + FTS5 (o JSON), embedding Ollama facoltativi
  |-- MCP regia-local -> mcp/regia-local/         local_llm verso Ollama
  |-- /sciame /memoria /stato /costi /regia-test  commands/ + bin/
```

Tutto è Node ESM senza dipendenze. Librerie comuni in `hooks/lib/`:
- `common.mjs`: configurazione, cartella dati, pattern dei segreti, chiamate a Ollama, riconoscimento del progetto;
- `usage.mjs`: lettura incrementale dei transcript (solo i byte nuovi), token per `message.id`;
- `stats.mjs`: consumi per giorno, progetto e agente, esiti, lock tra processi (`mkdir` atomico);
- `mcp-server.mjs`: server MCP minimo su stdio (JSON-RPC, una riga per messaggio).

## Dove stanno le cose

| Cosa | Installazione di progetto | Installazione globale |
|---|---|---|
| Codice | `<progetto>/.claude/regia/` | `~/.claude/regia/` |
| Agenti | `<progetto>/.claude/agents/regia/` | `~/.claude/agents/regia/` |
| Comandi | `<progetto>/.claude/commands/*.md` | `~/.claude/commands/*.md` |
| Hook e status line | `.claude/settings.local.json` (merge) | `~/.claude/settings.json` (merge) |
| Server MCP | `.mcp.json` se non è in git, altrimenti `claude mcp add-json --scope local` | `claude mcp add-json --scope user` |
| Dati (memoria, statistiche, log) | `~/.regia/data/` | `~/.regia/data/` |
| Manifest e backup | `~/.regia/installazioni/<progetto>/` | `~/.regia/installazioni/globale/` |
| Worktree dello sciame | `~/.regia/worktrees/<progetto>/<sciame>/<sotto-task>` | idem |

I comandi negli hook usano percorsi assoluti: funzionano anche dentro i worktree dello sciame, dove `.claude/` del progetto non esiste.

## Guard: come decide

1. Legge lo stdin. Se non è JSON valido: `deny`.
2. Bash: divide il comando in catene (`&&`, `||`, `;`, `|`), entra in `sh -c`, `eval`, `$( )`, `` ` ` ``, `<( )`. Toglie `sudo`, `env`, `nohup`, `npx`, assegnazioni di variabili. Valuta ogni comando.
3. Write/Edit/MultiEdit/NotebookEdit: cerca segreti nel testo da scrivere. In `.env` chiede, altrove blocca.
4. Tool MCP: guarda il nome (`send`, `forward`, `reply`, `buy`, `checkout`, scritture Stripe, domini) e cerca segreti nell'input.
5. Vince la decisione più severa (deny > ask > allow). Su allow non stampa nulla: decidono i permessi normali di Claude Code.
6. Se il guard va in errore: blocca se l'input contiene parole sensibili (mail, stripe, rm, push, chiavi), altrimenti lascia passare. L'hook ha anche `onFailure: "block"`.

## Router: tre livelli

1. Tabella di parole chiave pesate (italiano e inglese, accenti tolti, word boundary). Istantanea.
2. Se Ollama risponde entro 2 secondi: Qwen classifica in JSON `{agente, tipo_task, complessita, serve_sciame}`. Se Ollama era giù meno di 60 secondi fa, il livello viene saltato.
3. Se i primi due candidati sono vicini (entro il 20%): vince chi ha il tasso di successo migliore su almeno 3 esiti per lo stesso tipo di task.

Complessità 1-5: parte da 1, sale con la lunghezza, il numero di aree (punteggio almeno 3), parole come "tutte le pagine" o "migra", elenchi puntati. `serve_sciame` = complessità almeno 3 e almeno due aree.

## Consumi

- Fonte: transcript JSONL di Claude Code. Un messaggio diviso su più righe ha lo stesso `message.id`: contato una volta.
- "Netti" = input + output + cache scritta. La cache letta si mostra a parte: pesa molto meno ed è la parte più grande.
- Stop salva lo stato di lettura per sessione (offset nel file): ogni volta legge solo i byte nuovi. Su un transcript da 63 MB: 0,4 s la prima volta, 1 ms dopo.
- Il giorno somma solo le differenze: una sessione lunga non viene contata due volte.
- SubagentStop legge il transcript del subagent: i suoi token vanno all'agente, non al thread principale.

## Sciame

`bin/worktree.mjs` fa il lavoro meccanico, il comando `/sciame` guida Claude:
1. `crea`: rifiuta oltre `maxAgenti` e con modifiche non committate. Se sei su main crea il ramo di lavoro `regia/<sciame>-lavoro`. Un worktree e un ramo `regia/<sciame>/<id>` per sotto-task, con `node_modules` collegato (link escluso da git).
2. Gli agenti lavorano ognuno nel suo worktree, in parallelo.
3. `esito`: registra esito, test e agente.
4. `unisci`: merge `--no-ff` nell'ordine dato; salta i falliti; al primo conflitto annulla quel merge e si ferma.
5. `report`: tabella sotto-task / agente / esito / file toccati / test / tempo.
6. `pulisci`: toglie worktree, rami uniti e la riga di exclude.

## Decisioni

Le decisioni di progetto di REGIA stanno in `docs/adr/`.
