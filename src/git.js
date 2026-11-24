'use strict';
// Statistiche e controlli su un repository Git locale (sola lettura; usa il comando git installato)
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const git = (repo, args, input) => { try { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', input, maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { const m = String(e.stderr || e.message).trim().split('\n')[0]; throw new Error(/not a git repository/i.test(m) ? 'Non è un repository Git: ' + repo : /ENOENT/.test(String(e.code)) ? 'git non è installato' : m); } };
const repo = a => { const r = a[0] || '.'; git(r, ['rev-parse', '--git-dir']); return r; };
const wk = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const day = iso => iso.slice(0, 10), dnum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
const logTimes = r => git(r, ['log', '--format=%aI']).split('\n').filter(Boolean);
const SECRETS = [['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g], ['Chiave privata', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g], ['Token GitHub', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g], ['Token Slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g], ['Chiave API Google', /\bAIza[0-9A-Za-z_-]{35}\b/g], ['Chiave Stripe live', /\b[sr]k_live_[0-9A-Za-z]{20,}\b/g], ['Assegnazione sospetta', /\b(?:password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/gi]];

module.exports = {
  'git-authors': {
    desc: 'Commit per autore', usage: '[repo]',
    fn: (a) => git(repo(a), ['shortlog', '-sne', 'HEAD']).split('\n').filter(Boolean).map(l => { const m = /^\s*(\d+)\s+(.*)$/.exec(l); return { commits: +m[1], author: m[2] }; }),
  },
  'git-activity': {
    desc: 'Distribuzione dei commit per giorno della settimana e ora', usage: '[repo]',
    fn: (a) => { const d = Array(7).fill(0), h = Array(24).fill(0); for (const t of logTimes(repo(a))) { d[(new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10))).getUTCDay() + 6) % 7]++; h[+t.slice(11, 13)]++; } return { byWeekday: Object.fromEntries(wk.map((n, i) => [n, d[i]])), byHour: Object.fromEntries(h.map((n, i) => [String(i).padStart(2, '0'), n]).filter(x => x[1])) }; },
  },
  'git-hot-files': {
    desc: 'I file modificati più spesso (--top=10 --since="6 months ago")', usage: '[repo] [--top=10] [--since=...]',
    fn: (a, o) => { const args = ['log', '--name-only', '--pretty=format:']; if (o.since) args.push('--since=' + o.since); const c = {}; for (const f of git(repo(a), args).split('\n').filter(Boolean)) c[f] = (c[f] || 0) + 1; return Object.entries(c).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, +o.top || 10).map(([f, n]) => `${String(n).padStart(5)}  ${f}`).join('\n') || 'Nessuna modifica'; },
  },
  'git-big-files': {
    desc: 'I file più grandi in tutta la storia del repository', usage: '[repo] [--top=10]',
    fn: (a, o) => { const r = repo(a), objs = git(r, ['rev-list', '--objects', '--all']), info = git(r, ['cat-file', '--batch-check=%(objecttype) %(objectsize) %(rest)'], objs); const sz = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B'); return info.split('\n').map(l => /^blob (\d+) (.+)$/.exec(l)).filter(Boolean).map(m => [+m[1], m[2]]).sort((x, y) => y[0] - x[0]).slice(0, +o.top || 10).map(([s, f]) => `${sz(s).padStart(9)}  ${f}`).join('\n') || 'Nessun file'; },
  },
  'git-stale-branches': {
    desc: 'Branch locali senza commit da N giorni (--days=90)', usage: '[repo] [--days=90] [--now=epoch]',
    fn: (a, o) => { const now = o.now ? +o.now : Math.floor(Date.now() / 1000), days = +o.days || 90; const out = git(repo(a), ['for-each-ref', '--format=%(refname:short)|%(committerdate:unix)|%(authorname)', 'refs/heads']).split('\n').filter(Boolean).map(l => l.split('|')).map(([b, t, au]) => ({ branch: b, daysOld: Math.floor((now - +t) / 86400), lastAuthor: au })).filter(x => x.daysOld >= days).sort((x, y) => y.daysOld - x.daysOld); return out.length ? out : `Nessun branch più vecchio di ${days} giorni`; },
  },
  'git-unpushed': {
    desc: 'Commit locali non ancora inviati al remoto', usage: '[repo]',
    fn: (a) => { try { git(repo(a), ['rev-parse', '--abbrev-ref', '@{u}']); } catch { return 'Il branch corrente non ha un upstream configurato'; } const l = git(repo(a), ['log', '@{u}..HEAD', '--oneline']).trim(); return l || 'Tutto inviato'; },
  },
  'git-commit-lint': {
    desc: 'Controlla gli ultimi commit (Conventional Commits, lunghezza, punto finale)', usage: '[repo] [--n=20]',
    fn: (a, o) => { const types = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert', re = new RegExp(`^(${types})(\\([\\w./-]+\\))?!?: \\S`), bad = []; const lines = git(repo(a), ['log', `-${+o.n || 20}`, '--format=%h|%s']).split('\n').filter(Boolean); for (const l of lines) { const i = l.indexOf('|'), h = l.slice(0, i), s = l.slice(i + 1), p = []; if (!re.test(s)) p.push('non segue Conventional Commits'); if (s.length > 72) p.push('oltre 72 caratteri'); if (/\.$/.test(s)) p.push('punto finale'); if (p.length) bad.push(`${h} "${s}": ${p.join(', ')}`); } return bad.length ? bad.join('\n') + `\n${bad.length} su ${lines.length} commit con problemi` : `Tutti i ${lines.length} commit sono in regola`; },
  },
  'git-secrets-scan': {
    desc: 'Cerca possibili segreti nei file tracciati (valori mascherati nell\'output)', usage: '[repo]',
    fn: (a) => { const r = repo(a), out = []; for (const f of git(r, ['ls-files', '-z']).split('\0').filter(Boolean)) { const p = path.join(r, f); let b; try { if (fs.statSync(p).size > 2e6) continue; b = fs.readFileSync(p); } catch { continue; } if (b.includes(0)) continue; b.toString('utf8').split('\n').forEach((l, i) => { for (const [name, re] of SECRETS) { re.lastIndex = 0; const m = re.exec(l); if (m) out.push(`${f}:${i + 1}: ${name} (${m[0].slice(0, 4)}…${m[0].length} car.)`); } }); } return out.length ? out.join('\n') + '\nVerifica a mano: sono solo indizi, non prove.' : 'Nessun indizio di segreti nei file tracciati'; },
  },
  'git-first-commit': {
    desc: 'Primo commit, età del progetto e numero di commit', usage: '[repo] [--now=2026-01-01]',
    fn: (a, o) => { const r = repo(a), first = git(r, ['log', '--reverse', '--format=%aI|%an|%s']).split('\n')[0]; if (!first) throw new Error('Il repository non ha commit'); const [d, au, s] = first.split('|'), now = o.now ? Date.UTC(+o.now.slice(0, 4), +o.now.slice(5, 7) - 1, +o.now.slice(8, 10)) / 864e5 : Date.now() / 864e5; return { firstCommit: day(d), author: au, message: s, ageDays: Math.floor(now - dnum(d)), totalCommits: +git(r, ['rev-list', '--count', 'HEAD']).trim() }; },
  },
  'git-streak': {
    desc: 'Serie più lunga di giorni consecutivi con commit (e serie attuale)', usage: '[repo] [--today=2026-03-10]',
    fn: (a, o) => { const days = [...new Set(logTimes(repo(a)).map(day))].map(dnum).sort((x, y) => x - y); if (!days.length) return { longest: 0, current: 0 }; let best = 1, run = 1; for (let i = 1; i < days.length; i++) { run = days[i] === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); } const today = o.today ? dnum(o.today) : Math.floor(Date.now() / 864e5); let cur = 0, d = days[days.length - 1] >= today - 1 ? days[days.length - 1] : null; while (d !== null && days.includes(d)) { cur++; d--; } return { longest: best, current: cur, activeDays: days.length }; },
  },
};
