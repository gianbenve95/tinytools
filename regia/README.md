# REGIA

Orchestratore multi-agente personale per Claude Code. Locale, gratuito, senza dipendenze npm.
Ispirato a Ruflo (MIT) ma scritto da zero e ridotto all'essenziale: vedi `docs/studio-ruflo.md`.

## Cosa fa

| Pezzo | Cosa fa | Dove |
|---|---|---|
| Guard | Prima di ogni comando: mail e pagamenti chiedono il tuo consenso, segreti e `rm` di sistema vengono bloccati, il resto passa senza rallentare | `hooks/guard.mjs` |
| 11 agenti | pianificatore, architetto, sviluppatore, tester, revisore, sicurezza, seo-tecnico, verificatore-live, illuminotecnico, documentatore, ricercatore | `agents/` |
| Router | A ogni richiesta suggerisce l'agente e porta 3-4 ricordi pertinenti (massimo 5 righe) | `hooks/route.mjs` |
| Memoria | Decisioni, vincoli, stato, lezioni. SQLite + FTS5, per progetto e globale. Solo su richiesta | `mcp/regia-memory/` |
| Delega a Qwen | Riassunti, classificazioni, estrazioni JSON, traduzioni e bozze su Ollama locale | `mcp/regia-local/` |
| /sciame | Pianifica, lancia fino a 3 agenti in worktree git separati, test, revisione, merge in ordine, report | `commands/sciame.md`, `bin/worktree.mjs` |
| Consumi | Token stimati per sessione, giorno, agente e progetto; quota delegata a Qwen; avviso sopra soglia | `/costi`, `/stato`, status line |
| Guard da altri programmi | Uno script Python, una cron o un agente come Assistente chiede "posso farlo?" prima di agire: uscita 0 sì, 1 chiedi all'utente, 2 no | `bin/controlla.mjs` |

## Installazione

Requisiti: Node 20 o superiore, Claude Code (provata su 2.1.283 e 2.1.329). Ollama facoltativo.

**Prima di tutto, una volta sola:** Claude Code deve girare sull'abbonamento, non sul credito API.
Se all'avvio vedi "API Usage Billing" o "Login expired", dentro Claude Code scrivi `/login` e scegli il tuo account Claude con abbonamento (Pro o Max), non la Console API. Se nel terminale è impostata `ANTHROPIC_API_KEY`, toglila da `~/.zshrc`.

**Prova su un progetto, in un comando** (controlli, ramo `prova/regia`, installazione):

```bash
~/tinytools/regia/prova.sh ~/Progetti/mio-sito
```

Poi:

```bash
cd ~/Progetti/mio-sito
claude
```

e dentro Claude Code `/regia-test`.

Installazione diretta, senza i controlli:

```bash
cd ~/Progetti/mio-progetto
~/tinytools/regia/install.sh
```

Altre opzioni: `install.sh --dry-run` mostra cosa farebbe senza scrivere; `install.sh --global` installa per tutti i progetti e chiede di scrivere SI. Dalla cartella home l'installazione di progetto viene rifiutata, perché diventerebbe globale senza conferma.

Cosa succede:
- backup con data e ora di ogni file toccato in `~/.regia/installazioni/<progetto>/backup-*`;
- merge (mai sovrascrittura) di hook, permessi, status line e server MCP già presenti;
- file di REGIA esclusi da git (`.git/info/exclude`): `git status` resta uguale;
- reinstallare è sicuro: il risultato è identico;
- se il guard non riesce a partire (file mancante, Node assente), il comando viene bloccato in ogni versione di Claude Code.

## Uso

| Comando | A cosa serve |
|---|---|
| `/sciame <obiettivo>` | Lavoro con 2-3 parti indipendenti (es. bug + SEO + test). Rifiuta i task piccoli (complessità 1-2) |
| `/memoria salva vincolo <testo>` | Salva una decisione, un vincolo, uno stato o una lezione |
| `/memoria cerca <testo>` | Cerca nei ricordi del progetto e in quelli globali |
| `/stato` | Progetto, Qwen, agenti attivi, ultima rotta, blocchi del guard di oggi |
| `/costi` | Consumi stimati di oggi e della settimana, per agente e progetto |
| `/regia-test` | Autoverifica: guard, hook, agenti, memoria, Qwen, server MCP |

Gli agenti si possono anche chiamare per nome: "usa il revisore sul diff di questo ramo".
Dettagli e esempi: `docs/uso.md`. Come è fatto: `docs/architettura.md`.

## Regole assolute (codificate, non solo scritte)

