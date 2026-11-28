# tinytools

**308 small command line tools with zero dependencies, each one tested.** One command, `tt`, for everyday chores: slugs, JSON and CSV, cron, TOTP, semver, subnets, IBAN and Italian tax codes, Markdown, Git statistics, numbers in words, loans, Easter and Italian holidays, duplicate files, bulk rename, accessibility checks and more.

Node.js 18 or later. MIT license. No network requests, except `port-check` (a TCP connection to the host you choose). Files are modified only with an explicit flag such as `--apply`.

The main documentation is in Italian ([README.md](README.md)). Tool names and options are in English or plain Italian words, and `tt <tool> --help` shows usage.

## Install

```bash
git clone https://github.com/gianbenve95/tinytools.git
cd tinytools
node bin/tt.js list          # list all tools
npm link                     # optional: install the "tt" command globally
source <(tt completion bash) # optional: tab completion (zsh also supported)
```

## Use

Text comes from an argument, from `--file=path` or from stdin.

```bash
tt slugify "Ciao Mondo! È bello"           # ciao-mondo-e-bello
echo '{"a":{"b":[1,2]}}' | tt json-flatten
tt calc "2*(3+4)^2 - sqrt(16)"             # 94
tt cron-next "0 9 * * 1-5" --count=3
tt semver satisfies 1.4.0 "^1.2.0"
tt a11y-check --file=page.html             # static accessibility checks on HTML
tt page-glance --file=page.html            # quick overview of a page
tt passphrase --words=9                    # random passphrase with entropy estimate
tt search json csv                         # find tools by keyword
```

## Groups

Text, data (JSON, CSV, YAML, TOML, XML), encoding and crypto primitives, numbers and units, dates and time, math and finance, files and folders, local networking (IP, subnets), Markdown, Git (read only), web and SEO, validators (IBAN, tax code, VAT number), practical calculators, security helpers (certificates, JWT, SSH, headers), geography, accessibility, and a few light curiosities. Run `tt list` for the full list.

## Accessibility tools

`a11y-check` and `page-glance` analyse the static HTML of a page, locally. They cover a part of WCAG: contrast, keyboard use and screen reader behaviour still need manual checks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). A tool needs no dependencies, no network requests and its own tests. Run `npm test` before opening a pull request.

## `regia/`

A multi-agent orchestrator for Claude Code: a guard that asks for consent before emails and payments, specialised agents, a router, local memory and optional delegation to a local Ollama. Node 20 or later. See `regia/README.md`.
