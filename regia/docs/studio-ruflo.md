# Studio di Ruflo (fase 0)

Fonte: `github.com/ruvnet/ruflo`, clone `--depth 1` del 20 novembre 2026, commit `6c6293d` (19 novembre 2026), licenza MIT (Copyright 2024-2026 ruvnet). Letto in sola lettura in una cartella temporanea fuori dal progetto: nessuno script eseguito, nessun `npm install`.

File letti: `.claude/settings.json` (hook), `.claude/helpers/hook-handler.cjs` (1.439 righe), `router.cjs` (105), `memory.cjs` (84), `intelligence.cjs` (1.386), `learning-loop.cjs` (610, generato), `auto-memory-hook.mjs` (923), `.claude/agents/core/*.md` (5 agenti), `SKILL.md`.

**Codice riusato: nessuno.** REGIA è scritta da zero. Due idee prese da Ruflo e rifatte a modo nostro: bloccare quando l'input del guard non si legge, e dichiarare nel codice che il router è un'euristica.

## Tabella

| Pezzo di Ruflo | Come funziona davvero | Lo teniamo? | Come lo facciamo noi, più semplice |
|---|---|---|---|
| Hook in `settings.json` | 7 eventi su un unico `hook-handler.cjs` con sottocomandi (`pre-bash`, `post-edit`, `route`, `session-restore`, `session-end`, `compact-*`, `post-task`). Timeout scritti come `5000`, `10000`, `15000` | Sì, l'idea | Un file per hook, ognuno piccolo. Timeout in **secondi** (10, 20, 6, 15): lo schema attuale li vuole in secondi, quindi i `5000` di Ruflo valgono 83 minuti, non 5 secondi |
| Guard `pre-bash` | Solo sul tool Bash, `onFailure: block`, blocca se lo stdin non arriva o non si legge, elenco di comandi pericolosi, parser per `rm` sulla radice, fork bomb | Sì, potenziato | Guard su Bash, Write/Edit e **tutti** i tool `mcp__*` (mail, Stripe, domini passano da lì). Regole nostre: mail e pagamenti chiedono, segreti e `rm` di sistema bloccano, flusso PR e deploy libero. Nessun output quando passa |
| Router `router.cjs` | Tabella fissa di parole chiave con word boundary; "confidence" 0,6 fissa, 0,3 di default. Il file stesso dice che non è un modello addestrato | Sì | Tabella pesata in italiano e inglese, più livello 2 facoltativo (Qwen locale entro 2 s) e livello 3 (esiti passati degli agenti). Stessa onestà: è un'euristica |
| Memoria `memory.cjs` | Un JSON chiave-valore in `.claude-flow/data/memory.json`, riscritto a ogni salvataggio | No | SQLite con FTS5 (`node:sqlite`), ripiego JSON, embedding facoltativi via Ollama. Si salva solo su richiesta. I segreti vengono rifiutati |
| `intelligence.cjs` | Grafo dei ricordi con PageRank (fino a 5.000 nodi), stato in `graph-state.json` | No | Troppo per l'uso reale. Ricerca testuale più similarità coseno se c'è un modello di embedding |
| `learning-loop.cjs` | Bundle generato da un plugin (ADR-512), registra i turni e "impara"; contiene un elenco di regex per i segreti | No (solo l'idea delle regex) | Elenco di pattern dei segreti nostro, condiviso da guard, post-edit e memoria (`hooks/lib/common.mjs`). Le statistiche sono conteggi semplici in JSONL |
| `auto-memory-hook.mjs` | Importa e sincronizza memoria a SessionStart e Stop, può uscire con codici diversi da 0 e 2 | No | SessionStart inietta poche righe (regole, stato di Qwen, ultime decisioni). Niente sincronizzazioni automatiche |
| Agenti `core/` | 5 agenti (coder, planner, researcher, reviewer, tester) da 150-300 righe; il planner ha solo `name` e `description` nel frontmatter | Sì, l'idea | 11 agenti con frontmatter completo (`tools`, `model`, `color`), regole assolute in testa, quando usarlo e quando no, output breve, riga `ESITO:` finale per le statistiche |
| Status line `statusline.cjs` | Script dedicato | Sì | Una riga: progetto, agenti attivi, token stimati della sessione, Qwen on/off. Se avevi già una status line, la tua viene prima |
| Piattaforma (SKILL.md) | ruflo v3.31: 314 tool MCP, oltre 30 plugin, sciami gerarchici, consenso | No | Due server MCP con 7 tool in tutto. Sciame = massimo 3 agenti in worktree git, merge ordinato, report |

## Schemi verificati su Claude Code 2.1.329

Verificati sulla documentazione ufficiale (code.claude.com/docs) e sul comportamento della CLI installata, con una sessione headless nella sandbox (evento `system/init` e risposte degli hook).

- **Hook**: `hooks.<Evento>[] = { matcher, hooks: [{ type: "command", command, timeout (secondi), onFailure }] }`. Il matcher con soli lettere, cifre e `|` è un elenco esatto; con altri caratteri è una regex non ancorata, quindi REGIA usa `^(...)$`. UserPromptSubmit e Stop non hanno matcher.
- **Input comune**: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`; nei subagent anche `agent_id`, `agent_type`.
- **PreToolUse**: `tool_name`, `tool_input`. Uscita `hookSpecificOutput { hookEventName, permissionDecision: allow|deny|ask|defer, permissionDecisionReason }`. `allow` salta il prompt dei permessi: per questo REGIA non stampa nulla quando un comando è normale. Il vecchio `decision: approve|block` è deprecato.
- **PostToolUse**: `decision: "block"` + `reason` (riscontro a Claude, il file è già scritto), oppure `additionalContext`.
- **UserPromptSubmit / SessionStart**: `hookSpecificOutput.additionalContext`.
- **Stop / SubagentStop**: `decision: "block"` per obbligare a continuare (REGIA non lo usa mai); `systemMessage` mostra un avviso.
- **SubagentStart / SubagentStop**: `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`.
- **Codici di uscita**: 0 = JSON su stdout letto; 2 = blocco con stderr come motivo; altri = errore non bloccante, salvo `onFailure: "block"`.
- **Subagent**: `.claude/agents/` letta in modo ricorsivo (REGIA usa `.claude/agents/regia/`), frontmatter `name`, `description` obbligatori, `tools`, `disallowedTools`, `model`, `color`. Le descrizioni con `: ` vanno tra virgolette (YAML).
- **Comandi**: `.claude/commands/<nome>.md` con `description`, `argument-hint`, `allowed-tools`; `$ARGUMENTS`; `` !`comando` `` eseguito prima, se ammesso da `allowed-tools`.
- **Status line**: `{ "statusLine": { "type": "command", "command", "padding" } }`, riceve su stdin `session_id`, `transcript_path`, `workspace`, `model`.
- **MCP**: `.mcp.json` di progetto (va approvato: `enabledMcpjsonServers` nelle impostazioni locali) oppure `claude mcp add-json --scope local|user`.
- **Transcript**: un messaggio dell'assistente diviso su più righe ripete lo stesso `message.id` e lo stesso `usage`: va contato una volta (verificato su un transcript reale da 63 MB: 5.000 righe, 2.413 messaggi, nessun usage diverso tra righe dello stesso id).
- `claude agents` nella versione installata gestisce gli agenti in background, non elenca le definizioni: la verifica degli 11 agenti si fa con `/agents` oppure con l'evento `system/init` di una sessione headless (campo `agents`).
