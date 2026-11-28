// Shared helpers for REGIA hooks, MCP servers and bin scripts.
// Zero dependencies, Node 20+ (node:sqlite used only where available).
import { readFileSync, realpathSync, statSync, existsSync, mkdirSync, appendFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
// Installed layout: <root>/hooks/lib/common.mjs -> root = <root>
export const REGIA_ROOT = resolve(HERE, '..', '..');

const DEFAULT_CONFIG = {
  versione: 1,
  maxAgenti: 3,
  dataDir: null,
  ollama: { url: 'http://localhost:11434', timeoutMs: 2000, timeoutGenerazioneMs: 90000, modello: null, modelloEmbedding: null, distribuzione: 'primo' },
  router: { usaOllama: true, maxRicordi: 4, maxCaratteri: 1500, lunghezzaMinima: 12, regoleExtra: [], agentiExtra: [] },
  costi: { sogliaAvvisoToken: 2000000 },
  postEdit: { lint: true, format: false, test: false, timeoutMs: 8000 },
  guard: {
    branchProtetti: ['main', 'master'],
    curlShConsentiti: ['ollama.com', 'sh.rustup.rs', 'get.pnpm.io', 'bun.sh'],
    cartelleTemporanee: ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders'],
    extraAsk: [],
    extraDeny: [],
    // MCP servers whose "send" talks to your own Claude sessions, not to people
    mcpInterni: ['^mcp__claude-code-remote__(send_later|send_message)$'],
    // MCP tools that spend credits or can trigger mail without "send" in the name
    mcpAsk: [
      '^mcp__.*ElevenLabs__(creative_generate|creative_edit|creative_design_voice|creative_run_flow_nodes|creative_transcribe_audio|agents_generate|agents_create|agents_outbound_call|agents_submit_batch_call|agents_run_tests)',
      '^mcp__.*Lovable__(create_project|remix_project|initiate_project|send_message|enable_database)',
      '^mcp__.*Make__(scenarios_run|scenarios_replay|rpc_execute)',
      '^mcp__.*Stripe__(atlas_company_formation|manage_stripe_accounts)',
      '^mcp__.*Vercel__(create_sandboxes|create_storage_stores|create_drain|create_project$)',
      '^mcp__.*Brevo__(sms_campaigns_create|automation_update_workflow_status)',
      '^mcp__.*Microsoft_365__outlook_(set_vacation|respond_to_event)',
    ],
  },
  // How l’utente wants to work: one line at every session start
  preferenze: [
    'Fai tutto da solo: esegui, verifica e correggi senza chiedere all’utente passaggi manuali.',
    'Chiedi solo quando il guard lo richiede (mail, pagamenti, push su main) o se sei davvero bloccato, e allora proponi la soluzione già pronta.',
    'Risposte schematiche (tabelle, checklist), in italiano, senza emoji né trattini lunghi.',
  ],
  progetti: {},
};

function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' ? deepMerge(base[k], v) : v;
  }
  return out;
}

let cachedConfig = null;
export function loadConfig() {
  if (cachedConfig) return cachedConfig;
  const candidates = [process.env.REGIA_CONFIG, join(REGIA_ROOT, 'config.json'), join(REGIA_ROOT, 'config', 'regia.json')].filter(Boolean);
  let user = {};
  for (const p of candidates) {
    if (existsSync(p)) {
      try { user = JSON.parse(readFileSync(p, 'utf8')); break; } catch { /* broken config: defaults */ }
    }
  }
  cachedConfig = deepMerge(DEFAULT_CONFIG, user);
  if (process.env.REGIA_OLLAMA_URL) cachedConfig.ollama.url = process.env.REGIA_OLLAMA_URL;
  return cachedConfig;
}
export function resetConfigCache() { cachedConfig = null; }

