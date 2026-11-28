#!/usr/bin/env node
// REGIA guard: PreToolUse hook. Enforces the absolute rules (no mail, no payments,
// no secrets, no destructive commands) before a tool runs.
// allow  -> prints nothing: the user's normal permission flow stays in charge.
// ask    -> JSON permissionDecision "ask": the user gives explicit consent.
// deny   -> JSON permissionDecision "deny": the call does not run.
// Limits: it reads the command, not what a script does inside (`node send.js` is not inspected).
// On internal error or when the analysis takes too long: deny.
import { resolve, isAbsolute, join, basename, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadConfig, readStdin, appendJsonl, findSecret, redact, emit, isEntry } from './lib/common.mjs';

const HOME = homedir();
// System trees: nothing inside may be deleted (temp folders and HOME excepted).
const SYSTEM_TREES = ['/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/boot', '/dev', '/proc', '/sys', '/System', '/Library', '/Applications', '/opt', '/var', '/private', '/cores', '/snap', '/srv', '/nix'];
// Containers of user folders and volumes: the folder itself and its direct children may not be deleted.
const SYSTEM_ROOTS = ['/home', '/Users', '/root', '/Volumes', '/mnt', '/media'];
const SECRET_FILE_RE = /(^|\/)(\.env(\.[\w.-]+)?|\.envrc|\.dev\.vars|[\w.-]*\.pem|[\w.-]*\.key|id_rsa|id_ed25519|id_ecdsa|id_dsa|\.npmrc|\.netrc|\.pypirc|\.git-credentials|credentials(\.json)?|\.credentials\.json|service[-_]account[\w.-]*\.json|secrets?\.(json|ya?ml|toml)|gh\/hosts\.yml|\.docker\/config\.json|\.kube\/config|environ)$/i;
const SAFE_SUFFIX_RE = /\.(example|sample|template|dist|pub)$/i;
const ENV_FILE_RE = /(^|\/)(\.env(\.[\w.-]+)?|\.envrc|\.dev\.vars)$/;
const READERS = new Set(['cat', 'tac', 'less', 'more', 'head', 'tail', 'bat', 'nl', 'strings', 'xxd', 'od', 'hexdump', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'gawk', 'sed', 'cut', 'sort', 'uniq', 'base64', 'jq', 'yq', 'open', 'code', 'pbcopy', 'xclip', 'diff', 'cmp', 'comm', 'paste', 'column', 'fold', 'fmt', 'pr', 'tee', 'wc', 'md5sum', 'shasum', 'sha256sum']);
const PRINTS_CONTENT = new Set([...READERS].filter((c) => !['wc', 'md5sum', 'shasum', 'sha256sum'].includes(c)));
const NET_TOOLS = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'ssh', 'scp', 'sftp', 'rsync', 'telnet', 'socat', 'http', 'https', 'xh', 'ftp', 'aria2c']);
const DOWNLOADERS = new Set(['curl', 'wget', 'http', 'https', 'xh', 'aria2c']);
const RM_LIKE = new Set(['rm', 'rmdir', 'unlink', 'shred', 'srm', 'trash', 'rimraf', 'del', 'del-cli']);
const MAIL_CMDS = new Set(['sendmail', 'mail', 'mailx', 'mutt', 'neomutt', 'msmtp', 'ssmtp', 'swaks', 's-nail', 'mailsend']);
const MAIL_URL_RE = /(smtps?:\/\/|--mail-(rcpt|from)\b|graph\.microsoft\.com\/[^\s'"]*\/(sendmail|send|forward|reply|replyall|createforward|createreply)\b|googleapis\.com\/gmail\/[^\s'"]*\/(messages|drafts)\/send|api\.resend\.com\/emails|api\.sendgrid\.com\/v3\/mail\/send|api\.brevo\.com\/v3\/(smtp\/email|emailcampaigns\/\d+\/send|transactionalsms)|api\.sendinblue\.com|api(\.eu)?\.mailgun\.net\/[^\s'"]*messages|api\.mailjet\.com\/v3(\.1)?\/send|api\.postmarkapp\.com\/email|email[\w.-]*\.amazonaws\.com|smtplib|nodemailer|send-mailmessage|tell\s+app(lication)?\s+"?mail"?)/i;
const READ_PREFIX = /^(get|list|search|read|describe|query|fetch|check|count|aggregate|show|find|view|preview|export|download|lookup|validate|explain)(_|$)/i;
// $PWD, $OLDPWD, $SSH_AUTH_SOCK, $TOKENIZERS_PARALLELISM are not secrets.
const SECRET_VAR_RE = /^(?!(OLD)?PWD$)(?!.*(PUBLIC|ANON|PUBLISHABLE|_URL$|_ID$|_HOST$|_PORT$|_PATH$|_DIR$|_SOCK$|_FILE$|_MODE$|_TYPE$|_COUNT$|_LENGTH$|TOKENIZERS|MAX_TOKENS))(?=.*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|PRIVATE|AUTH))[A-Z0-9_]+$/;
// Programs that read a secret from stdin on purpose: `echo "$T" | docker login --password-stdin`.
const SECRET_CONSUMER_RE = /(--password-stdin|--with-token|\bgh\s+secret\s+set\b|\bvercel\s+env\s+add\b|\bwrangler\s+secret\s+put\b|\bsupabase\s+secrets\s+set\b|\bfly(ctl)?\s+secrets\s+(set|import)\b)/;
const PAID_API_HOSTS = /(api\.elevenlabs\.io|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.replicate\.com|api\.mistral\.ai|api\.groq\.com|api\.together\.xyz)/i;
const isShell = (c) => /^(sh|bash|zsh|dash|ksh|fish)$/.test(c);
const isPython = (c) => /^python[\d.]*$/.test(c);
const isInterp = (c) => isShell(c) || isPython(c) || /^(node|bun|deno|tsx|ts-node|perl|ruby|php|pwsh|powershell|osascript)$/.test(c);

// ---------------------------------------------------------------- shell parsing

function readParen(s, start) {
  let depth = 1; let q = '';
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = ''; else if (c === '\\') i++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '(') depth++;
    if (c === ')') { depth--; if (depth === 0) return [s.slice(start, i), i]; }
  }
  return [s.slice(start), s.length - 1];
}

// Split a command line into pipelines of commands, outside quotes. Command substitutions
// ($(...), `...`, <(...)) are returned for recursive checks; heredoc bodies are data of their command.
// $(( 1 + $(wc -l < f) )): the arithmetic is not a command, the $( ) inside it are.
function pushSub(list, inner) {
  if (!inner.startsWith('(')) { list.push(inner); return; }
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '$' && inner[i + 1] === '(') { const [sub, end] = readParen(inner, i + 2); pushSub(list, sub); i = end; }
  }
}

