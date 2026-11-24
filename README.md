# tinytools

**100 piccoli strumenti da terminale, senza dipendenze, ognuno con i suoi test.** Un solo comando (`tt`) per le piccole faccende di ogni giorno: slug, JSON/CSV, cron, TOTP, semver, numeri in lettere, mutui, Pasqua e festività italiane, duplicati, rinomina in blocco...

*100 tiny zero-dependency CLI utilities (text, JSON/CSV, encoding, numbers, dates, math, dev helpers, files) behind one command, `tt`. Node 18+. MIT.*

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
tt number-to-words 1234567                 # un milione duecentotrentaquattromila...
tt cron-next "0 9 * * 1-5" --count=3
tt semver satisfies 1.4.0 "^1.2.0"
tt easter 2026
tt loan-payment 200000 3.5 30
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

### Sviluppo

| Tool | Cosa fa | Esempio |
|---|---|---|
| `semver` | Confronta, incrementa e verifica versioni semver | `tt semver compare 1.2.3 1.10.0 \| bump 1.2.3 minor \| satisfies 1.4.0 "^1.2.0"` |
| `regex-test` | Prova una regex su un testo: match, posizioni, gruppi | `tt regex-test "(\d+)-(\d+)" "10-20 e 30-40" [--flags=g]` |
| `json-to-ts` | Genera interfacce TypeScript da un JSON | `tt json-to-ts [--file=x.json] [--name=Root]` |
| `json-schema-infer` | Deduce uno JSON Schema (draft-07) da uno o più esempi | `tt json-schema-infer [--file=x.json]` |
| `env-diff` | Confronta le chiavi di due file .env (senza mostrare i valori) | `tt env-diff .env .env.example` |
| `http-headers` | Analizza un blocco di header HTTP (anche output di curl -i) in JSON | `tt http-headers --file=headers.txt` |
| `cookie-parse` | Analizza un header Cookie o Set-Cookie | `tt cookie-parse "sid=abc; Path=/; HttpOnly; Max-Age=3600"` |
| `query-string` | Query string <-> JSON (chiavi ripetute = array) | `tt query-string parse "a=1&b=2&a=3" \| build '{"a":[1,3],"b":"x y"}'` |
| `glob-test` | Verifica quali percorsi corrispondono a un glob (*, **, ?, {a,b}, [abc]) | `tt glob-test "src/**/*.{js,ts}" src/a.js src/x/b.ts README.md` |
| `line-endings` | Rileva LF/CRLF/CR e converte (--to=lf|crlf) | `tt line-endings --file=x.txt [--to=lf]` |

### Parole, cifrari, tabelle

| Tool | Cosa fa | Esempio |
|---|---|---|
| `caesar` | Cifrario di Cesare / ROT13 (--shift=3, negativo per decifrare) | `tt caesar "testo" --shift=13` |
| `morse` | Codice Morse: testo <-> morse (--decode) | `tt morse "SOS" \| "... --- ..." --decode` |
| `nato` | Alfabeto fonetico NATO (compitare un testo) | `tt nato "Ciao 42"` |
| `word-freq` | Parole più frequenti di un testo | `tt word-freq [--file=x.txt] [--top=10] [--min=3]` |
| `reverse` | Inverte testo per caratteri, parole o righe (--by=chars|words|lines) | `tt reverse "testo" [--by=words]` |
| `deburr` | Rimuove accenti e diacritici (è -> e, ß -> ss) | `tt deburr "Perché è così"` |
| `number-to-words` | Numero in lettere (italiano o inglese, fino a 999 miliardi) | `tt number-to-words 1234 [--lang=it\|en]` |
| `md-table` | CSV/TSV -> tabella Markdown allineata | `tt md-table [--file=x.csv] [--delim=,]` |
| `sample-lines` | Prime/ultime/casuali N righe (--mode=head|tail|random) | `tt sample-lines --n=5 [--mode=random] [--seed=1]` |
| `join-lines` | Unisce le righe con un separatore (--sep=", " --quote="'") | `tt join-lines --sep=", " [--quote='"']` |

### Matematica e finanza