| Regola | Come è fatta rispettare |
|---|---|
| Zero spese | Nessuna dipendenza npm, nessuna API a pagamento. Tool MCP che consumano crediti (ElevenLabs, Lovable, Make) chiedono consenso |
| Nessuna mail senza consenso | `sendmail`, `mail`, SMTP, Graph `sendMail`, API di invio, tool MCP con `send`, `forward`, `reply`: sempre `ask`. Il documentatore scrive solo bozze in file |
| Nessun pagamento o acquisto | Scritture Stripe, `buy`, `purchase`, `checkout`, domini, servizi a consumo: `ask` |
| Nessun segreto | Chiavi nei comandi o nei file: `deny`. `cat .env`, `printenv \| curl`: `deny`. Memoria e log rifiutano o oscurano i segreti |
| Nessuna telemetria | L'unica chiamata di rete di REGIA è verso Ollama (`localhost` o l'host LAN in `config/regia.json`) |
| Non rompere la tua configurazione | Backup, merge, disinstallazione che ripristina i file identici al byte |
| Flusso siti libero | PR, preview Vercel, merge, deploy: nessuna domanda. Chiede solo il push diretto su main; blocca il push forzato su main |

Ogni `ask` e `deny` finisce in `~/.regia/data/guard.jsonl` con il motivo in italiano.

## Configurazione

`config/regia.json` (copiato in `.claude/regia/config/regia.json` all'installazione):
- `ollama.url`: `http://localhost:11434`, un altro computer in LAN o più Mac separati da virgola (cluster: quelli spenti vengono saltati); `ollama.distribuzione: "giro"` alterna i Mac con lo stesso modello; oppure la variabile `REGIA_OLLAMA_URL`;
- `ollama.modello`: il modello da usare; se è vuoto REGIA sceglie su tutti i Mac un modello da 4 a 14 miliardi di parametri (il più grande, qwen a parità), poi i più piccoli, poi i più grandi a partire dal più piccolo: un 27B può metterci più di 90 secondi solo a caricarsi. La dimensione viene da Ollama, altrimenti dal nome; per i modelli a esperti conta il totale;
- `router.regoleExtra` e `router.agentiExtra`: le parole e gli agenti del tuo progetto, senza toccare il codice;
- `maxAgenti`: agenti in parallelo nello sciame (default 3);
- `costi.sogliaAvvisoToken`: soglia dell'avviso per sessione;
- `guard.extraAsk` / `guard.extraDeny`: regole tue in più (regex sul comando);
- `progetti`: mappa dei progetti (repo, sito, tipo), usata da router e contesto;
- `preferenze`: come vuoi che si lavori, in una riga all'inizio di ogni sessione (di base: fai tutto da solo, chiedi solo per quello che il guard ferma, risposte schematiche).

Reinstallando, la tua `config/regia.json` resta com'è (la versione nuova finisce accanto, in `regia.nuovo.json`).

## Disinstallazione

```bash
cd ~/Progetti/mio-progetto
~/tinytools/regia/uninstall.sh            # toglie solo ciò che ha aggiunto REGIA
~/tinytools/regia/uninstall.sh --purge    # anche memoria, statistiche e backup in ~/.regia
~/tinytools/regia/uninstall.sh --global   # se l'avevi installata globale
```

Se dopo l'installazione non hai toccato i file, tornano identici al byte. Se hai aggiunto qualcosa (es. un permesso), le tue modifiche restano.

## Test

```bash
npm test     # 218 test: guard (143 + 292 casi della revisione indipendente), installer, memoria, router, Qwen, hook, agenti, worktree, comandi, verifica.sh
```

## Limiti onesti

- **Il router è un'euristica**, non un modello addestrato: tabella di parole chiave, Qwen locale se c'è, esiti passati. I 30 prompt di prova li ho scritti insieme alla tabella: sull'uso reale sbaglierà più spesso. Suggerisce, non decide.
- **Il guard è stato verificato da un controllo indipendente** (346 casi: 19 tipi di aggiramento e 12 falsi allarmi trovati, tutti corretti tranne uno, che resta fermo con una richiesta di conferma) e ripassato su 6.518 chiamate reali, con 16 segnalazioni tutte corrette o prudenti. Dettagli: `docs/verifica-guard-2026-11-20.md`. Costo: circa 40 ms a comando.
- **Il guard è un filtro, non una sandbox.** Legge il comando prima che parta: uno script che manda mail da dentro un file (`node invia.js`) non lo vede. Copre i casi comuni, non un attaccante. I permessi di Claude Code restano la prima difesa.
- **Consumi stimati** dai transcript locali (campo `usage`, o caratteri/4 se manca): non sono la fattura. Con l'abbonamento non c'è un costo per token; servono a capire chi consuma.
- **Qwen**: va controllato prima di usarne l'output. Senza Ollama tutto funziona, solo senza delega.
- **Sciame**: massimo 3 agenti; se due sotto-task toccano lo stesso file, il merge si ferma al primo conflitto e lo riporta. I worktree partono dall'ultimo commit: le modifiche non committate vanno salvate prima. In uso normale gli agenti chiedono i permessi come sempre; con `claude -p` (senza nessuno che risponda) servono i permessi passati con `--allowedTools` (esempio in `docs/uso.md`).
- **Memoria semantica** solo se Ollama ha un modello di embedding (es. `nomic-embed-text`); altrimenti ricerca testuale.
- **node:sqlite** in Node 22 è sperimentale (funziona, l'avviso è nascosto). Su Node 20 la memoria usa il file JSON.