export function splitShell(cmd) {
  const pipelines = [[]];
  const substitutions = [];
  const heredocs = [];
  let pending = [];
  let cur = '';
  let q = '';
  const cut = (newPipeline) => { pipelines[pipelines.length - 1].push(cur); cur = ''; if (newPipeline) pipelines.push([]); };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { cur += c; if (c === "'") q = ''; continue; }
    if (c === '\\' && cmd[i + 1] === '\n') { i++; continue; } // line continuation
    if (c === '\\' && i + 1 < cmd.length) { cur += c + cmd[i + 1]; i++; continue; }
    if (q === '"') {
      if (c === '"') { q = ''; cur += c; continue; }
      if (c === '$' && cmd[i + 1] === '(') { const [inner, end] = readParen(cmd, i + 2); pushSub(substitutions, inner); cur += cmd.slice(i, end + 1); i = end; continue; }
      if (c === '`') { const end = cmd.indexOf('`', i + 1); const stop = end === -1 ? cmd.length : end; substitutions.push(cmd.slice(i + 1, stop)); cur += cmd.slice(i, stop + 1); i = stop; continue; }
      cur += c; continue;
    }
    if (c === '$' && cmd[i + 1] === "'") { cur += "$'"; q = "'"; i++; continue; } // ANSI-C quoting
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if ((c === '$' || c === '<' || c === '>') && cmd[i + 1] === '(') {
      const [inner, end] = readParen(cmd, i + 2); pushSub(substitutions, inner); cur += cmd.slice(i, end + 1); i = end; continue;
    }
    if (c === '`') { const end = cmd.indexOf('`', i + 1); const stop = end === -1 ? cmd.length : end; substitutions.push(cmd.slice(i + 1, stop)); cur += cmd.slice(i, stop + 1); i = stop; continue; }
    if (c === '<' && cmd[i + 1] === '<' && cmd[i + 2] !== '<') {
      const m = cmd.slice(i).match(/^<<([-~]?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z0-9_.-]+))/);
      if (m) { pending.push({ delim: m[2] ?? m[3] ?? m[4], strip: m[1] === '-' }); cur += m[0]; i += m[0].length - 1; continue; }
    }
    if (c === '\n' && pending.length) {
      let pos = i + 1;
      for (const h of pending) {
        const body = [];
        while (pos <= cmd.length) {
          const nl = cmd.indexOf('\n', pos);
          const line = cmd.slice(pos, nl === -1 ? cmd.length : nl);
          pos = nl === -1 ? cmd.length + 1 : nl + 1;
          if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) break;
          body.push(line);
        }
        heredocs.push({ cmd: cur.trim(), body: body.join('\n') });
      }
      pending = [];
      i = Math.min(pos, cmd.length) - 1;
      cut(true); continue;
    }
    if (c === '(' || c === ')') { cut(true); continue; } // subshell: ( rm -rf ~ )
    if (c === '|' && cmd[i + 1] !== '|') { cut(false); if (cmd[i + 1] === '&') i++; continue; }
    if (c === ';' || c === '\n' || (c === '&' && cmd[i + 1] !== '>' && cmd[i - 1] !== '>') || (c === '|' && cmd[i + 1] === '|')) {
      if (c === '&' && cmd[i + 1] === '&') i++;
      if (c === '|') i++;
      cut(true); continue;
    }
    cur += c;
  }
  pipelines[pipelines.length - 1].push(cur);
  return { pipelines: pipelines.map((p) => p.map((s) => s.trim()).filter(Boolean)).filter((p) => p.length), substitutions, heredocs };
}

