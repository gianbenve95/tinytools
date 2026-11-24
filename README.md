# tinytools

**200 piccoli strumenti da terminale, senza dipendenze, ognuno con i suoi test.** Un solo comando (`tt`) per le piccole faccende di ogni giorno: slug, JSON/CSV, cron, TOTP, semver, subnet, IBAN e codice fiscale, Markdown, statistiche Git, numeri in lettere, mutui, Pasqua e festività italiane, duplicati, rinomina in blocco...

*200 tiny zero-dependency CLI utilities (text, JSON/CSV, encoding, numbers, dates, math, networking, markdown, git, files, system, validators, crypto) behind one command, `tt`. Node 18+. MIT.*

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
tt cidr 192.168.1.77/24
tt cron-next "0 9 * * 1-5" --count=3
tt semver satisfies 1.4.0 "^1.2.0"
tt number-to-words 1234567
tt easter 2026
tt git-hot-files ~/progetti/app --top=5
tt md-anchor-check --file=README.md
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

### Rete offline (IP, subnet, nomi)

| Tool | Cosa fa | Esempio |
|---|---|---|
| `ip-info` | Classifica un indirizzo IPv4/IPv6 (privato, loopback, pubblico...) | `tt ip-info 192.168.1.10 \| ::1` |
| `cidr` | Calcola rete, broadcast, maschera e host di un CIDR IPv4 | `tt cidr 192.168.1.0/24` |
| `ip-to-int` | IPv4 <-> intero (e esadecimale) | `tt ip-to-int 192.168.1.1 \| 3232235777` |
| `subnet-split` | Divide un CIDR in sottoreti più piccole (--prefix=26) | `tt subnet-split 10.0.0.0/24 --prefix=26` |
| `mac-format` | Normalizza un indirizzo MAC (due punti, trattini, Cisco, compatto) | `tt mac-format aa-bb-cc-dd-ee-ff` |
| `punycode` | Nomi di dominio internazionali: Unicode <-> punycode (xn--) | `tt punycode münchen.de \| xn--mnchen-3ya.de` |
| `hostname-check` | Verifica un hostname secondo RFC 1123 e elenca i problemi | `tt hostname-check esempio.com` |
| `email-validate` | Controllo sintattico di un indirizzo email (non verifica che esista) | `tt email-validate nome@esempio.it` |
| `port-lookup` | Porte comuni: da numero a servizio e viceversa | `tt port-lookup 443 \| postgresql` |
| `url-encode` | Codifica/decodifica percent-encoding (--decode, --full per URL interi) | `tt url-encode "a b&c" [--decode] [--full]` |

### Markdown

| Tool | Cosa fa | Esempio |
|---|---|---|
| `md-links` | Estrae link e immagini da un Markdown (ignora i blocchi di codice) | `tt md-links --file=README.md` |
| `md-headings` | Struttura dei titoli (livello, testo, riga) | `tt md-headings --file=README.md` |
| `md-lint` | Controlli di stile: spazi finali, righe vuote doppie, salti di titolo, duplicati | `tt md-lint --file=README.md [--max=120]` |
| `md-to-html` | Converte Markdown (sottoinsieme sicuro) in HTML | `tt md-to-html --file=README.md` |
| `md-strip` | Rimuove la sintassi Markdown lasciando testo semplice | `tt md-strip --file=README.md` |
| `md-tasks` | Avanzamento delle checklist - [ ] / - [x] e attività aperte | `tt md-tasks --file=TODO.md` |
| `md-front-matter` | Legge il front matter YAML (sottoinsieme) e lo restituisce in JSON | `tt md-front-matter --file=post.md` |
| `md-table-sort` | Ordina una tabella Markdown per colonna (--col=2 o nome, --desc, --numeric) | `tt md-table-sort --col=Nome [--desc] [--numeric] [--file=t.md]` |
| `md-anchor-check` | Verifica che i link #ancora e i file relativi esistano | `tt md-anchor-check --file=README.md` |
| `md-wordcount` | Conta parole escludendo codice e URL, con tempo di lettura | `tt md-wordcount --file=README.md [--wpm=200]` |

