// The 11 agents: frontmatter in the current schema, required sections, rules at the top.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'agents');
const EXPECTED = {
  pianificatore: 'opus', architetto: 'opus', sviluppatore: 'sonnet', tester: 'sonnet', revisore: 'opus', sicurezza: 'sonnet',
  'seo-tecnico': 'sonnet', 'verificatore-live': 'haiku', illuminotecnico: 'opus', documentatore: 'haiku', ricercatore: 'haiku',
};
const KNOWN_KEYS = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'color', 'permissionMode', 'maxTurns', 'isolation', 'effort', 'memory', 'mcpServers', 'hooks', 'skills', 'background']);

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'frontmatter mancante');
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"')) v = JSON.parse(v); // quoted: valid YAML and JSON
    else assert.ok(!/: /.test(v), `${k}: valore con ": " non quotato`);
    out[k] = v;
  }
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));

test('11 agenti, nomi e modelli come da tabella', () => {
  assert.deepEqual(files.map((f) => f.replace(/\.md$/, '')).sort(), Object.keys(EXPECTED).sort());
});

for (const f of files) {
  test(`agente ${f}`, () => {
    const text = readFileSync(join(DIR, f), 'utf8');
    const fm = frontmatter(text);
    for (const k of Object.keys(fm)) assert.ok(KNOWN_KEYS.has(k), `chiave sconosciuta ${k}`);
    assert.equal(fm.name, f.replace(/\.md$/, ''));
    assert.equal(fm.model, EXPECTED[fm.name]);
    assert.ok(fm.description.length > 60 && fm.description.length < 400);
    const body = text.slice(text.indexOf('\n---\n', 4) + 5);
    const firstSection = body.match(/^## (.+)$/m)[1];
    assert.equal(firstSection, 'Regole assolute (prima di tutto)', 'le regole stanno in testa');
    for (const s of ['Scopo', 'Quando usarlo', 'Quando NON usarlo', 'Input atteso', 'Output (breve, a punti)', 'Chiusura obbligatoria']) assert.ok(body.includes(`## ${s}`), `manca ${s}`);
    assert.match(body, /ESITO: completato/);
    assert.match(body, /Nessuna mail parte/);
    assert.ok(!/—/.test(text), 'niente trattini lunghi');
  });
}

test('chi non deve scrivere non ha tool di scrittura', () => {
  for (const name of ['revisore', 'sicurezza', 'illuminotecnico', 'pianificatore']) {
    const fm = frontmatter(readFileSync(join(DIR, `${name}.md`), 'utf8'));
    assert.ok(!/\b(Write|Edit)\b/.test(fm.tools), name);
  }
  const live = frontmatter(readFileSync(join(DIR, 'verificatore-live.md'), 'utf8'));
  assert.match(live.disallowedTools, /Write, Edit/);
});

test('il documentatore non ha tool di posta', () => {
  const fm = frontmatter(readFileSync(join(DIR, 'documentatore.md'), 'utf8'));
  assert.ok(!/mail|send|gmail|outlook/i.test(fm.tools));
});
