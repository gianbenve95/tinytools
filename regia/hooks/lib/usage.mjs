// Token usage from Claude Code transcripts (JSONL). Real numbers when `usage` is present,
// otherwise an estimate from characters (4 chars ~ 1 token), flagged as such.
// Incremental: only the bytes added since the last read are parsed.
import { openSync, readSync, closeSync, statSync, existsSync } from 'node:fs';

// netto = input + output + cache written: the part that weighs on limits. Cache reads are shown apart.
export const EMPTY = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, netto: 0, totale: 0, messaggi: 0, stimati: 0 };

function addUsage(sum, u) {
  sum.input += u.input_tokens || 0;
  sum.output += u.output_tokens || 0;
  sum.cacheRead += u.cache_read_input_tokens || 0;
  sum.cacheWrite += u.cache_creation_input_tokens || 0;
  sum.netto = sum.input + sum.output + sum.cacheWrite;
  sum.totale = sum.netto + sum.cacheRead;
  sum.messaggi += 1;
}

function estimate(sum, msg) {
  const tok = Math.ceil((msg?.chars || 0) / 4);
  sum.output += tok;
  sum.netto += tok;
  sum.totale += tok;
  sum.messaggi += 1;
  sum.stimati += 1;
}

// state: { offset, sum, pendingId, pendingMsg }  (pending = last assistant message, may still grow)
export function readUsage(path, state = null) {
  const st = state ? structuredClone(state) : { offset: 0, sum: { ...EMPTY }, pendingId: null, pendingMsg: null };
  if (!path || !existsSync(path)) return st;
  const size = statSync(path).size;
  if (size < st.offset) return readUsage(path, null); // file rewritten: start over
  if (size === st.offset) return st;
  const fd = openSync(path, 'r');
  try {
    const CHUNK = 4 * 1024 * 1024;
    let pos = st.offset;
    let left = Buffer.alloc(0);
    while (pos < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - pos));
      const n = readSync(fd, buf, 0, buf.length, pos);
      if (!n) break;
      pos += n;
      const all = left.length ? Buffer.concat([left, buf.subarray(0, n)]) : buf.subarray(0, n);
      const nl = all.lastIndexOf(0x0a);
      if (nl === -1) { left = all; continue; }
      // decode only whole lines: a newline is never inside a multi-byte character
      for (const line of all.toString('utf8', 0, nl).split('\n')) consume(st, line);
      left = all.subarray(nl + 1);
    }
    st.offset = pos - left.length; // the incomplete last line is read again next time
  } finally { closeSync(fd); }
  return st;
}

function consume(st, line) {
  if (!line || line.indexOf('"assistant"') === -1) return;
  let o; try { o = JSON.parse(line); } catch { return; }
  if (o.type !== 'assistant' || !o.message) return;
  const id = o.message.id || o.uuid;
  // keep only what is needed: usage, or the size for an estimate
  const slim = { usage: o.message.usage || null, chars: JSON.stringify(o.message.content ?? '').length };
  if (id === st.pendingId) { // same message split in several lines
    st.pendingMsg = { usage: slim.usage || st.pendingMsg?.usage || null, chars: (st.pendingMsg?.chars || 0) + slim.chars };
    return;
  }
  commit(st);
  st.pendingId = id;
  st.pendingMsg = slim;
}

function commit(st) {
  if (!st.pendingMsg) return;
  if (st.pendingMsg.usage) addUsage(st.sum, st.pendingMsg.usage); else estimate(st.sum, st.pendingMsg);
  st.pendingMsg = null;
}

// Totals including the pending message, without mutating the state.
export function totals(st) {
  const copy = structuredClone(st);
  commit(copy);
  return copy.sum;
}

// Claude Code may flush the last transcript line just after a hook starts:
// wait until the file stops growing (quietMs), at most maxMs. Sync sleep, no busy loop.
export function waitStable(path, { maxMs = 1200, quietMs = 250 } = {}) {
  if (!path || !existsSync(path)) return;
  const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const start = Date.now();
  let size = statSync(path).size;
  let still = 0;
  while (Date.now() - start < maxMs) {
    sleep(50);
    const now = statSync(path).size;
    if (now === size) { still += 50; if (still >= quietMs) return; } else { size = now; still = 0; }
  }
}

export function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}
