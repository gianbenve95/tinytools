# tinytools

**50 piccoli strumenti da terminale, senza dipendenze, ognuno con i suoi test.** Un solo comando (`tt`), tutti i tool che servono ogni giorno: slug, JSON/CSV, cron, TOTP, calcolatrice sicura, duplicati, rinomina in blocco...

*50 tiny zero-dependency CLI utilities (text, JSON/CSV, encoding, numbers/time, files) behind one command, `tt`. Node 18+. MIT.*

## Installazione

```bash
git clone https://github.com/gianbenve95/tinytools.git
cd tinytools
node bin/tt.js list          # elenco dei tool
npm link                     # (opzionale) installa il comando "tt" globalmente
```

## Uso

Il testo si passa come argomento, con `--file=percorso` oppure da stdin:

```bash
tt slugify "Ciao Mondo! È bello"           # ciao-mondo-e-bello
echo '{"a":{"b":[1,2]}}' | tt json-flatten
tt calc "2*(3+4)^2 - sqrt(16)"             # 94
tt cron-next "0 9 * * 1-5" --count=3
tt totp JBSWY3DPEHPK3PXP
tt dupfinder ~/Downloads --min=1MB
tt bulk-rename ./foto --find="IMG_(\\d+)" --replace="vacanza-$1"   # anteprima; aggiungi --apply
tt <tool> --help
```

### Testo

| Tool | Cosa fa | Esempio |
|---|---|---|
| `slugify` | Testo -> slug per URL (accenti rimossi) | `tt slugify "Ciao Mondo! È bello" [--sep=-]` |
| `textstats` | Statistiche: parole, caratteri, righe, tempo di lettura | `tt textstats [--file=x.txt] [--wpm=200]` |
| `dedupe-lines` | Rimuove righe duplicate mantenendo l'ordine | `tt dedupe-lines [--file=x] [--ignore-case]` |
| `sort-lines` | Ordina righe (--numeric, --reverse, --unique) | `tt sort-lines [--file=x] [--numeric] [--reverse] [--unique]` |
| `case-convert` | Converte tra camel, pascal, snake, kebab, constant, title | `tt case-convert --to=snake "someTextHere"` |
| `text-diff` | Diff riga per riga tra due file | `tt text-diff a.txt b.txt` |
| `wrap-text` | A capo automatico a N colonne | `tt wrap-text --width=60 [--file=x]` |
| `strip-html` | HTML -> testo semplice (rimuove tag, script, stili) | `tt strip-html [--file=page.html]` |
| `md-toc` | Genera l'indice dei contenuti di un file Markdown | `tt md-toc --file=README.md [--max=3]` |
| `lorem` | Genera testo segnaposto (deterministico con --seed) | `tt lorem --words=50 [--seed=1]` |

### Dati (JSON / CSV / .env)

| Tool | Cosa fa | Esempio |
|---|---|---|
| `json-flatten` | Appiattisce JSON annidato in chiavi a.b[0].c | `tt json-flatten [--file=x.json]` |
| `json-unflatten` | Operazione inversa di json-flatten | `tt json-unflatten [--file=flat.json]` |
| `json-sort` | Ordina ricorsivamente le chiavi di un JSON | `tt json-sort [--file=x.json] [--indent=2]` |
| `csv2json` | CSV -> JSON (intestazioni, --delim, --types per numeri/booleani) | `tt csv2json [--file=x.csv] [--delim=;] [--types] [--no-header]` |
| `json2csv` | JSON (array di oggetti) -> CSV | `tt json2csv [--file=x.json] [--delim=,]` |
| `json-query` | Estrae valori con percorsi: a.b[0].c, a[*].x, a[-1] | `tt json-query <percorso> [--file=x.json]` |
| `env2json` | File .env -> JSON (commenti, export, virgolette) | `tt env2json [--file=.env]` |
| `json-diff` | Differenze strutturali tra due file JSON | `tt json-diff a.json b.json` |
| `jsonl` | JSON Lines <-> array JSON (--to=array|lines) | `tt jsonl --to=array [--file=x.jsonl]` |
| `csv-stats` | Statistiche per colonne numeriche di un CSV | `tt csv-stats [--col=prezzo] [--file=x.csv] [--delim=;]` |

### Codifica e sicurezza