### Git (sola lettura)

| Tool | Cosa fa | Esempio |
|---|---|---|
| `git-authors` | Commit per autore | `tt git-authors [repo]` |
| `git-activity` | Distribuzione dei commit per giorno della settimana e ora | `tt git-activity [repo]` |
| `git-hot-files` | I file modificati più spesso (--top=10 --since="6 months ago") | `tt git-hot-files [repo] [--top=10] [--since=...]` |
| `git-big-files` | I file più grandi in tutta la storia del repository | `tt git-big-files [repo] [--top=10]` |
| `git-stale-branches` | Branch locali senza commit da N giorni (--days=90) | `tt git-stale-branches [repo] [--days=90] [--now=epoch]` |
| `git-unpushed` | Commit locali non ancora inviati al remoto | `tt git-unpushed [repo]` |
| `git-commit-lint` | Controlla gli ultimi commit (Conventional Commits, lunghezza, punto finale) | `tt git-commit-lint [repo] [--n=20]` |
| `git-secrets-scan` | Cerca possibili segreti nei file tracciati (valori mascherati nell'output) | `tt git-secrets-scan [repo]` |
| `git-first-commit` | Primo commit, età del progetto e numero di commit | `tt git-first-commit [repo] [--now=2026-01-01]` |
| `git-streak` | Serie più lunga di giorni consecutivi con commit (e serie attuale) | `tt git-streak [repo] [--today=2026-03-10]` |

### Web e grafica leggera

| Tool | Cosa fa | Esempio |
|---|---|---|
| `image-info` | Dimensioni e formato di immagini (PNG, JPEG, GIF, WebP, BMP, SVG) senza librerie | `tt image-info foto.png logo.svg ...` |
| `data-uri` | File -> data URI base64 (o --decode per leggere una data URI, --out per salvarla) | `tt data-uri immagine.png \| "data:image/png;base64,..." --decode [--out=file]` |
| `aspect-ratio` | Rapporto d'aspetto semplificato e ridimensionamento proporzionale | `tt aspect-ratio 1920 1080 [--width=800 \| --height=300]` |
| `placeholder-svg` | Genera un'immagine segnaposto SVG (--text --bg --fg) | `tt placeholder-svg 300 200 [--text="Anteprima"] [--bg=#dddddd] [--fg=#555555]` |
| `svg-minify` | Riduce un SVG: commenti, prologo, spazi tra i tag | `tt svg-minify --file=logo.svg` |
| `css-minify` | Minimizza un CSS (commenti, spazi, ; finali) preservando le stringhe | `tt css-minify --file=style.css` |
| `color-palette` | Armonie di colore da un colore base (complementare, analoga, triade...) | `tt color-palette "#3498db"` |
| `gradient-css` | Genera un gradiente CSS (--angle=90, --type=radial) | `tt gradient-css #ff0000 #0000ff [#00ff00 ...] [--angle=90] [--type=linear\|radial]` |
| `html-entities` | Codifica/decodifica entità HTML (--decode) | `tt html-entities "<b>è</b>" \| "&lt;b&gt;&egrave;" --decode` |
| `meta-tags` | Genera i tag <meta> SEO, Open Graph e Twitter Card | `tt meta-tags --title="..." --description="..." [--url=] [--image=] [--site=]` |

### Sistema locale

| Tool | Cosa fa | Esempio |
|---|---|---|
| `sys-info` | Sistema operativo, architettura, memoria, CPU e versione di Node | `tt sys-info ` |
| `env-list` | Variabili d'ambiente con i valori sensibili mascherati (--filter=PATH, --show per svelarli) | `tt env-list [--filter=testo] [--show]` |
| `path-doctor` | Controlla il PATH: cartelle inesistenti, duplicati, voci relative | `tt path-doctor ` |
| `which-all` | Tutte le posizioni di un comando nel PATH (come which -a) | `tt which-all node` |
| `disk-free` | Spazio totale, usato e libero di un volume | `tt disk-free [percorso]` |
| `uptime` | Da quanto tempo è acceso il sistema (--seconds=N per formattare un valore) | `tt uptime [--seconds=93784]` |
| `cpu-info` | Modello e core della CPU e carico medio (1/5/15 min) | `tt cpu-info ` |
| `local-ips` | Indirizzi IP delle interfacce di rete locali (--all include loopback e IPv6) | `tt local-ips [--all]` |
| `timezone-info` | Fuso orario, scostamento da UTC e ora legale (--tz=Europe/Rome --at=ISO) | `tt timezone-info [--tz=Europe/Rome] [--at=2026-07-01T00:00:00Z]` |
| `locale-info` | Come una lingua formatta numeri, valute e date (--locale=it-IT) | `tt locale-info [--locale=it-IT] [--currency=EUR]` |

### CSV

| Tool | Cosa fa | Esempio |
|---|---|---|
| `csv-sort` | Ordina un CSV per colonna (--col=nome|n, --desc; numeri riconosciuti da soli) | `tt csv-sort --col=prezzo [--desc] [--file=x.csv] [--delim=;]` |
| `csv-filter` | Filtra le righe: --where="prezzo>10 && nome~^A" (= != > >= < <= ~ ^= $= *=) | `tt csv-filter --where="eta>=18" [--file=x.csv]` |
| `csv-select` | Tiene (e riordina) solo alcune colonne: --cols=nome,eta o --cols=2,1 | `tt csv-select --cols=nome,eta [--file=x.csv]` |
| `csv-join` | Unisce due CSV su una colonna comune (--on=id, --left per mantenere tutte le righe del primo) | `tt csv-join a.csv b.csv --on=id [--left]` |
| `csv-dedupe` | Rimuove righe duplicate (intere o per colonne: --by=email) | `tt csv-dedupe [--by=col1,col2] [--file=x.csv]` |
| `csv-transpose` | Scambia righe e colonne | `tt csv-transpose [--file=x.csv]` |
| `csv-head` | Prime o ultime N righe di dati, intestazione inclusa (--mode=head|tail) | `tt csv-head --n=5 [--mode=tail] [--file=x.csv]` |
| `csv-validate` | Controlla struttura: colonne coerenti, intestazioni vuote o duplicate, righe vuote | `tt csv-validate [--file=x.csv]` |
| `csv-merge` | Concatena più CSV con la stessa intestazione (unisce per nome di colonna) | `tt csv-merge a.csv b.csv [c.csv ...]` |
| `csv-group` | Raggruppa per colonna con conteggio e somme/medie (--by=cat --agg=sum:prezzo,avg:qta) | `tt csv-group --by=categoria [--agg=sum:prezzo,avg:qta,min:x,max:x] [--file=x.csv]` |

### JSON avanzato

| Tool | Cosa fa | Esempio |
|---|---|---|
| `json-merge` | Unisce più file JSON in profondità (--arrays=concat per concatenare gli array) | `tt json-merge a.json b.json [--arrays=concat]` |
| `json-pick` | Tiene solo i percorsi indicati (--paths=a.b,c[0]) | `tt json-pick --paths=nome,indirizzo.citta [--file=x.json]` |
| `json-omit` | Rimuove i percorsi indicati (--paths=a.b,c) | `tt json-omit --paths=password,utente.token [--file=x.json]` |
| `json-fmt` | Formatta o comprime un JSON (--indent=4, --minify, --tabs) | `tt json-fmt [--indent=2 \| --minify \| --tabs] [--file=x.json]` |
| `json-validate` | Valida un JSON con uno schema (type, properties, required, items, enum, min/max, pattern, anyOf...) | `tt json-validate dati.json --schema=schema.json` |
| `json-stats` | Statistiche: profondità, tipi, numero di chiavi, array più lungo | `tt json-stats [--file=x.json]` |
| `json-keys` | Elenca tutti i percorsi di chiave con il tipo (array come []) | `tt json-keys [--file=x.json]` |
| `json-redact` | Maschera i valori di chiavi sensibili (password, token, api_key...) con *** | `tt json-redact [--keys=extra1,extra2] [--file=x.json]` |
| `json-filter` | Filtra un array di oggetti: --where="eta>=18 && citta.nome~^R" (--path per array annidati) | `tt json-filter --where="prezzo>10" [--path=items] [--file=x.json]` |
| `json-group` | Raggruppa un array per chiave con conteggio e somma opzionale (--by=cat --sum=prezzo) | `tt json-group --by=categoria [--sum=prezzo] [--path=items] [--file=x.json]` |

### Validatori (IBAN, codice fiscale, P.IVA...)

| Tool | Cosa fa | Esempio |
|---|---|---|
| `iban-validate` | Valida un IBAN (lunghezza per paese e checksum mod 97) | `tt iban-validate IT60X0542811101000000123456` |
| `codice-fiscale` | Verifica il carattere di controllo di un codice fiscale e ne legge data di nascita e sesso | `tt codice-fiscale RSSMRA85T10A562S [--today=2026-03-10]` |
| `partita-iva` | Verifica la cifra di controllo di una partita IVA italiana (11 cifre) | `tt partita-iva 12345678903` |
| `luhn` | Algoritmo di Luhn: valida un numero di carta (e ne riconosce il circuito) o calcola la cifra finale (--complete) | `tt luhn 4111111111111111 \| 411111111111111 --complete` |
| `isbn` | Valida ISBN-10/ISBN-13 e converte il 10 in 13 | `tt isbn 0306406152 \| 9780306406157` |
| `ean` | Valida EAN-13/EAN-8/UPC-A o calcola la cifra di controllo (--complete) | `tt ean 4006381333931 \| 400638133393 --complete` |
| `uuid-validate` | Valida un UUID e ne indica versione e variante | `tt uuid-validate 550e8400-e29b-41d4-a716-446655440000` |
| `bic-validate` | Controllo formale di un codice BIC/SWIFT (8 o 11 caratteri) | `tt bic-validate DEUTDEFF500` |
| `phone-it` | Normalizza un numero di telefono italiano in formato E.164 e ne indica il tipo | `tt phone-it "347 123 4567" \| "+39 06 1234 5678"` |
| `password-strength` | Valuta una password: entropia stimata, schemi deboli e tempo di attacco offline (stime) | `tt password-strength "la-mia-password" (il testo resta sul tuo computer)` |

### Righe di testo (grep, sed, cut, uniq...)

| Tool | Cosa fa | Esempio |
|---|---|---|
| `grep-lite` | Filtra le righe con una regex (--invert, --ignore-case, --n numeri di riga, --count, --fixed) | `tt grep-lite "pattern" [--file=x] [--invert] [--ignore-case] [--n] [--count] [--fixed]` |
| `replace` | Cerca e sostituisce (testo letterale; --regex per espressioni con $1, --ignore-case, --first) | `tt replace "vecchio" "nuovo" [--file=x] [--regex] [--ignore-case] [--first]` |
| `number-lines` | Numera le righe (--start=1, --skip-empty, --sep=": ") | `tt number-lines [--file=x] [--start=1] [--sep=": "] [--skip-empty]` |
| `cut-fields` | Estrae colonne (--f=1,3-4, --d="," ; senza --d divide sugli spazi) | `tt cut-fields --f=1,3 [--d=","] [--out-d=";"] [--file=x]` |
| `uniq-count` | Righe uniche con il numero di occorrenze, dalla più frequente (--top, --ignore-case) | `tt uniq-count [--file=x] [--top=10] [--ignore-case]` |
| `line-stats` | Statistiche sulle righe: totale, vuote, lunghezza minima/massima/media, duplicati | `tt line-stats [--file=x]` |
| `trim-lines` | Pulisce le righe: spazi ai bordi, righe vuote multiple (--no-blank, --left, --right) | `tt trim-lines [--file=x] [--no-blank] [--left \| --right]` |
| `add-affix` | Aggiunge prefisso e/o suffisso a ogni riga (\t e \n ammessi) | `tt add-affix --prefix="- " [--suffix=","] [--skip-empty] [--file=x]` |
| `columns` | Allinea in colonne un testo separato da spazi o da un delimitatore (--d) | `tt columns [--d=","] [--gap=2] [--file=x]` |
| `paste-columns` | Affianca due file riga per riga (--d="\t") | `tt paste-columns a.txt b.txt [--d=" \| "]` |

### Codifiche e primitive crittografiche

| Tool | Cosa fa | Esempio |
|---|---|---|
| `hmac` | HMAC di un testo o file (--key o --key-file, --algo=sha256) | `tt hmac "messaggio" --key=segreto [--algo=sha256\|sha1\|sha512] [--format=hex\|base64]` |
| `random-bytes` | Byte casuali crittograficamente sicuri (--n=16, --format=hex|base64|base64url) | `tt random-bytes [--n=16] [--format=hex]` |
| `base32` | Base32 RFC 4648: codifica/decodifica (--decode, --no-pad) | `tt base32 "foobar" \| MZXW6YTBOI==== --decode` |
| `base58` | Base58 (alfabeto Bitcoin): codifica/decodifica (--decode) | `tt base58 "Hello World!" \| 2NEpo7TZRRrLZSi2U --decode` |
| `hex` | Testo <-> esadecimale (--decode, --sep=" ") | `tt hex "ciao" \| 6369616f --decode` |
| `binary-text` | Testo <-> binario a gruppi di 8 bit (--decode) | `tt binary-text "Hi" \| "01001000 01101001" --decode` |
| `crc32` | Checksum CRC-32 (o --algo=adler32) di un testo o file | `tt crc32 "testo" \| --file=x [--algo=adler32]` |
| `ulid` | Genera ULID ordinabili per tempo (--count) o ne decodifica la data (--decode) | `tt ulid [--count=1] \| 01ARZ3NDEKTSV4RRFFQ69G5FAV --decode` |
| `nanoid` | ID casuali URL-safe stile nanoid (--size=21, --alphabet, --count) | `tt nanoid [--size=21] [--count=1] [--alphabet=abc123]` |
| `otp-uri` | Costruisce l'URI otpauth:// (per QR code di app 2FA) da segreto base32, account ed emittente | `tt otp-uri <SEGRETO_BASE32> --account=nome@esempio.it --issuer=MioSito [--digits=6] [--period=30]` |

## Sicurezza e limiti

- Nessun tool fa richieste di rete tranne `port-check` (connessione TCP all'host che indichi). Niente telemetria.
- I file vengono modificati **solo** con un flag esplicito (`bulk-rename --apply`, `trailing-ws --fix`, `bom-check --fix`, `data-uri --out`...). Senza, mostrano soltanto cosa farebbero. I tool `git-*` sono di sola lettura.
- `calc` non usa `eval`; `md-to-html` esegue l'escape dell'HTML e scarta i link `javascript:`. `jwt-decode` **non verifica la firma**.
- `env-list` e `git-secrets-scan` mascherano i valori sensibili nell'output; `git-secrets-scan` dà solo indizi.
- `password-gen` usa `crypto.randomInt`; `totp` è verificato con i vettori RFC 6238; Pasqua e settimane ISO su date note.
- I calcoli finanziari sono indicativi, non consulenza.

## Test

```bash
npm test     # 200 tool, test automatici (node:test), CI su macOS e Linux, Node 18/20/22
```

Contributi benvenuti: un tool = una voce in `src/<gruppo>.js` + un test. Dopo aver aggiunto un gruppo, aggiorna `scripts/gen-readme.js` e lancia `node scripts/gen-readme.js`.
Licenza MIT.
