// REGIA memory: SQLite (node:sqlite) + FTS5, JSON fallback when SQLite is not available.
// Optional semantic search with Ollama embeddings (cosine in JS). Secrets are refused.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { dataDir, findSecret, readJson, writeJsonAtomic, loadConfig, ollamaFetch, ollamaPick } from '../../hooks/lib/common.mjs';
import { quietExperimental } from '../../hooks/lib/mcp-server.mjs';

export const TIPI = ['decisione', 'vincolo', 'stato', 'lezione'];
const STOP = new Set('a ad al alla alle agli ai allo anche che chi come con cosa da dal dalla dei del della delle di e ed gli ha ho i il in io la le lo ma mi ne nel nella non o per piu più quale quando se si sono su sul sulla ti tra tu un una uno va the of and to for in on is it with how what fare fai'.split(' '));

export function tokens(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
}

function now() { return new Date().toISOString(); }

function checkSecret(testo) {
  const s = findSecret(testo);
  if (s) throw new Error(`Non salvo segreti in memoria (${s.label}). Salva la decisione senza la chiave.`);
}

function normTipo(tipo) {
  const t = String(tipo || 'decisione').toLowerCase();
  if (!TIPI.includes(t)) throw new Error(`Tipo non valido: ${tipo}. Usa: ${TIPI.join(', ')}.`);
  return t;
}

async function embed(text) {
  const cfg = loadConfig();
  const p = await ollamaPick('embed', cfg.ollama.timeoutMs);
  if (!p.ok) return null;
  const model = p.model;
  const r = await ollamaFetch('/api/embed', { model, input: text }, 5000, p.host);
  const v = r.ok ? r.data?.embeddings?.[0] : null;
  return v ? { v, model } : null;
}

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

// ---------------------------------------------------------------- SQLite backend