| Tool | Cosa fa | Esempio |
|---|---|---|
| `b64` | Base64 encode/decode (--decode, --url) | `tt b64 "testo" [--decode] [--url]` |
| `hash` | Hash di testo o file (md5, sha1, sha256, sha512) | `tt hash "testo" \| --file=x [--algo=sha256]` |
| `uuid` | Genera UUID v4 o v7 (--v=7, --count=5) | `tt uuid [--v=4\|7] [--count=1]` |
| `password-gen` | Password casuali sicure con stima dell'entropia | `tt password-gen [--length=20] [--no-symbols] [--no-ambiguous]` |
| `jwt-decode` | Decodifica un JWT (SENZA verificare la firma) e mostra la scadenza | `tt jwt-decode <token>` |
| `url-parse` | Scompone un URL in parti e parametri | `tt url-parse "https://host/path?a=1"` |
| `hexdump` | Dump esadecimale stile hexdump -C | `tt hexdump "testo" \| --file=x` |
| `totp` | Codice TOTP (RFC 6238) da un segreto base32 | `tt totp <SEGRETO_BASE32> [--digits=6] [--period=30] [--time=epoch]` |
| `entropy` | Entropia di Shannon di un testo (bit per carattere e totale) | `tt entropy "testo"` |

### Numeri, unità, tempo, colori

| Tool | Cosa fa | Esempio |
|---|---|---|
| `cron-next` | Prossime esecuzioni di un'espressione cron (5 campi) | `tt cron-next "*/15 9-17 * * 1-5" [--count=5] [--from=2026-01-01T00:00:00Z] [--utc]` |
| `epoch` | Epoch <-> data ISO (secondi/millisecondi riconosciuti da soli) | `tt epoch 1700000000 \| 2026-01-01T00:00:00Z [--tz=Europe/Rome]` |
| `duration` | Durate: "1h30m" -> secondi e "5400" -> "1h 30m" | `tt duration 1h30m15s \| 5400` |
| `bytes` | Dimensioni: "1.5GB" -> byte e "1234567" -> formato leggibile | `tt bytes 1.5GiB \| 1234567` |
| `unit-convert` | Converte lunghezza, peso, volume, velocità, tempo, temperatura | `tt unit-convert 10 km mi \| 100 c f` |
| `roman` | Numeri romani <-> arabi (1-3999) | `tt roman 2026 \| MMXXVI` |
| `base-convert` | Conversione di base numerica 2-36 (anche numeri molto grandi) | `tt base-convert FF --from=16 --to=2` |
| `calc` | Calcolatrice sicura (+ - * / % ^, parentesi, sqrt, min, max, pi...) | `tt calc "2*(3+4)^2 - sqrt(16)"` |
| `color-convert` | Colori hex/rgb/hsl e contrasto WCAG (--contrast=altro) | `tt color-convert "#ff8800" [--contrast=#ffffff]` |
| `date-diff` | Differenza tra due date: giorni, settimane, giorni lavorativi | `tt date-diff 2026-01-01 2026-03-15` |

### File, cartelle, rete

| Tool | Cosa fa | Esempio |
|---|---|---|
| `dupfinder` | Trova file duplicati (stesso contenuto) in una cartella | `tt dupfinder <cartella> [--min=1KB]` |
| `dirsize` | Dimensione di ogni sotto-cartella/file, ordinata | `tt dirsize <cartella> [--top=10]` |
| `bulk-rename` | Rinomina file con regex (anteprima di default, --apply per eseguire) | `tt bulk-rename <cartella> --find="IMG_(\d+)" --replace="foto-$1" [--apply]` |
| `file-tree` | Albero della cartella (ignora .git e node_modules, --all per tutto) | `tt file-tree <cartella> [--depth=3] [--all]` |
| `find-large` | File più grandi di una soglia | `tt find-large <cartella> [--min=10MB] [--top=20]` |
| `loc` | Conta le righe di codice per estensione | `tt loc <cartella>` |
| `todo-scan` | Elenca TODO / FIXME / HACK / XXX nei file di testo | `tt todo-scan <cartella>` |
| `checksum-verify` | Verifica un file di checksum (formato sha256sum/md5sum) | `tt checksum-verify SHA256SUMS` |
| `port-check` | Verifica se una porta TCP è raggiungibile | `tt port-check host porta [--timeout=2000]` |
| `http-status` | Spiega un codice di stato HTTP (o una classe: 4xx) | `tt http-status 404 \| 5xx` |
| `gitignore-gen` | Genera un .gitignore combinando modelli | `tt gitignore-gen node macos vscode  (usa "list" per i modelli)` |

## Sicurezza e limiti

- Nessun tool fa richieste di rete tranne `port-check` (connessione TCP all'host che indichi). Niente telemetria.
- `calc` non usa `eval`: ha un parser proprio.
- `jwt-decode` **non verifica la firma**: serve solo a leggere il contenuto.
- `password-gen` usa `crypto.randomInt`; `totp` è verificato con i vettori ufficiali RFC 6238.
- `bulk-rename` mostra solo l'anteprima finché non aggiungi `--apply`; nessun altro tool modifica file.

## Test

```bash
npm test     # 50 tool, test automatici (node:test), CI su macOS e Linux, Node 18/20/22
```

Contributi benvenuti: un tool = una voce in `src/<gruppo>.js` + un test. Licenza MIT.