| Tool | Cosa fa | Esempio |
|---|---|---|
| `primes` | Primalità e fattorizzazione di un intero, o elenco fino a N (--upto) | `tt primes 360 \| --upto=50` |
| `gcd-lcm` | Massimo comun divisore e minimo comune multiplo | `tt gcd-lcm 12 18 30` |
| `fibonacci` | Sequenza di Fibonacci (--n=10) o N-esimo termine (--nth=100, BigInt) | `tt fibonacci --n=10 \| --nth=100` |
| `stats` | Statistiche di una lista di numeri (media, mediana, moda, deviazione) | `tt stats 2 4 4 4 5 5 7 9` |
| `percent` | Percentuali: of (X% di Y), is (X è che % di Y), change (variazione) | `tt percent of 20 150 \| is 30 150 \| change 100 125` |
| `compound-interest` | Interesse composto con versamenti mensili opzionali | `tt compound-interest <capitale> <tasso%annuo> <anni> [--n=12] [--contrib=100]` |
| `loan-payment` | Rata mensile di un mutuo/prestito, totale e interessi (--schedule=N righe) | `tt loan-payment <importo> <tasso%annuo> <anni> [--schedule=3]` |
| `bill-split` | Divide un conto tra persone con mancia opzionale | `tt bill-split <totale> <persone> [--tip=10]` |
| `dice` | Tira dadi in notazione NdM+K (es. 3d6+2), con --seed per ripetibilità | `tt dice 3d6+2 [--seed=1]` |
| `combinatorics` | Fattoriale, combinazioni nCr e permutazioni nPr (BigInt) | `tt combinatorics <n> [<r>]` |

### Date e calendario

| Tool | Cosa fa | Esempio |
|---|---|---|
| `add-date` | Somma giorni/settimane/mesi/anni a una data (fine mese gestita) | `tt add-date 2026-01-31 --months=1 [--days=] [--weeks=] [--years=] (valori negativi ammessi)` |
| `weekday` | Giorno della settimana di una o più date (--lang=it|en) | `tt weekday 2026-03-10 [2026-12-25]` |
| `week-number` | Numero di settimana ISO 8601 di una data | `tt week-number 2026-01-01` |
| `age` | Età esatta da una data di nascita e prossimo compleanno | `tt age 1990-05-15 [--on=2026-03-10]` |
| `countdown` | Giorni che mancano a una data (negativi se passata) | `tt countdown 2026-12-25 [--from=2026-03-10]` |
| `tz-convert` | Converte un orario tra fusi IANA (tiene conto dell'ora legale) | `tt tz-convert "2026-03-10 09:00" Europe/Rome America/New_York` |
| `calendar` | Calendario del mese (lunedì primo giorno, --sunday per domenica) | `tt calendar 2026 3 [--sunday] [--lang=it\|en]` |
| `leap-year` | Anno bisestile? (e il prossimo bisestile) | `tt leap-year 2024` |
| `easter` | Data della Pasqua (calendario gregoriano) per un anno | `tt easter 2026` |
| `holidays-it` | Festività nazionali italiane di un anno (con Pasqua e Pasquetta) | `tt holidays-it 2026` |

### File e cartelle (ispezione)

| Tool | Cosa fa | Esempio |
|---|---|---|
| `file-type` | Riconosce il tipo reale di un file dai suoi primi byte | `tt file-type file1 [file2...]` |
| `mime` | Tipo MIME di un'estensione o di un nome di file | `tt mime pdf \| foto.JPG` |
| `ext-count` | Conta file e spazio per estensione | `tt ext-count <cartella>` |
| `newest` | I file modificati più di recente | `tt newest <cartella> [--top=10]` |
| `empty-dirs` | Elenca le cartelle vuote (non cancella nulla) | `tt empty-dirs <cartella>` |
| `path-info` | Analizza un percorso: parti, esistenza, tipo, dimensione | `tt path-info ~/Documenti/rel.tar.gz` |
| `dir-hash` | Hash SHA-256 deterministico del contenuto di una cartella | `tt dir-hash <cartella>` |
| `long-lines` | Righe più lunghe di N caratteri nei file di testo | `tt long-lines <cartella> [--max=120]` |
| `trailing-ws` | Trova (o con --fix rimuove) gli spazi a fine riga | `tt trailing-ws <cartella> [--fix]` |
| `bom-check` | Rileva il BOM UTF-8/UTF-16 nei file (--fix rimuove il BOM UTF-8) | `tt bom-check <cartella> [--fix]` |

## Sicurezza e limiti

- Nessun tool fa richieste di rete tranne `port-check` (connessione TCP all'host che indichi). Niente telemetria.
- I file vengono modificati **solo** con un flag esplicito: `bulk-rename --apply`, `trailing-ws --fix`, `bom-check --fix`. Senza, mostrano soltanto cosa farebbero.
- `calc` non usa `eval`: ha un parser proprio. `jwt-decode` **non verifica la firma**.
- `password-gen` usa `crypto.randomInt`; `totp` è verificato con i vettori ufficiali RFC 6238; Pasqua e settimane ISO sono verificate su date note.
- `loan-payment` e `compound-interest` sono calcoli indicativi, non consulenza finanziaria.

## Test

```bash
npm test     # 100 tool, test automatici (node:test), CI su macOS e Linux, Node 18/20/22
```

Contributi benvenuti: un tool = una voce in `src/<gruppo>.js` + un test. Licenza MIT.