// Words of one simple command, quotes removed. $( ) and backticks stay inside their word.
// Output redirects, input redirects and here-strings are collected apart.
export function words(command) {
  const out = []; const redirects = []; const inputs = []; const herestrings = [];
  let w = ''; let q = ''; let has = false; let pending = null;
  const push = () => {
    if (!has) return;
    if (pending === 'out') redirects.push(w);
    else if (pending === 'in') inputs.push(w);
    else if (pending === 'here') herestrings.push(w);
    else if (pending === 'doc') { /* heredoc delimiter */ }
    else if (/^\d*<<<$/.test(w)) { pending = 'here'; w = ''; has = false; return; }
    else if (/^\d*<<<./.test(w)) herestrings.push(w.replace(/^\d*<<</, ''));
    else if (/^\d*<<[-~]?$/.test(w)) { pending = 'doc'; w = ''; has = false; return; }
    else if (/^\d*<<[-~]?./.test(w)) { /* heredoc marker */ }
    else if (/^\d*<$/.test(w)) { pending = 'in'; w = ''; has = false; return; }
    else if (/^\d*<(?!\()./.test(w)) inputs.push(w.replace(/^\d*</, ''));
    else if (/^\d*(>>?|&>|>\|)$/.test(w)) { pending = 'out'; w = ''; has = false; return; }
    else if (/^\d*(>>?|&>)./.test(w)) redirects.push(w.replace(/^\d*(>>?|&>)/, ''));
    else out.push(w);
    pending = null; w = ''; has = false;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (q === "'") { if (c === "'") q = ''; else w += c; continue; }
    if (q === '"') {
      if (c === '"') q = '';
      else if (c === '\\' && /["\\$`]/.test(command[i + 1] || '')) w += command[++i];
      else if (c === '$' && command[i + 1] === '(') { const [, end] = readParen(command, i + 2); w += command.slice(i, end + 1); i = end; }
      else w += c;
      continue;
    }
    if (c === '\\' && command[i + 1] === '\n') { i++; continue; }
    if (c === '$' && command[i + 1] === "'") { q = "'"; has = true; i++; continue; }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === '\\' && i + 1 < command.length) { w += command[++i]; has = true; continue; }
    if ((c === '$' || c === '<' || c === '>') && command[i + 1] === '(') { const [, end] = readParen(command, i + 2); w += command.slice(i, end + 1); i = end; has = true; continue; }
    if (c === '`') { const end = command.indexOf('`', i + 1); const stop = end === -1 ? command.length : end; w += command.slice(i, stop + 1); i = stop; has = true; continue; }
    if (/\s/.test(c)) { push(); continue; }
    w += c; has = true;
  }
  push();
  return { argv: out, redirects, inputs, herestrings };
}

const KEYWORDS = new Set(['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'done', 'fi']);
// options of wrappers that take a value: `sudo -u root rm`, `nice -n 10 rm`
const WRAPPER_OPTS = {
  sudo: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T'], doas: ['-u', '-C'],
  nice: ['-n'], ionice: ['-c', '-n', '-p', '-t'], stdbuf: ['-i', '-o', '-e'], timeout: ['-s', '-k', '--signal', '--kill-after'],
  env: ['-u', '-C', '-S', '--unset', '--chdir'], watch: ['-n', '-d', '--interval'], xargs: ['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a'],
  command: [], builtin: [], exec: ['-a'], nohup: [], time: ['-f', '-o'], caffeinate: ['-t', '-w'], arch: [],
};
function skipOpts(a, valueOpts = []) {
  while (a[0]?.startsWith('-') && a[0] !== '-') {
    const o = a.shift();
    if (valueOpts.includes(o)) a.shift();
  }
}

// Drop env assignments, wrappers and launchers; return the real argv and what was stripped.
export function normalize(argv) {
  let a = [...argv]; let sudo = false; let viaXargs = false; let envPrefix = [];
  for (let guard = 0; guard < 12 && a.length; guard++) {
    if (KEYWORDS.has(a[0])) { a.shift(); continue; }
    const head = basename(a[0]);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) { envPrefix.push(a.shift()); continue; }
    if (head === 'sudo' || head === 'doas') { sudo = true; a.shift(); skipOpts(a, WRAPPER_OPTS[head]); continue; }
    if (head === 'env') {
      const rest = a.slice(1);
      const tail = [...rest]; skipOpts(tail, WRAPPER_OPTS.env);
      while (tail[0]?.includes('=')) tail.shift();
      if (!tail.length) return { argv: ['env'], sudo, viaXargs, envPrefix, path0: 'env' }; // bare env prints the environment
      a = tail; continue;
    }
    if (head === 'timeout') { a.shift(); skipOpts(a, WRAPPER_OPTS.timeout); a.shift(); continue; }
    if (head === 'xargs') { viaXargs = true; a.shift(); skipOpts(a, WRAPPER_OPTS.xargs); continue; }
    if (head === 'busybox') { a.shift(); continue; }
    if (head === 'arch' && a[1]?.startsWith('-')) { a.shift(); skipOpts(a); continue; }
    if (Object.hasOwn(WRAPPER_OPTS, head)) { a.shift(); skipOpts(a, WRAPPER_OPTS[head]); continue; }
    if (head === 'npx' || head === 'bunx') { a.shift(); skipOpts(a, ['-p', '--package']); continue; }
    if ((head === 'pnpm' || head === 'yarn') && a[1] === 'dlx') { a = a.slice(2); continue; }
    if (head === 'uv' && a[1] === 'run') { a = a.slice(2); skipOpts(a, ['--with', '--python']); continue; }
    if (isPython(head) && a[1] === '-m' && /^pip\d?$/.test(a[2] || '')) { a = ['pip', ...a.slice(3)]; break; }
    break;
  }
  const path0 = a[0] || '';
  if (a.length) a[0] = basename(a[0]);
  return { argv: a, sudo, viaXargs, envPrefix, path0 };
}

// $NAME and ${NAME} with values assigned earlier in the same command line, plus HOME, TMPDIR, PWD.
// A loop variable (for x in a b) has several values: those stay unexpanded here.
function knownEnv(name, ctx) {
  if (name === 'HOME') return HOME;
  if (name === 'TMPDIR') return process.env.TMPDIR || tmpdir();
  if (name === 'PWD') return ctx?.cwdUnknown ? null : ctx?.cwd;
  return null;
}
function expandVars(p, vars, ctx) {
  if (!p.includes('$')) return p;
  return p.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[?=+\-%#][^}]*)?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, n1, mod, n2) => {
    const n = n1 || n2;
    if (mod && /^:?\+/.test(mod)) return m; // ${V:+x} never prints V
    const v = vars?.get(n);
    if (v !== undefined && !Array.isArray(v)) return v;
    const k = knownEnv(n, ctx);
    return k ?? m;
  });
}

// Every value a path can take: loop variables and simple braces {a,b} (at most 20).
function expandAll(p, vars, ctx) {
  let out = [expandVars(p, vars, ctx)];
  for (const [n, v] of vars || []) {
    if (!Array.isArray(v)) continue;
    const re = new RegExp(`\\$\\{?${n}\\}?(?![A-Za-z0-9_])`, 'g');
    if (!out.some((x) => x.match(re))) continue;
    out = out.flatMap((x) => v.map((val) => x.replace(re, val))).slice(0, 20);
  }
  out = out.flatMap((x) => {
    const m = x.match(/^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/);
    return m ? m[2].split(',').map((part) => m[1] + part + m[3]) : [x];
  }).slice(0, 20);
  return out;
}

// Assignments only (A=1 B=$(mktemp -d)), tokenized with words(): no regex backtracking.
function trackAssignments(raw, vars, ctx) {
  const { argv } = words(raw);
  const list = argv[0] === 'export' ? argv.slice(1) : argv;
  if (!list.length || !list.every((w) => /^[A-Za-z_]\w*=/.test(w))) return false;
  for (const w of list) {
    const eq = w.indexOf('=');
    const name = w.slice(0, eq);
    let v = w.slice(eq + 1);
    if (/^\$\(\s*mktemp\b/.test(v)) v = join(tmpdir(), 'regia-mktemp');
    else v = expandVars(v, vars, ctx);
    if (/\$\(|`/.test(v) || (v.includes('$') && !/^\$\{?HOME\b/.test(v))) vars.delete(name); else vars.set(name, v);
  }
  return true;
}

function expandHome(p, cwd) {
  let s = p.replace(/^~(?=\/|$)/, HOME).replace(/^\$\{?HOME\}?(?=\/|$)/, HOME);
  const user = s.match(/^~([A-Za-z0-9._-]+)(?=\/|$)/);
  if (user) s = s.replace(/^~[A-Za-z0-9._-]+/, user[1] === basename(HOME) ? HOME : user[1] === 'root' ? '/root' : join(dirname(HOME), user[1]));
  if (!isAbsolute(s)) s = resolve(cwd, s);
  return resolve(s);
}

// ---------------------------------------------------------------- decisions

const ALLOW = { decision: 'allow' };
const ask = (rule, reason) => ({ decision: 'ask', rule, reason });
const deny = (rule, reason) => ({ decision: 'deny', rule, reason });
const RANK = { allow: 0, ask: 1, deny: 2 };
const worst = (list) => list.reduce((a, b) => (RANK[b.decision] > RANK[a.decision] ? b : a), ALLOW);

function currentBranch(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).toString().trim();
  } catch { return null; }
}

// Compile user regexes once; a broken one is skipped, never fatal.
const regexCache = new Map();
function safeRegex(src) {
  if (!regexCache.has(src)) { try { regexCache.set(src, new RegExp(src, 'i')); } catch { regexCache.set(src, null); } }
  return regexCache.get(src);
}

function tick(ctx) {
  if (Date.now() > ctx.deadline) throw new Error('analisi troppo lunga');
}

function isSecretPath(arg, ctx) {
  let a = String(arg || '');
  a = a.replace(/^--?[\w-]+=/, '').replace(/^[\w.-]+=(?=[@<])/, '').replace(/^[@<]/, '').replace(/;type=.*$/, '');
  if (!a || a.startsWith('-')) return false;
  if (ctx.secretFiles?.has(resolve(ctx.cwd, a))) return true;
  const test = (x) => SECRET_FILE_RE.test(x) && !SAFE_SUFFIX_RE.test(x) && !/(^|\/)\.env\.(example|sample|template)(\.|$)/i.test(x);
  if (test(a)) return true;
  if (/[*?[]/.test(a)) return test(a.replace(/[*?[].*$/, '')); // cat .env*
  return /^\/proc\/[\w]+\/environ$/.test(a);
}

function rmTargetCheck(t, ctx, { recursive, contents = false } = {}) {
  if (/\$\(|`/.test(t) || /\$\{?[A-Za-z_]/.test(t)) {
    return recursive ? ask('cancella-variabile', `Cancellazione su un percorso che dipende da una variabile o da un comando (${t}): se è vuoto cancella altro. Confermi?`) : ALLOW;
  }
  if (!isAbsolute(t) && !/^~/.test(t) && ctx.cwdUnknown) return ask('cancella-cartella-incerta', `Cancellazione relativa dopo un cambio di cartella che non so risolvere (${t}). Confermi?`);
  // a glob in the last segment deletes the contents of its folder
  if (/[*?[]/.test(basename(t))) return rmTargetCheck(dirname(t) || '.', ctx, { recursive, contents: true });
  const abs0 = expandHome(t.replace(/\/+$/, '') || '/', ctx.cwd);
  const ci = (x) => (ctx.ci ? x.toLowerCase() : x);
  const abs = ci(abs0);
  const home = ci(HOME);
  const within = (c, p) => c === p || c.startsWith(p.endsWith('/') ? p : p + '/');
  if (abs === '/' || abs === home) return deny('rm-radice', `Cancellazione di ${abs === '/' ? 'tutto il disco' : 'tutta la cartella home'}${contents ? ' (contenuto)' : ''} bloccata.`);
  const isTmp = ctx.tmp.some((tmp) => { const tt = ci(resolve(tmp)); return within(abs, tt) && abs !== tt; });
  const roots = SYSTEM_ROOTS.map(ci);
  if (roots.includes(abs) || roots.includes(ci(dirname(abs0)))) return deny('rm-sistema', `Cancellazione di una cartella utente o di un volume (${abs0}) bloccata.`);
  const sys = SYSTEM_TREES.map(ci).find((d) => within(abs, d) && !within(abs, home) && !isTmp);
  if (sys) return deny('rm-sistema', `Cancellazione in una cartella di sistema (${abs0}) bloccata.`);
  if (isTmp) return ALLOW;
  const proj = ci(resolve(ctx.projectDir));
  if (abs === proj) return ask('cancella-progetto', `Cancellazione ${contents ? 'del contenuto ' : ''}dell'intera cartella del progetto (${abs0}). Confermi?`);
  if (!within(abs, proj)) return ask('cancella-fuori-progetto', `Cancellazione fuori dalla cartella del progetto: ${abs0}. Confermi?`);
  return ALLOW;
}

function checkRm(argv, ctx, { viaXargs = false } = {}) {
  const opts = argv.slice(1).filter((x) => x.startsWith('-') && x !== '--');
  const recursive = argv[0] === 'rimraf' || opts.some((o) => /^-[a-zA-Z]*[rR]/.test(o) || o === '--recursive');
  const targets = argv.slice(1).filter((x) => !x.startsWith('-'));
  if (viaXargs && !targets.length) return ask('cancella-da-elenco', 'Cancellazione di file letti da un elenco (xargs): non vedo i percorsi. Confermi?');
  return worst(targets.flatMap((raw) => expandAll(raw, ctx.vars, ctx)).map((t) => rmTargetCheck(t, ctx, { recursive })));
}

const EXEC_FLAGS = new Set(['-exec', '-execdir', '-ok', '-okdir']);
function checkFind(argv, ctx) {
  const execIdx = argv.findIndex((x) => EXEC_FLAGS.has(x));
  const execRm = execIdx > 0 && RM_LIKE.has(basename(argv[execIdx + 1] || ''));
  if (!argv.includes('-delete') && !execRm) return ALLOW;
  const firstOpt = argv.findIndex((x, i) => i > 0 && /^[-(!]/.test(x));
  const paths = argv.slice(1, firstOpt === -1 ? undefined : firstOpt);
  const filtered = argv.some((x) => /^-(i?name|i?path|i?wholename|type|mtime|mmin|atime|newer|size|empty|i?regex|perm|user)$/.test(x));
  const results = [];
  for (const p of (paths.length ? paths : ['.']).flatMap((raw) => expandAll(raw, ctx.vars, ctx))) {
    const r = rmTargetCheck(p, ctx, { recursive: true });
    if (!filtered || r.decision === 'allow') { results.push(r); continue; }
    if (ctx.tmp.some((tmp) => resolve(tmp) === expandHome(p, ctx.cwd))) continue; // find /tmp -name x -delete
    // with filters find removes matches, not the folder: only / and system folders stay blocked
    if (r.rule === 'cancella-progetto') continue;
    const abs = expandHome(p, ctx.cwd);
    if (r.rule === 'rm-radice' && abs !== '/') results.push(ask('cancella-con-filtro', `find che cancella file nella home (${p}) con un filtro. Confermi?`));
    else results.push(r);
  }
  return worst(results);
}

// git push: branch of the right repository, refspecs with variables, aliases, push.default.
function checkGitPush(argv, ctx) {
  const results = [];
  let dir = ctx.cwdUnknown ? null : ctx.cwd;
  const cOpts = [];
  let i = 1;
  while (i < argv.length && argv[i].startsWith('-')) {
    if (argv[i] === '-C') { dir = resolve(ctx.cwd, argv[i + 1] || '.'); i += 2; continue; }
    if (argv[i] === '-c') { cOpts.push(argv[i + 1] || ''); i += 2; continue; }
    i++;
  }
  let sub = argv[i];
  let rest = argv.slice(i + 1);
  for (const c of cOpts) {
    const m = c.match(/^alias\.([^=]+)=(.*)$/);
    if (m && m[1] === sub) { const w = words(m[2]).argv; sub = w[0]; rest = [...w.slice(1), ...rest]; }
    if (/^(push\.default|remote\.[^.]+\.push|remote\.pushdefault)=/i.test(c)) results.push(ask('push-incerto', `git push con un'opzione che cambia cosa viene spinto (${c}). Confermi?`));
  }
  if (sub !== 'push') return worst(results);
  if (rest.some((a) => a === '--dry-run' || a === '-n')) return worst(results);
  const branch = () => (ctx.branchOverride ?? (dir ? ctx.branchOf(dir) : null));
  const args = rest;
  const force = args.some((a) => /^(-f|--force|--force-with-lease(=.*)?|--force-if-includes|--mirror)$/.test(a) || (/^-[a-zA-Z]+$/.test(a) && a.includes('f')));
  let refspecs = args.filter((a) => !a.startsWith('-')).slice(1).flatMap((r) => expandAll(r, ctx.vars, ctx));
  refspecs = refspecs.map((r) => r.replace(/\$\(\s*git\s+(branch\s+--show-current|rev-parse\s+--abbrev-ref\s+HEAD)\s*\)/g, () => branch() || '$(?)'));
  const protectedBranches = ctx.cfg.guard.branchProtetti;
  if (refspecs.some((r) => /[*]/.test(r))) {
    results.push(refspecs.some((r) => r.startsWith('+')) ? deny('push-forzato-main', 'git push forzato con un refspec che prende tutti i rami: bloccato.') : ask('push-incerto', 'git push con un refspec che prende più rami (può includere main). Confermi?'));
    return worst(results);
  }
  if (refspecs.some((r) => /\$|`/.test(r)) || (dir === null && !refspecs.length)) {
    results.push(ask('push-incerto', 'git push verso un ramo che non so risolvere prima che parta. Confermi?'));
    return worst(results);
  }
  const targetOf = (r) => {
    const t = r.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '');
    return t === 'HEAD' || t === '@' ? branch() : t;
  };
  let hitsProtected;
  if (args.includes('--all') || args.includes('--mirror')) hitsProtected = true;
  else if (refspecs.length) hitsProtected = refspecs.some((r) => protectedBranches.includes(targetOf(r)));
  else hitsProtected = protectedBranches.includes(branch());
  const deleting = args.includes('--delete') || args.includes('-d') || refspecs.some((r) => r.startsWith(':'));
  if (hitsProtected && (force || deleting || refspecs.some((r) => r.startsWith('+')))) results.push(deny('push-forzato-main', 'git push forzato o cancellazione su un ramo protetto (main): bloccato.'));
  else if (deleting && refspecs.some((r) => protectedBranches.includes(targetOf(r)))) results.push(deny('push-forzato-main', 'Cancellazione del ramo main sul remoto: bloccata.'));
  else if (hitsProtected) results.push(ask('push-main', 'git push diretto su main: il flusso normale passa da PR e merge. Confermi il push diretto?'));
  return worst(results);
}

// Does this interpreter execute what arrives on stdin? `python3 -c '...'` reads data, `| sh` runs code.
export function runsStdin(argv) {
  const rest = argv.slice(1);
  const cCluster = (a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a) && !a.startsWith('--');
  if (isShell(argv[0])) {
    if (rest.some(cCluster)) return false;
    if (rest.includes('-') || rest.some((a) => /^-[a-zA-Z]*s[a-zA-Z]*$/.test(a))) return true;
    return !rest.some((a) => !a.startsWith('-') && !a.startsWith('+')); // bash script.sh reads the file
  }
  if (rest.some((a) => ['-e', '--eval', '-p', '--print', '-m', '-r', '-E'].includes(a) || cCluster(a))) return false;
  if (rest.includes('-')) return true;
  return !rest.some((a) => !a.startsWith('-'));
}

// The inline code of `bash -lc "..."`, `python3 -c "..."`, `node -e "..."`.
function inlineCode(argv) {
  const idx = argv.findIndex((a, i) => i > 0 && (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a) || ['-e', '--eval', '-p', '--print', '-r', '-Command', '-command'].includes(a)));
  return idx > 0 ? argv[idx + 1] || '' : '';
}

function hostOf(url) {
  const m = url.match(/^[a-z]+:\/\/([^/:?#@]+@)?([^/:?#]+)/i) || url.match(/^([a-z0-9.-]+\.[a-z]{2,})(\/|$)/i);
  return m ? (m[2] || m[1]).toLowerCase() : null;
}
const allowedHost = (h, ctx) => h && ctx.cfg.guard.curlShConsentiti.some((d) => h === d || h.endsWith('.' + d));
function scriptRule(urls, ctx, what) {
  const hosts = urls.map(hostOf);
  if (!hosts.length || hosts.some((h) => !allowedHost(h, ctx))) {
    const bad = hosts.find((h) => !allowedHost(h, ctx)) || 'un indirizzo sconosciuto';
    return deny('curl-sh', `Script scaricato da ${bad} ed eseguito ${what}: bloccato (dominio non nella lista consentita).`);
  }
  return ask('installazione-script', `Script di installazione da ${hosts.join(', ')} eseguito ${what}. Confermi?`);
}
const urlsIn = (s) => (String(s).match(/https?:\/\/[^\s'")]+/gi) || []);

function isWriteRequest(cmd, argv, raw) {
  if (cmd === 'curl') return /(^|\s)(-X\s*|--request\s+)(POST|PUT|PATCH|DELETE)\b/i.test(raw) || argv.some((a) => /^(-d|--data[\w-]*|--json|-F|--form[\w-]*|-T|--upload-file)/.test(a));
  if (cmd === 'wget') return argv.some((a) => /^--(post-data|post-file|method=(POST|PUT|PATCH|DELETE)|body-data|body-file)/i.test(a));
  if (/^(http|https|xh)$/.test(cmd)) return argv.some((a) => /^(POST|PUT|PATCH|DELETE)$/.test(a) || /^[\w.-]+(:?=|=@|@)/.test(a));
  return false;
}

function analyzePipeline(pipeline, ctx, depth) {
  tick(ctx);
  const results = [];
  const cmds = pipeline.map((c) => {
    const w = words(c);
    let argv = w.argv;
    const al = argv[0] && ctx.aliases?.get(argv[0]);
    if (al) argv = [...words(al).argv, ...argv.slice(1)];
    argv = argv.map((a) => expandVars(a, ctx.vars, ctx));
    return { raw: c, ...w, ...normalize(argv) };
  });
  for (let n = 0; n < cmds.length; n++) {
    const { argv, sudo, redirects, inputs, herestrings, raw, viaXargs, envPrefix } = cmds[n];
    const path0 = cmds[n].path0 || argv[0] || '';
    if (!argv.length) continue;
    const cmd = argv[0];
    const rest = argv.slice(1).join(' ');
    const next = cmds.slice(n + 1);

    // a loop variable with literal values is a known list of commands: each is checked like a normal command
    const loopVar = path0.match(/^\$\{?([A-Za-z_]\w*)\}?$/);
    const loopVals = loopVar && ctx.vars?.get(loopVar[1]);
    if (Array.isArray(loopVals)) {
      if (depth < 4) for (const v of loopVals.slice(0, 5)) results.push(analyzeBash([v, ...argv.slice(1)].map((x) => (/\s/.test(x) ? `'${x}'` : x)).join(' '), ctx, depth + 1));
    } else if (/^(\$|`)/.test(path0) || /\$\(/.test(cmd)) results.push(ask('comando-variabile', `Il nome del comando viene da una variabile o da un altro comando (${path0}): non so cosa partirà. Confermi?`));

    // nested shells and code: bash -lc "...", eval, here-strings, heredocs, text piped into a shell
    if (isShell(cmd) && depth < 4) {
      const code = inlineCode(argv);
      if (code) results.push(analyzeBash(code, ctx, depth + 1));
      for (const h of herestrings) results.push(analyzeBash(h, ctx, depth + 1));
    }
    if (cmd === 'eval' && depth < 4) results.push(analyzeBash(argv.slice(1).join(' '), ctx, depth + 1));
    if ((cmd === 'source' || cmd === '.') && ctx.downloads?.has(resolve(ctx.cwd, argv[1] || ''))) results.push(scriptRule([ctx.downloads.get(resolve(ctx.cwd, argv[1]))], ctx, 'subito'));
    if ((isShell(cmd) || /^\.\//.test(path0)) && ctx.downloads?.size) {
      const script = isShell(cmd) ? argv.slice(1).find((a) => !a.startsWith('-')) : path0;
      const url = script && ctx.downloads.get(resolve(ctx.cwd, script));
      if (url) results.push(scriptRule([url], ctx, 'dopo il download'));
    }
    const here = (ctx.heredocs || []).filter((h) => h.cmd === raw || raw.endsWith(h.cmd) || h.cmd.endsWith(raw)).map((h) => h.body).join('\n');
    if (here) {
      if (isShell(cmd) && runsStdin(argv) && depth < 4) results.push(analyzeBash(here, ctx, depth + 1));
      else if (isInterp(cmd) && MAIL_URL_RE.test(here)) results.push(ask('mail', `Lo script passato a ${cmd} sembra inviare una mail: serve il tuo consenso esplicito.`));
    }
    if (isShell(cmd) && runsStdin(argv) && n > 0 && !here) {
      const prod = cmds[n - 1];
      if (prod.argv[0] === 'echo' || prod.argv[0] === 'printf') { if (depth < 4) results.push(analyzeBash(prod.argv.slice(1).join(' '), ctx, depth + 1)); }
      else if (!DOWNLOADERS.has(prod.argv[0])) results.push(ask('esegue-testo', `Una shell esegue il testo prodotto da ${prod.argv[0]}: non posso controllarlo prima. Confermi?`));
    }

    if (sudo) results.push(ask('sudo', `Comando con privilegi di amministratore (sudo ${cmd}). Confermi?`));

    // deletions
    if (RM_LIKE.has(cmd)) results.push(checkRm(cmd === 'rm' || cmd === 'rimraf' ? argv : ['rm', ...argv.slice(1)], ctx, { viaXargs }));
    if (cmd === 'find') results.push(checkFind(argv, ctx));
    if (cmd === 'rsync' && argv.some((a) => /^--delete/.test(a))) {
      const dest = argv.slice(1).filter((a) => !a.startsWith('-')).pop();
      if (dest && !/:/.test(dest)) results.push(rmTargetCheck(dest.replace(/\/+$/, '') + '/*', ctx, { recursive: true }));
    }
    if (isInterp(cmd)) {
      const code = inlineCode(argv) + '\n' + here;
      if (/(shutil\.rmtree|os\.(remove|rmdir|unlink)|rmSync|rmdirSync|unlinkSync|fs\.rm\(|rimraf|FileUtils\.rm_r)/.test(code) && /(expanduser|Path\.home|homedir\(\)|environ\[.HOME|getenv\(.HOME|['"]~['"]|['"]\/['"])/.test(code)) {
        results.push(ask('cancella-da-script', `Lo script ${cmd} cancella file nella home o dalla radice. Confermi?`));
      }
    }

    // git
    if (cmd === 'git') {
      results.push(checkGitPush(argv, ctx));
      if (argv.includes('send-email')) results.push(ask('mail', 'git send-email invia mail: serve il tuo consenso esplicito.'));
      if (/^(diff|show)$/.test(argv.find((a, i) => i > 0 && !a.startsWith('-')) || '') && argv.some((a) => isSecretPath(a, ctx))) results.push(deny('stampa-segreti', 'git mostra il contenuto di un file di segreti: bloccato.'));
    }

    // secrets printed
    const secretArg = argv.slice(1).find((a) => isSecretPath(a, ctx));
    const secretIn = inputs.find((a) => isSecretPath(a, ctx));
    if (PRINTS_CONTENT.has(cmd) && (secretArg || secretIn)) results.push(deny('stampa-segreti', `Lettura a schermo di un file di segreti (${secretArg || secretIn}): bloccata. Usa le variabili senza stamparle.`));
    if (/^(cp|install|dd)$/.test(cmd) && (secretArg || argv.some((a) => /^if=/.test(a) && isSecretPath(a.slice(3), ctx))) && argv.some((a) => /^(of=)?(\/dev\/(stdout|stderr|tty)|-)$/.test(a))) results.push(deny('stampa-segreti', 'Copia di un file di segreti sullo schermo: bloccata.'));

    // secrets sent over the network
    const netCmd = NET_TOOLS.has(cmd) || (cmd === 'gh' && /^(gist|release|api)$/.test(argv[1] || ''));
    if (netCmd && (argv.slice(1).some((a) => isSecretPath(a, ctx)) || secretIn)) results.push(deny('invia-segreti', 'Invio in rete di un file di segreti: bloccato.'));

    // environment dumps
    const envDump = (['printenv', 'env', 'set', 'compgen'].includes(cmd) && argv.length === 1) || (/^(export|declare|typeset)$/.test(cmd) && argv.includes('-p') && argv.length === 2) || (cmd === 'cat' && argv.some((a) => /^\/proc\/[\w]+\/environ$/.test(a)));
    if (envDump) {
      const pipedNet = next.some((c) => NET_TOOLS.has(c.argv[0]));
      const pipedGrep = next.find((c) => /^(e|f)?grep$|^rg$/.test(c.argv[0]));
      // names only: sed 's/=.*//', cut -d= -f1, awk -F= '{print $1}', grep -o on a name pattern
      const namesOnly = next.some((c) => (c.argv[0] === 'sed' && /s([\/|#])=\.\*\1\1/.test(c.argv.join(' ')))
        || (c.argv[0] === 'cut' && /-d\s*=/.test(c.argv.join(' ')) && /-f\s*1\b/.test(c.argv.join(' ')))
        || (c.argv[0] === 'awk' && /-F\s*=/.test(c.argv.join(' ')) && /print \$1\b/.test(c.argv.join(' ')))
        || (/grep$/.test(c.argv[0]) && c.argv.includes('-o') && !c.argv.slice(1).filter((a) => !a.startsWith('-')).some((a) => a.includes('=') || a.includes('.'))));
      for (const r of redirects) if (!/^(&\d|\/dev\/)/.test(r)) ctx.secretFiles?.add(resolve(ctx.cwd, r));
      if (pipedNet) results.push(deny('esporta-segreti', 'Variabili d\'ambiente mandate in rete: bloccato.'));
      else if (pipedGrep && /(key|token|secret|pass|auth|cred)/i.test(pipedGrep.argv.slice(1).join(' ')) && !namesOnly) results.push(deny('stampa-segreti', 'Ricerca di chiavi tra le variabili d\'ambiente: bloccata.'));
      else if (!namesOnly) results.push(ask('stampa-ambiente', 'Il comando stampa tutte le variabili d\'ambiente, che possono contenere chiavi. Confermi? Meglio printenv NOME per una variabile non segreta.'));
    }
    if (/^(printenv|declare|typeset)$/.test(cmd) && argv.slice(1).some((a) => SECRET_VAR_RE.test(a))) results.push(deny('stampa-segreti', `Stampa della variabile segreta ${argv.slice(1).find((a) => SECRET_VAR_RE.test(a))}: bloccata.`));
    // every form that prints the value or a piece of it (${V:0:9}, ${V%x}...); ${V:+x} and ${#V} do not
    const secretVars = (s) => [...String(s).matchAll(/\$\{([A-Z][A-Z0-9_]*)([^}]*)\}|\$([A-Z][A-Z0-9_]*)\b/g)].filter((m) => !/^:?\+/.test(m[2] || '')).map((m) => m[1] || m[3]).filter((v) => SECRET_VAR_RE.test(v));
    if (cmd === 'echo' || cmd === 'printf') {
      const v = secretVars(cmds[n].raw.replace(/\$\{[A-Z0-9_]+:\+[^}]*\}|\$\{#[A-Z0-9_]+\}/g, ''))[0];
      const toFile = redirects.length && redirects.every((r) => !/^(&\d|\/dev\/(stdout|stderr|tty)|-)$/.test(r));
      const consumer = next.length && SECRET_CONSUMER_RE.test(next.map((c) => c.raw).join(' | '));
      if (v && !toFile && !consumer) results.push(deny('stampa-segreti', `Stampa della variabile segreta ${v}: bloccata.`));
    }
    if (herestrings.some((h) => secretVars(h).length) && !SECRET_CONSUMER_RE.test(cmds[n].raw) && !isShell(cmd)) results.push(deny('stampa-segreti', 'Una variabile segreta passata come testo a un comando che la stampa: bloccata.'));
    if (isInterp(cmd)) {
      const code = inlineCode(argv);
      const names = [...code.matchAll(/(?:process\.env\.|process\.env\[['"]|environ\[['"]|environ\.get\(['"]|getenv\(['"]|ENV\[['"]|\$ENV\{)([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]).filter((v) => SECRET_VAR_RE.test(v));
      const printing = argv.some((a) => a === '-p' || a === '--print') || /(print\s*\(|console\.(log|error)|process\.stdout\.write|puts\s|echo\s)/.test(code);
      if (names.length && printing) results.push(deny('stampa-segreti', `Lo script stampa la variabile segreta ${names[0]}: bloccato.`));
    }

    // download then run, or download piped into an interpreter
    if (DOWNLOADERS.has(cmd)) {
      const out = argv.findIndex((a) => a === '-o' || a === '--output' || a === '-O');
      if (out > 0 && argv[out + 1] && !argv[out + 1].startsWith('-')) ctx.downloads?.set(resolve(ctx.cwd, argv[out + 1]), urlsIn(rest)[0] || '');
      const m = argv.find((a) => /^-[a-zA-Z]*o$/.test(a) && a !== '-o');
      if (m) { const f = argv[argv.indexOf(m) + 1]; if (f) ctx.downloads?.set(resolve(ctx.cwd, f), urlsIn(rest)[0] || ''); }
      if (next.some((c) => isInterp(c.argv[0]) && runsStdin(c.argv))) results.push(scriptRule(urlsIn(rest), ctx, 'subito'));
    }

    // mail
    if (MAIL_CMDS.has(cmd)) results.push(ask('mail', `Invio di una mail (${cmd}): serve il tuo consenso esplicito.`));
    else if ((NET_TOOLS.has(cmd) || isInterp(cmd)) && MAIL_URL_RE.test(cmds[n].raw)) results.push(ask('mail', 'Il comando sembra inviare una mail: serve il tuo consenso esplicito.'));
    if (cmd === 'aws' && /^sesv?2?$/.test(argv[1] || '') && /^send/.test(argv[2] || '')) results.push(ask('mail', 'Invio di mail con Amazon SES: serve il tuo consenso esplicito.'));

    // payments, purchases, paid APIs
    if (cmd === 'stripe' && /\b(create|update|delete|post|trigger|cancel|refund|pay|capture|confirm)\b/i.test(rest)) results.push(ask('pagamento', 'Operazione di scrittura su Stripe: serve il tuo consenso esplicito.'));
    if (NET_TOOLS.has(cmd) && /api\.stripe\.com/i.test(rest) && isWriteRequest(cmd, argv, cmds[n].raw)) results.push(ask('pagamento', 'Chiamata di scrittura alle API di Stripe: serve il tuo consenso esplicito.'));
    if (NET_TOOLS.has(cmd) && PAID_API_HOSTS.test(rest)) results.push(ask('consumo', `Chiamata a un'API a pagamento (${rest.match(PAID_API_HOSTS)[0]}): consuma credito. Confermi?`));
    if (cmd === 'vercel' && /\bdomains?\s+(buy|transfer-in|purchase)\b/i.test(rest)) results.push(ask('acquisto', 'Acquisto o trasferimento di un dominio: serve il tuo consenso esplicito.'));
    if (cmd === 'vercel' && /^integrations?$/.test(argv[1] || '') && /^(add|install)$/.test(argv[2] || '')) results.push(ask('acquisto', 'Aggiunta di un\'integrazione dal marketplace di Vercel: può avere un costo. Confermi?'));
    if (!/^(git|gh|grep|rg|echo|printf|cat|ls|mv|cp|mkdir|wc|head|tail|npm|pnpm|yarn|bun|npx|vitest|jest|node)$/.test(cmd) && argv.slice(1, 4).some((a) => /^(buy|purchase|register-domain)$/i.test(a))) results.push(ask('acquisto', `Comando di acquisto (${argv.slice(0, 3).join(' ')}): serve il tuo consenso esplicito.`));

    // global installs
    const sub = argv.slice(1).find((a) => !a.startsWith('-'));
    const flagG = argv.some((a) => a === '-g' || a === '--global' || a === '--location=global');
    const venv = /(^|\/)(\.?venv|virtualenv|env)\/bin\//.test(path0) || ctx.venv;
    if ((cmd === 'npm' && (/^(i|install|add|update|uninstall|remove|rm|link|un)$/.test(sub || '') && (flagG || envPrefix.some((e) => /^npm_config_global=true$/i.test(e)))))
      || (cmd === 'npm' && sub === 'link' && argv.length === 2)
      || ((cmd === 'pnpm' || cmd === 'bun') && flagG)
      || (cmd === 'yarn' && sub === 'global')
      || (cmd === 'brew' && /^(install|reinstall|upgrade|tap|uninstall|remove|bundle)$/.test(sub || ''))
      || (/^(apt|apt-get|dnf|yum|pacman|port|zypper)$/.test(cmd) && /^(install|remove|purge|upgrade|dist-upgrade|-S)$/.test(sub || ''))
      || (cmd === 'apk' && /^(add|del)$/.test(sub || ''))
      || (/^(gem|cargo|pipx|go)$/.test(cmd) && sub === 'install')
      || (cmd === 'uv' && sub === 'tool' && argv.includes('install'))
      || (cmd === 'corepack' && sub === 'enable')
      || (cmd === 'volta' && sub === 'install')
      || (/^pip[\d.]*$/.test(cmd) && sub === 'install' && !venv && !process.env.VIRTUAL_ENV && !argv.some((a) => a === '-t' || a.startsWith('--target') || a === '--user'))) {
      results.push(ask('installazione-globale', `Installazione globale (${argv.slice(0, 3).join(' ')}): modifica il sistema, serve il tuo consenso.`));
    }
    if (/^(supabase|gcloud|aws|az|fly|flyctl|heroku|railway|doctl|netlify)$/.test(cmd) && /\b(create|launch|run-instances|scale|upgrade|subscribe|billing)\b/i.test(rest) && !/\b(list|describe|get|status|logs?)\b/i.test(argv[1] || '')) {
      results.push(ask('servizio-a-consumo', `Creazione o avvio di un servizio cloud (${argv.slice(0, 3).join(' ')}): può costare. Serve il tuo consenso.`));
    }
  }
  return worst(results);
}

export function analyzeBash(command, ctx, depth = 0) {
  tick(ctx);
  const results = [];
  const secret = findSecret(command);
  if (secret) results.push(secret.level === 'ask'
    ? ask('chiave-nel-comando', `Il comando contiene una chiave (${secret.label}). Se è pubblica va bene, altrimenti usa una variabile d'ambiente. Confermi?`)
    : deny('segreto-nel-comando', `Il comando contiene un segreto (${secret.label}). Usa una variabile d'ambiente, non scriverlo nei comandi, nei file o nei log.`));
  const { pipelines, substitutions, heredocs } = splitShell(command);
  const local = {
    ...ctx,
    vars: new Map(ctx.vars || []),
    aliases: new Map(ctx.aliases || []),
    heredocs: [...(ctx.heredocs || []), ...heredocs],
    venv: ctx.venv || /\/bin\/activate\b|-m\s+venv\b|\buv\s+venv\b/.test(command),
  };
  for (const p of pipelines) {
    tick(ctx);
    if (p.length === 1) {
      if (trackAssignments(p[0], local.vars, local)) continue;
      const { argv } = normalize(words(p[0]).argv);
      if (argv[0] === 'alias') {
        for (const a of argv.slice(1)) { const eq = a.indexOf('='); if (eq > 0) local.aliases.set(a.slice(0, eq), a.slice(eq + 1)); }
        continue;
      }
      if (argv[0] === 'for' && argv[2] === 'in' && /^[A-Za-z_]\w*$/.test(argv[1] || '')) {
        const values = argv.slice(3).map((v) => expandVars(v, local.vars, local));
        if (values.length && values.every((v) => !/[$*?`]/.test(v))) local.vars.set(argv[1], values); else local.vars.delete(argv[1]);
        continue;
      }
      if (argv[0] === 'cd' || argv[0] === 'pushd') {
        const dest = expandVars(argv.slice(1).find((x) => !x.startsWith('-')) || HOME, local.vars, local);
        if (dest === '-') continue;
        if (/\$|`/.test(dest)) local.cwdUnknown = true;
        else { local.cwd = expandHome(dest, local.cwd); local.cwdUnknown = false; }
        continue;
      }
    }
    results.push(analyzePipeline(p, local, depth));
  }
  if (depth < 4) {
    for (const s of substitutions) {
      results.push(analyzeBash(s, local, depth + 1));
      // $(printenv) or <(env) inside a network command sends the environment
      const inner = words(s.trim()).argv;
      const dump = ['env', 'printenv', 'set'].includes(inner[0]) && inner.length === 1;
      if (dump && /(^|[\s;&|(])(curl|wget|nc|ncat|http|xh|ssh|scp)\b/.test(command)) results.push(deny('esporta-segreti', 'Variabili d\'ambiente mandate in rete: bloccato.'));
    }
  }
  // code downloaded and executed through a substitution: bash -c "$(curl ...)", source <(curl ...), python3 -c "$(curl ...)".
  // Heredoc bodies are data (a test file that mentions the pattern is not running it).
  const bare = heredocs.reduce((acc, h) => (h.body ? acc.replace(h.body, '') : acc), command);
  if (/(^|[\s;&|(])(source|\.|(ba|z|da|k)?sh|fish|python[\d.]*|node|bun|deno|perl|ruby)\s[^|;&]*(\$\(|<\()\s*(curl|wget|http|xh)\b/.test(bare)) {
    results.push(scriptRule(urlsIn(bare), ctx, 'subito'));
  }
  for (const re of ctx.cfg.guard.extraDeny || []) if (safeRegex(re)?.test(command)) results.push(deny('regola-utente', `Regola personale: ${re}`));
  for (const re of ctx.cfg.guard.extraAsk || []) if (safeRegex(re)?.test(command)) results.push(ask('regola-utente', `Regola personale: ${re}. Confermi?`));
  return worst(results);
}

// MCP tool names: mcp__<server>__<tool>
export function analyzeMcp(toolName, input, ctx) {
  const results = [];
  const parts = toolName.split('__');
  const server = parts[1] || '';
  const tool = parts.slice(2).join('__');
  const toks = tool.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().split(/[_-]/);
  const read = READ_PREFIX.test(tool);
  const text = JSON.stringify(input ?? {});
  const secret = findSecret(text);
  if (secret) {
    results.push(/memory|memoria/i.test(server + tool)
      ? deny('segreto-in-memoria', `Non salvo segreti in memoria (${secret.label}).`)
      : secret.level === 'ask'
        ? ask('chiave-nel-tool', `L'input del tool contiene una chiave (${secret.label}). Se è pubblica va bene. Confermi?`)
        : deny('segreto-nel-tool', `L'input del tool contiene un segreto (${secret.label}): bloccato. Passalo da una variabile o dalle impostazioni del servizio.`));
  }
  const internal = (ctx.cfg.guard.mcpInterni || []).some((re) => safeRegex(re)?.test(toolName));
  const draft = toks.includes('draft');
  const sendTok = toks.some((t) => ['send', 'forward', 'sendmail', 'sendnow'].includes(t));
  const replyTok = toks.some((t) => ['reply', 'replyall'].includes(t)) && !draft && !/github/i.test(server);
  if (!read && !internal && (sendTok || replyTok)) results.push(ask('mail', `Il tool ${tool} (${server}) invia un messaggio: serve il tuo consenso esplicito.`));
  if (!read && !internal && input && typeof input === 'object') {
    if (input.scheduledAt || input.scheduled_at || input.sendAt) results.push(ask('invio-programmato', `Il tool ${tool} programma un invio: serve il tuo consenso esplicito.`));
    if (Array.isArray(input.attendees) && input.attendees.length) results.push(ask('invito', `Il tool ${tool} manda inviti a ${input.attendees.length} persone: serve il tuo consenso esplicito.`));
    if (input.sendResponse === true || input.send_response === true) results.push(ask('mail', `Il tool ${tool} manda una risposta: serve il tuo consenso esplicito.`));
    if (/workflow|automation|scenario|campaign/i.test(tool) && /^(active|activate|enabled|running|on)$/i.test(String(input.status ?? input.state ?? ''))) results.push(ask('attivazione', `Il tool ${tool} accende un'automazione che può scrivere a persone vere: serve il tuo consenso.`));
  }
  if (!read && /stripe/i.test(server) && (toks.some((t) => ['write', 'create', 'update', 'delete', 'cancel', 'refund', 'capture', 'confirm', 'pay'].includes(t)) || /write/i.test(tool) || input?.action === 'create')) {
    results.push(ask('pagamento', `Operazione di scrittura su Stripe (${tool}): serve il tuo consenso esplicito.`));
  }
  const money = toks.some((t) => ['buy', 'purchase', 'checkout', 'pay', 'payment', 'charge', 'refund', 'billing', 'invoice', 'budget'].includes(t));
  const plan = toks.some((t) => ['subscribe', 'subscription', 'renew', 'upgrade'].includes(t)) && toks.some((t) => ['plan', 'tier', 'seat', 'seats', 'credits', 'credit', 'subscription', 'billing', 'license'].includes(t));
  if (!read && (money || plan)) results.push(ask('acquisto', `Il tool ${tool} (${server}) riguarda acquisti o pagamenti: serve il tuo consenso esplicito.`));
  if (!read && /domain/i.test(tool) && toks.some((t) => ['buy', 'transfer', 'register', 'create'].includes(t))) results.push(ask('acquisto', `Acquisto o trasferimento di un dominio (${tool}): serve il tuo consenso esplicito.`));
  for (const re of ctx.cfg.guard.mcpAsk || []) if (safeRegex(re)?.test(toolName)) results.push(ask('consumo', `Il tool ${toolName} usa crediti o servizi a consumo, o agisce verso l'esterno: confermi?`));
  // direct push to main through the GitHub MCP
  const br = String(input?.branch || '').replace(/^refs\/heads\//, '');
  if (/github/i.test(server) && /^(push_files|create_or_update_file|delete_file)$/.test(tool) && ctx.cfg.guard.branchProtetti.includes(br)) {
    results.push(ask('push-main', `Scrittura diretta sul ramo ${br} via GitHub: il flusso normale passa da PR. Confermi?`));
  }
  return worst(results);
}

export function analyzeWrite(toolName, input, ctx) {
  const path = String(input?.file_path || input?.notebook_path || '');
  const contents = [input?.content, input?.new_string, input?.new_source, ...(Array.isArray(input?.edits) ? input.edits.map((e) => e?.new_string) : [])].filter((x) => typeof x === 'string');
  for (const c of contents) {
    const secret = findSecret(c);
    if (!secret) continue;
    if (ENV_FILE_RE.test(path) && !SAFE_SUFFIX_RE.test(path) && !/\.env\.(example|sample|template)/.test(path)) {
      return ask('segreto-in-env', `Stai scrivendo un segreto (${secret.label}) in ${basename(path)}. Il file deve restare fuori da git. Confermi?`);
    }
    if (secret.level === 'ask') return ask('chiave-nel-file', `Il testo da scrivere in ${basename(path) || 'un file'} contiene una chiave (${secret.label}). Se è una chiave pubblica del browser va bene, altrimenti usa una variabile d'ambiente. Confermi?`);
    return deny('segreto-nel-file', `Il testo da scrivere in ${basename(path) || 'un file'} contiene un segreto (${secret.label}): bloccato. Usa una variabile d'ambiente.`);
  }
  return ALLOW;
}

export function decide(hook, opts = {}) {
  const cfg = opts.cfg || loadConfig();
  const cwd = hook.cwd || process.cwd();
  const branches = new Map();
  const ctx = {
    cfg,
    cwd,
    projectDir: process.env.CLAUDE_PROJECT_DIR || cwd,
    tmp: [...cfg.guard.cartelleTemporanee, tmpdir(), ...(process.env.TMPDIR ? [process.env.TMPDIR] : [])],
    branchOverride: opts.branch,
    branchOf: (dir) => { if (!branches.has(dir)) branches.set(dir, currentBranch(dir)); return branches.get(dir); },
    ci: opts.ci ?? (process.platform === 'darwin' || process.env.REGIA_FS_CI === '1'),
    deadline: Date.now() + (opts.timeoutMs ?? 2500),
    secretFiles: new Set(),
    downloads: new Map(),
  };
  const tool = String(hook.tool_name || '');
  const input = hook.tool_input || {};
  if (tool === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    if (!command.trim()) return deny('input-vuoto', 'Il guard non ha ricevuto il comando da controllare.');
    return analyzeBash(command, ctx);
  }
  if (tool.startsWith('mcp__')) return analyzeMcp(tool, input, ctx);
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return analyzeWrite(tool, input, ctx);
  return ALLOW;
}

// Fail-safe: if the guard itself breaks (or the analysis takes too long), nothing runs.
export function onGuardError(raw, error) {
  return deny('errore-guard', `Il guard è andato in errore: blocco per sicurezza (${error?.message || error}). Lancia /regia-test.`);
}

async function main() {
  const raw = await readStdin();
  let hook;
  try { hook = JSON.parse(raw); } catch {
    emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'REGIA guard: input non leggibile, blocco per sicurezza.' } });
    return;
  }
  let result;
  try { result = decide(hook); } catch (e) { result = onGuardError(raw, e); }
  if (result.decision === 'allow') return;
  const what = hook.tool_name === 'Bash' ? hook.tool_input?.command : JSON.stringify(hook.tool_input ?? {});
  appendJsonl('guard.jsonl', {
    decisione: result.decision, regola: result.rule, motivo: result.reason, tool: hook.tool_name,
    dettaglio: redact(String(what ?? '')).slice(0, 300), cwd: hook.cwd, sessione: hook.session_id,
  });
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: `REGIA: ${result.reason}` } });
}

if (isEntry(import.meta.url)) main();
