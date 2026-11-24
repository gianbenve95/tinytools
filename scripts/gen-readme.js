'use strict';
// Rigenera README.md dall'elenco dei tool registrati: node scripts/gen-readme.js
const { registry } = require('../src/core');
const names = { text: 'Testo', data: 'Dati (JSON / CSV / .env)', encode: 'Codifica e sicurezza', numbers: 'Numeri, unità, tempo, colori', files: 'File, cartelle, rete', dev: 'Sviluppo', words: 'Parole, cifrari, tabelle', math: 'Matematica e finanza', dates: 'Date e calendario', files2: 'File e cartelle (ispezione)', net: 'Rete offline (IP, subnet, nomi)', markdown: 'Markdown', git: 'Git (sola lettura)', web: 'Web e grafica leggera', system: 'Sistema locale' };
const extra = require('./groups-extra.json');
Object.assign(names, extra);
const N = Object.keys(registry).length;
let tbl = '';
for (const g of Object.keys(names)) {
  const rows = Object.entries(registry).filter(([, t]) => t.group === g); if (!rows.length) continue;
  tbl += `\n### ${names[g]}\n\n| Tool | Cosa fa | Esempio |\n|---|---|---|\n`;
  for (const [n, t] of rows) tbl += `| \`${n}\` | ${t.desc} | \`tt ${n} ${t.usage.replace(/\|/g, '\\|')}\`.trim() |\n`.replace('`.trim()', '`');
}
const missing = [...new Set(Object.values(registry).map(t => t.group))].filter(g => !names[g]); if (missing.length) throw new Error('Gruppi senza nome nel README: ' + missing);
const md = `# tinytools

**${N} piccoli strumenti da terminale, senza dipendenze, ognuno con i suoi test.** Un solo comando (\`tt\`) per le piccole faccende di ogni giorno: slug, JSON/CSV, cron, TOTP, semver, subnet, Markdown, statistiche Git, numeri in lettere, mutui, Pasqua e festività italiane, duplicati, rinomina in blocco...

*${N} tiny zero-dependency CLI utilities (text, JSON/CSV, encoding, numbers, dates, math, networking, markdown, git, files, system) behind one command, \`tt\`. Node 18+. MIT.*

## Installazione

\`\`\`bash
git clone https://github.com/gianbenve95/tinytools.git
cd tinytools
node bin/tt.js list          # elenco dei tool
npm link                     # (opzionale) installa il comando "tt" globalmente
\`\`\`

## Uso

Il testo si passa come argomento, con \`--file=percorso\` oppure da stdin:

\`\`\`bash
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
tt bulk-rename ./foto --find="IMG_(\\\\d+)" --replace="vacanza-$1"   # anteprima; aggiungi --apply
tt <tool> --help
\`\`\`
${tbl}
## Sicurezza e limiti

- Nessun tool fa richieste di rete tranne \`port-check\` (connessione TCP all'host che indichi). Niente telemetria.
- I file vengono modificati **solo** con un flag esplicito (\`bulk-rename --apply\`, \`trailing-ws --fix\`, \`bom-check --fix\`, \`data-uri --out\`...). Senza, mostrano soltanto cosa farebbero. I tool \`git-*\` sono di sola lettura.
- \`calc\` non usa \`eval\`; \`md-to-html\` esegue l'escape dell'HTML e scarta i link \`javascript:\`. \`jwt-decode\` **non verifica la firma**.
- \`env-list\` e \`git-secrets-scan\` mascherano i valori sensibili nell'output; \`git-secrets-scan\` dà solo indizi.
- \`password-gen\` usa \`crypto.randomInt\`; \`totp\` è verificato con i vettori RFC 6238; Pasqua e settimane ISO su date note.
- I calcoli finanziari sono indicativi, non consulenza.

## Test

\`\`\`bash
npm test     # ${N} tool, test automatici (node:test), CI su macOS e Linux, Node 18/20/22
\`\`\`

Contributi benvenuti: un tool = una voce in \`src/<gruppo>.js\` + un test. Dopo aver aggiunto un gruppo, aggiorna \`scripts/gen-readme.js\` e lancia \`node scripts/gen-readme.js\`.
Licenza MIT.
`;
require('fs').writeFileSync(require('path').join(__dirname, '..', 'README.md'), md);
console.log('README.md aggiornato:', N, 'tool');
