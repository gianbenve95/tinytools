# Contributing

Contributions are welcome: new tools, bug fixes, translations and tests.

## Rules for a tool
- Zero dependencies: only the Node.js standard library (Node 18+).
- Local only: no network requests, except where a tool says so in its description.
- Every tool has a description, a usage line, and tests in `test/`.
- Names are lowercase with hyphens, and must be unique across all groups.

## Workflow
1. Fork the repository and create a branch.
2. Add the tool to a group file in `src/` (or create a new group and register it in `src/core.js`).
3. Add tests in `test/` and run `npm test`.
4. Update the README table and the tool count (`test/cli.test.js`, `README.md`, `package.json`).
5. Open a pull request describing what the tool does and one example.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) and add a line to `CHANGELOG.md`.

The folder `regia/` has its own tests: `cd regia && npm test` (Node 20+).

## Contribuire (italiano)
Servono zero dipendenze, nessuna richiesta di rete, test per ogni tool e nome unico in minuscolo con trattini. Apri una pull request con una descrizione e un esempio.