class SqliteStore {
  constructor(DatabaseSync, file) {
    this.kind = 'sqlite+fts5';
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS ricordi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        testo TEXT NOT NULL,
        progetto TEXT NOT NULL DEFAULT 'globale',
        tipo TEXT NOT NULL,
        tag TEXT NOT NULL DEFAULT '',
        creato TEXT NOT NULL,
        embedding TEXT,
        modello_embedding TEXT
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS ricordi_fts USING fts5(
        testo, tag, content='ricordi', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS ricordi_ai AFTER INSERT ON ricordi BEGIN
        INSERT INTO ricordi_fts(rowid, testo, tag) VALUES (new.id, new.testo, new.tag);
      END;
      CREATE TRIGGER IF NOT EXISTS ricordi_ad AFTER DELETE ON ricordi BEGIN
        INSERT INTO ricordi_fts(ricordi_fts, rowid, testo, tag) VALUES ('delete', old.id, old.testo, old.tag);
      END;
    `);
  }
  insert(r) {
    const dup = this.db.prepare('SELECT id FROM ricordi WHERE testo = ? AND progetto = ?').get(r.testo, r.progetto);
    if (dup) return { id: dup.id, duplicato: true };
    const res = this.db.prepare('INSERT INTO ricordi (testo, progetto, tipo, tag, creato) VALUES (?, ?, ?, ?, ?)').run(r.testo, r.progetto, r.tipo, r.tag, r.creato);
    return { id: Number(res.lastInsertRowid), duplicato: false };
  }
  setEmbedding(id, e) { this.db.prepare('UPDATE ricordi SET embedding = ?, modello_embedding = ? WHERE id = ?').run(JSON.stringify(e.v), e.model, id); }
  fts(query, scope, limit) {
    const words = tokens(query).slice(0, 12);
    if (!words.length) return [];
    const match = words.map((w) => `"${w}"*`).join(' OR ');
    const { where, args } = scopeSql(scope);
    return this.db.prepare(`
      SELECT r.id, r.testo, r.progetto, r.tipo, r.tag, r.creato, bm25(ricordi_fts) AS rank
      FROM ricordi_fts JOIN ricordi r ON r.id = ricordi_fts.rowid
      WHERE ricordi_fts MATCH ? ${where}
      ORDER BY rank LIMIT ?`).all(match, ...args, limit);
  }
  withEmbeddings(scope) {
    const { where, args } = scopeSql(scope);
    return this.db.prepare(`SELECT id, testo, progetto, tipo, tag, creato, embedding, modello_embedding FROM ricordi r WHERE embedding IS NOT NULL ${where}`).all(...args);
  }
  list(scope, limit) {
    const { where, args } = scopeSql(scope);
    return this.db.prepare(`SELECT id, testo, progetto, tipo, tag, creato FROM ricordi r WHERE 1=1 ${where} ORDER BY id DESC LIMIT ?`).all(...args, limit);
  }
  get(id) { return this.db.prepare('SELECT id, testo, progetto, tipo, tag, creato FROM ricordi WHERE id = ?').get(id); }
  remove(id) { return this.db.prepare('DELETE FROM ricordi WHERE id = ?').run(id).changes > 0; }
  count() { return this.db.prepare('SELECT COUNT(*) AS n FROM ricordi').get().n; }
}

function scopeSql({ progetto, tipo, soloProgetto }) {
  const parts = []; const args = [];
  if (progetto) {
    if (soloProgetto) { parts.push('r.progetto = ?'); args.push(progetto); }
    else { parts.push("(r.progetto = ? OR r.progetto = 'globale')"); args.push(progetto); }
  }
  if (tipo) { parts.push('r.tipo = ?'); args.push(tipo); }
  return { where: parts.length ? 'AND ' + parts.join(' AND ') : '', args };
}

// ---------------------------------------------------------------- JSON fallback

class JsonStore {
  constructor(file) { this.kind = 'json (senza SQLite)'; this.file = file; }
  load() { return readJson(this.file, { prossimo: 1, ricordi: [] }); }
  save(d) { writeJsonAtomic(this.file, d); }
  inScope(r, { progetto, tipo, soloProgetto }) {
    if (progetto && !(r.progetto === progetto || (!soloProgetto && r.progetto === 'globale'))) return false;
    return !tipo || r.tipo === tipo;
  }
  insert(r) {
    const d = this.load();
    const dup = d.ricordi.find((x) => x.testo === r.testo && x.progetto === r.progetto);
    if (dup) return { id: dup.id, duplicato: true };
    const id = d.prossimo++;
    d.ricordi.push({ id, ...r });
    this.save(d);
    return { id, duplicato: false };
  }
  setEmbedding(id, e) { const d = this.load(); const r = d.ricordi.find((x) => x.id === id); if (r) { r.embedding = JSON.stringify(e.v); r.modello_embedding = e.model; this.save(d); } }
  fts(query, scope, limit) {
    const q = tokens(query);
    if (!q.length) return [];
    return this.load().ricordi.filter((r) => this.inScope(r, scope)).map((r) => {
      const words = tokens(r.testo + ' ' + r.tag);
      const hits = q.filter((w) => words.some((x) => x.startsWith(w))).length;
      return { ...r, rank: -hits };
    }).filter((r) => r.rank < 0).sort((a, b) => a.rank - b.rank || b.id - a.id).slice(0, limit).map(({ embedding, modello_embedding, ...r }) => r);
  }
  withEmbeddings(scope) { return this.load().ricordi.filter((r) => r.embedding && this.inScope(r, scope)); }
  list(scope, limit) { return this.load().ricordi.filter((r) => this.inScope(r, scope)).sort((a, b) => b.id - a.id).slice(0, limit).map(({ embedding, modello_embedding, ...r }) => r); }
  get(id) { const r = this.load().ricordi.find((x) => x.id === id); if (!r) return undefined; const { embedding, modello_embedding, ...rest } = r; return rest; }
  remove(id) { const d = this.load(); const n = d.ricordi.length; d.ricordi = d.ricordi.filter((x) => x.id !== id); this.save(d); return d.ricordi.length < n; }
  count() { return this.load().ricordi.length; }
}

// ---------------------------------------------------------------- public API

let backend = null;
export async function openStore({ dir = dataDir(), forceJson = false } = {}) {
  if (backend && backend.dir === dir && !forceJson) return backend.store;
  let store = null;
  if (!forceJson && process.env.REGIA_MEMORIA !== 'json') {
    try {
      quietExperimental();
      const { DatabaseSync } = await import('node:sqlite');
      store = new SqliteStore(DatabaseSync, join(dir, 'memoria.sqlite'));
    } catch { store = null; }
  }
  if (!store) store = new JsonStore(join(dir, 'memoria.json'));
  backend = { dir, store };
  return store;
}

export function resetStore() { backend = null; }

export async function memoryStore(store, { testo, progetto = 'globale', tag = '', tipo = 'decisione' }, { embeddings = true } = {}) {
  testo = String(testo || '').trim();
  if (!testo) throw new Error('Testo vuoto: niente da salvare.');
  if (testo.length > 4000) throw new Error('Ricordo troppo lungo (max 4000 caratteri): salva la decisione, non il documento.');
  checkSecret(testo); checkSecret(String(tag));
  const r = { testo, progetto: String(progetto || 'globale'), tipo: normTipo(tipo), tag: Array.isArray(tag) ? tag.join(',') : String(tag || ''), creato: now() };
  const out = store.insert(r);
  if (!out.duplicato && embeddings) {
    const e = await embed(testo).catch(() => null);
    if (e) store.setEmbedding(out.id, e);
    out.semantica = Boolean(e);
  }
  return out;
}

export async function memorySearch(store, { query, progetto, tipo, limite = 5, soloProgetto = false }, { embeddings = true } = {}) {
  const scope = { progetto, tipo, soloProgetto };
  const lim = Math.max(1, Math.min(20, Number(limite) || 5));
  const text = store.fts(query, scope, lim * 2);
  let modo = 'testo';
  const scores = new Map();
  text.forEach((r, i) => scores.set(r.id, { r, s: 1 / (i + 1) }));
  if (embeddings) {
    const pool = store.withEmbeddings(scope);
    if (pool.length) {
      const q = await embed(query).catch(() => null);
      if (q) {
        modo = 'testo+semantica';
        for (const r of pool) {
          if (r.modello_embedding !== q.model) continue;
          const sim = cosine(q.v, JSON.parse(r.embedding));
          if (sim < 0.5) continue;
          const { embedding, modello_embedding, ...clean } = r;
          const prev = scores.get(r.id);
          scores.set(r.id, { r: prev?.r || clean, s: (prev?.s || 0) + sim });
        }
      }
    }
  }
  const risultati = [...scores.values()].sort((a, b) => b.s - a.s).slice(0, lim).map(({ r }) => ({ id: r.id, testo: r.testo, progetto: r.progetto, tipo: r.tipo, tag: r.tag, creato: r.creato }));
  return { modo, risultati };
}

export function memoryList(store, { progetto, tipo, limite = 20, soloProgetto = false } = {}) {
  return store.list({ progetto, tipo, soloProgetto }, Math.max(1, Math.min(200, Number(limite) || 20)));
}

export function memoryForget(store, { id }) {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Serve l\'id numerico del ricordo (lo vedi con memory_list).');
  const r = store.get(n);
  if (!r) return { cancellato: false, motivo: `Nessun ricordo con id ${n}` };
  store.remove(n);
  return { cancellato: true, ricordo: r };
}

export function memoryExport(store, { progetto } = {}) {
  const all = store.list({ progetto }, 10000);
  const lines = [`# Memoria REGIA${progetto ? `: ${progetto}` : ''}`, '', `Esportata il ${now().slice(0, 10)}. ${all.length} ricordi.`, ''];
  for (const tipo of TIPI) {
    const items = all.filter((r) => r.tipo === tipo);
    if (!items.length) continue;
    lines.push(`## ${tipo[0].toUpperCase()}${tipo.slice(1)}`, '');
    for (const r of items.reverse()) lines.push(`- [${r.id}] ${r.testo}${r.tag ? ` (tag: ${r.tag})` : ''} · ${r.progetto} · ${r.creato.slice(0, 10)}`);
    lines.push('');
  }
  return lines.join('\n');
}

export const hasSqlite = async () => { try { quietExperimental(); await import('node:sqlite'); return true; } catch { return false; } };
export { existsSync };