export function dataDir() {
  const cfg = loadConfig();
  const dir = process.env.REGIA_DATA_DIR || cfg.dataDir || join(homedir(), '.regia', 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function readStdin(timeoutMs = 3000) {
  return new Promise((res) => {
    if (process.stdin.isTTY) return res('');
    let data = '';
    const timer = setTimeout(() => { process.stdin.pause(); res(data); }, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => { clearTimeout(timer); res(data); });
    process.stdin.on('error', () => { clearTimeout(timer); res(data); });
  });
}

export function appendJsonl(name, obj) {
  try {
    appendFileSync(join(dataDir(), name), JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
  } catch { /* logging must never break a hook */ }
}

export function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

export function writeJsonAtomic(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, path);
}

// Project identity: git remote name, else folder name.
export function projectName(cwd = process.cwd()) {
  const cfg = loadConfig();
  for (const [name, p] of Object.entries(cfg.progetti || {})) {
    if (p.percorso && resolve(cwd).startsWith(resolve(p.percorso.replace(/^~/, homedir())))) return name;
  }
  try {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).toString().trim();
    const m = url.match(/[/:]([^/:]+?)(?:\.git)?$/);
    if (m) {
      const slug = url.toLowerCase().replace(/\.git$/, '').replace(/^.*[:/]([^/:]+\/[^/:]+)$/, '$1');
      for (const [name, p] of Object.entries(cfg.progetti || {})) {
        const r = typeof p?.repo === 'string' ? p.repo.toLowerCase() : '';
        if (r && (slug === r || slug.endsWith('/' + r))) return name;
      }
      return m[1];
    }
  } catch { /* not a git repo */ }
  return basename(resolve(cwd));
}

// Secret patterns. Kept here so guard, post-edit and memory share one list.
// [label, regex, level]: level "ask" = keys that are often public (browser keys), confirm instead of block.
export const SECRET_PATTERNS = [
  ['chiave privata', /-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----/],
  ['chiave Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['chiave OpenAI o simile (sk-)', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['chiave Stripe', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['segreto webhook Stripe', /\bwhsec_[A-Za-z0-9]{20,}/],
  ['chiave segreta Supabase', /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ['chiave ElevenLabs (sk_)', /\bsk_[a-f0-9]{40,}\b/],
  ['token GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['token GitLab', /\bglpat-[A-Za-z0-9_-]{20,}/],
  ['chiave AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['chiave Google', /\bAIza[0-9A-Za-z_-]{35}\b/, 'ask'],
  ['token Slack', /\bxox[abeprs]-[A-Za-z0-9-]{10,}/],
  ['token npm', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['chiave Resend', /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}/],
  ['chiave SendGrid', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ['chiave Brevo', /\bxkeysib-[a-f0-9]{32,}-[A-Za-z0-9]{8,}/],
  ['token Hugging Face', /\bhf_[A-Za-z0-9]{30,}\b/],
  ['indirizzo con password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@$'"]+:[^\s/:@$'"{}]{8,}@[^\s'"]+/i],
  ['token Bearer', /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
];

// A Supabase anon/publishable JWT is meant for the browser (Lovable puts it in client.ts): not a secret.
function publicJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload.role === 'anon' || payload.role === 'publishable';
  } catch { return false; }
}

// Returns the first secret found: { label, sample, level } (level "deny" or "ask"), or null.
export function findSecret(text) {
  if (!text || typeof text !== 'string') return null;
  // string literals split with + ("sk-ant-" + "AAAA...") are joined before the scan
  const joined = text.replace(/(["'`])\s*\+\s*(["'`])/g, '');
  let found = null;
  for (const t of joined === text ? [text] : [text, joined]) {
    for (const [label, re, level] of SECRET_PATTERNS) {
      const matches = re.global ? [...t.matchAll(re)].map((m) => m[0]) : [t.match(re)?.[0]].filter(Boolean);
      const real = label === 'JWT' ? matches.filter((m) => !publicJwt(m)) : matches;
      if (!real.length) continue;
      const hit = { label, sample: real[0].slice(0, 6) + '…', level: level || 'deny' };
      if (hit.level === 'deny') return hit;
      found = found || hit;
    }
  }
  return found;
}

export function redact(text) {
  let out = String(text ?? '');
  for (const [, re] of SECRET_PATTERNS) out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), '[SEGRETO RIMOSSO]');
  return out;
}

// Ollama: one place for reachability and model detection. Never throws.
// ollama.url (or REGIA_OLLAMA_URL) may list several hosts, e.g. the Macs of a cluster:
// "http://host-a.local:11434, http://host-b.local:11434". They are probed in parallel.
export function ollamaUrls(cfg = loadConfig()) {
  const raw = cfg.ollama.url;
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return list.map((u) => String(u).trim().replace(/\/$/, '')).filter(Boolean);
}

export async function ollamaFetch(path, body, timeoutMs, host) {
  const cfg = loadConfig();
  const base = (host || ollamaUrls(cfg)[0] || 'http://localhost:11434').replace(/\/$/, '');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs ?? cfg.ollama.timeoutMs);
  try {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) };
  } finally {
    clearTimeout(t);
  }
}

// Every host at the same time, so N hosts cost the time of one.
export async function ollamaHosts(timeoutMs) {
  const urls = ollamaUrls();
  return Promise.all(urls.map(async (url) => {
    const r = await ollamaFetch('/api/tags', null, timeoutMs, url);
    if (!r.ok) return { url, ok: false, models: [], error: r.error };
    const list = r.data.models || [];
    // Size as Ollama states it ("7.6B", "494M"): better than the name, which may just say "latest".
    const sizes = {};
    for (const m of list) {
      const ps = String(m.details?.parameter_size || '').match(/^([\d.]+)\s*([BMK])/i);
      if (ps) sizes[m.name] = Number(ps[1]) / ({ B: 1, M: 1e3, K: 1e6 }[ps[2].toUpperCase()]);
    }
    return { url, ok: true, models: list.map((m) => m.name), sizes };
  }));
}

// Back-compatible view: the first host that answers.
export async function ollamaModels(timeoutMs) {
  const hosts = await ollamaHosts(timeoutMs);
  const up = hosts.find((h) => h.ok);
  if (!up) return { ok: false, error: hosts.map((h) => `${h.url}: ${h.error}`).join('; '), models: [], hosts };
  return { ok: true, models: up.models, host: up.url, hosts };
}

let turn = 0;
// Host and model for a task. Order of the config wins; the preferred model wins over order;
// with ollama.distribuzione = "giro" the hosts that have the same model take turns.
export async function ollamaPick(kind = 'chat', timeoutMs, preferred) {
  const cfg = loadConfig();
  const hosts = await ollamaHosts(timeoutMs ?? cfg.ollama.timeoutMs);
  const want = preferred || (kind === 'embed' ? cfg.ollama.modelloEmbedding : cfg.ollama.modello);
  const cands = hosts.filter((h) => h.ok).map((h) => ({ ...h, model: pickModel(h.models, want, kind, h.sizes) })).filter((h) => h.model);
  if (!cands.length) {
    const anyUp = hosts.some((h) => h.ok);
    return { ok: false, hosts, error: anyUp ? `nessun modello ${kind === 'embed' ? 'di embedding' : 'di chat'} installato` : hosts.map((h) => `${h.url}: ${h.error}`).join('; ') };
  }
  // The configured model wins; otherwise, for chat, the best model for delegation on any host
  // (stable sort: with the same model the first host in order wins).
  let best = cands.find((h) => want && h.model === want)
    || (kind === 'chat' ? [...cands].sort((a, b) => compareRank(chatRank(a.model, a.sizes?.[a.model]), chatRank(b.model, b.sizes?.[b.model])))[0] : cands[0]);
  if (cfg.ollama.distribuzione === 'giro') {
    const same = cands.filter((h) => h.model === best.model);
    best = same[turn++ % same.length];
  }
  return { ok: true, host: best.url, model: best.model, models: best.models, hosts };
}

// Billions of parameters from the model name (":9b", ":27b-q4_K_M"). For a mixture of experts
// ("qwen3:30b-a3b") the total, because that is what has to be loaded. null if the name does not say.
export function modelSizeB(name) {
  const m = String(name || '').toLowerCase().match(/[:_-](\d+(?:\.\d+)?)b(?![a-z0-9])/);
  return m ? Number(m[1]) : null;
}

// Models that do not chat: embeddings and rerankers.
const NOT_CHAT_RE = /embed|bge|minilm|e5|paraphrase|rerank|nomic|mxbai|arctic/i;
const EMBED_RE = /embed|bge|minilm|e5|paraphrase|nomic|mxbai|arctic/i;

// Delegation wants answers in seconds: first a model from 4 to 14B (the largest; unknown size
// counts here, after the known ones), then the smaller ones, then the bigger ones from the
// smallest (a 27B can take over 90 s just to load). Qwen first within the first two bands;
// among the big ones size comes before the family, because loading time is what hurts.
const FAST_MIN_B = 4;
const FAST_MAX_B = 14;
export function chatRank(name, sizeB) {
  const size = Number.isFinite(sizeB) ? sizeB : modelSizeB(name);
  const band = size == null ? 0 : size < FAST_MIN_B ? 1 : size <= FAST_MAX_B ? 0 : 2;
  const family = /qwen/i.test(String(name || '')) ? 0 : 1;
  if (band === 2) return [2, size, family];
  return [band, family, size == null ? 0 : -size];
}
function compareRank(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function pickModel(models, preferred, kind = 'chat', sizes = {}) {
  if (preferred && models.includes(preferred)) return preferred;
  if (kind === 'embed') return models.find((m) => EMBED_RE.test(m) && !/rerank/i.test(m)) || null;
  const chat = models.filter((m) => !NOT_CHAT_RE.test(m));
  return [...chat].sort((a, b) => compareRank(chatRank(a, sizes?.[a]), chatRank(b, sizes?.[b])))[0] || null;
}

// realpath on both sides: on macOS /var and /tmp are links to /private/..., and a plain
// comparison made the script do nothing (exit 0), so the guard let everything through.
function realOrSame(p) { try { return realpathSync(p); } catch { return resolve(p); } }
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && realOrSame(process.argv[1]) === realOrSame(fileURLToPath(metaUrl));
}

// For the scripts that must never go silent (guard, controlla, post-edit): a silent exit 0 means
// "allow". If the path comparison fails (links, letter case on macOS, hard links), the file
// itself still decides: same device and inode. A script of someone else with the same name
// that only imports the module is another file, so main() does not run twice.
function sameFile(a, b) {
  try { const x = statSync(a); const y = statSync(b); return x.dev === y.dev && x.ino === y.ino; } catch { return false; }
}
export function isEntry(metaUrl) {
  if (isMain(metaUrl)) return true;
  return Boolean(process.argv[1]) && sameFile(process.argv[1], fileURLToPath(metaUrl));
}

export function emit(obj) {
  if (obj) process.stdout.write(JSON.stringify(obj));
}

// Rule 1: Claude Code must run on the subscription, not on paid API credit. Only names, never values.
export function billingRisks(home = homedir(), env = process.env) {
  const out = [];
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) if (env[k]) out.push(`la variabile ${k} è impostata: Claude Code userebbe credito API a pagamento invece dell'abbonamento. Toglila dal profilo della shell (es. ~/.zshrc).`);
  for (const k of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) if (env[k] && env[k] !== '0') out.push(`${k} è attiva: i consumi vanno su un cloud a pagamento.`);
  for (const f of [join(home, '.claude', 'settings.json')]) {
    try { if (JSON.parse(readFileSync(f, 'utf8')).apiKeyHelper) out.push(`${f} ha apiKeyHelper: Claude Code usa una chiave API a pagamento.`); } catch { /* none */ }
  }
  return out;
}

