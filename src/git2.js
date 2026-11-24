'use strict';
// Altre analisi su repository Git (sola lettura)
const fs = require('fs'), path = require('path');
const { git, repoOf, optRepo } = require('./gitlib');
const day = s => s.slice(0, 10), dn = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
function isoWeek(s) { const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); const w = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - w); const y = d.getUTCFullYear(); return `${y}-W${String(Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`; }
const shortstat = (r, extra = []) => { const out = []; let cur = null; for (const l of git(r, ['log', '--shortstat', '--format=@@%h|%s', ...extra]).split('\n')) { if (l.startsWith('@@')) { const [h, ...s] = l.slice(2).split('|'); cur = { commit: h, subject: s.join('|'), files: 0, insertions: 0, deletions: 0 }; out.push(cur); } else if (cur && /files? changed/.test(l)) { cur.files = +(/(\d+) files? changed/.exec(l) || [0, 0])[1]; cur.insertions = +(/(\d+) insertions?/.exec(l) || [0, 0])[1]; cur.deletions = +(/(\d+) deletions?/.exec(l) || [0, 0])[1]; } } return out; };
const TYPES = [['feat', 'Novità'], ['fix', 'Correzioni'], ['perf', 'Prestazioni'], ['refactor', 'Refactoring'], ['docs', 'Documentazione'], ['test', 'Test'], ['build', 'Build'], ['ci', 'CI'], ['chore', 'Manutenzione'], ['style', 'Stile'], ['revert', 'Revert']];

module.exports = {
  'git-changelog': {
    desc: 'Changelog in Markdown dai commit Conventional Commits (--from=tag, --to=HEAD)', usage: '[repo] [--from=v1.0.0] [--to=HEAD]',
    fn: (a, o) => { const r = repoOf(a); let from = o.from && o.from !== true ? o.from : null; if (!from) { try { from = git(r, ['describe', '--tags', '--abbrev=0']).trim(); } catch { from = null; } } const range = from ? `${from}..${o.to && o.to !== true ? o.to : 'HEAD'}` : (o.to && o.to !== true ? o.to : 'HEAD'); const lines = git(r, ['log', range, '--format=%h|%s']).split('\n').filter(Boolean), groups = {}, other = []; for (const l of lines) { const i = l.indexOf('|'), h = l.slice(0, i), s = l.slice(i + 1), m = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(s); if (m && TYPES.some(t => t[0] === m[1])) (groups[m[1]] || (groups[m[1]] = [])).push(`- ${m[2] ? `**${m[2]}:** ` : ''}${m[4]}${m[3] ? ' ⚠️ **BREAKING**' : ''} (${h})`); else other.push(`- ${s} (${h})`); } const out = [`## ${from ? `Da ${from}` : 'Storico completo'} (${lines.length} commit)`]; for (const [k, title] of TYPES) if (groups[k]) out.push(`\n### ${title}\n${groups[k].join('\n')}`); if (other.length) out.push(`\n### Altro\n${other.join('\n')}`); return lines.length ? out.join('\n') : 'Nessun commit nell\'intervallo'; },
  },
  'git-conflict-markers': {
    desc: 'Cerca marcatori di conflitto dimenticati (<<<<<<<, =======, >>>>>>>) nei file tracciati', usage: '[repo]',
    fn: (a) => { const r = repoOf(a), out = []; for (const f of git(r, ['ls-files', '-z']).split('\0').filter(Boolean)) { let b; try { if (fs.statSync(path.join(r, f)).size > 2e6) continue; b = fs.readFileSync(path.join(r, f)); } catch { continue; } if (b.includes(0)) continue; b.toString('utf8').split('\n').forEach((l, i) => { if (/^(<{7}|>{7})( |$)/.test(l) || /^={7}$/.test(l)) out.push(`${f}:${i + 1}: ${l.slice(0, 7)}`); }); } return out.length ? out.join('\n') : 'Nessun marcatore di conflitto'; },
  },
  'git-large-commits': {
    desc: 'I commit che toccano più file (--top=10)', usage: '[repo] [--top=10]',
    fn: (a, o) => shortstat(repoOf(a)).sort((x, y) => y.files - x.files || (y.insertions + y.deletions) - (x.insertions + x.deletions)).slice(0, +o.top || 10).map(c => `${String(c.files).padStart(5)} file  +${c.insertions}/-${c.deletions}  ${c.commit}  ${c.subject}`).join('\n') || 'Nessun commit',
  },
  'git-author-span': {
    desc: 'Per ogni autore: primo e ultimo commit, giorni attivi, numero di commit', usage: '[repo]',
    fn: (a) => { const m = {}; for (const l of git(repoOf(a), ['log', '--format=%an|%aI']).split('\n').filter(Boolean)) { const [n, t] = l.split('|'), e = m[n] || (m[n] = { days: new Set(), commits: 0, first: t, last: t }); e.commits++; e.days.add(day(t)); if (t < e.first) e.first = t; if (t > e.last) e.last = t; } return Object.entries(m).sort((x, y) => y[1].commits - x[1].commits).map(([n, e]) => ({ author: n, commits: e.commits, activeDays: e.days.size, first: day(e.first), last: day(e.last) })); },
  },
  'git-file-history': {
    desc: 'Storia di un file (segue i rinomini): commit, autori, prime/ultime date, ultimi 5', usage: 'percorso/file [--repo=.]',
    fn: (a, o) => { const r = optRepo(o), f = a[0]; if (!f) throw new Error('Indica il percorso del file'); const L = git(r, ['log', '--follow', '--format=%h|%an|%aI|%s', '--', f]).split('\n').filter(Boolean).map(l => { const p = l.split('|'); return { commit: p[0], author: p[1], date: day(p[2]), subject: p.slice(3).join('|') }; }); if (!L.length) throw new Error('Nessuna storia per: ' + f); const au = {}; L.forEach(c => { au[c.author] = (au[c.author] || 0) + 1; }); return { file: f, commits: L.length, authors: au, firstCommit: L[L.length - 1].date, lastCommit: L[0].date, recent: L.slice(0, 5) }; },
  },
  'git-tags': {
    desc: 'Tag con data e numero di commit dal tag precedente', usage: '[repo]',
    fn: (a) => { const r = repoOf(a), tags = git(r, ['for-each-ref', '--sort=creatordate', '--format=%(refname:short)|%(creatordate:short)|%(objectname)', 'refs/tags']).split('\n').filter(Boolean).map(l => l.split('|')); if (!tags.length) return 'Nessun tag'; return tags.map(([t, d], i) => { const n = +git(r, ['rev-list', '--count', i ? `${tags[i - 1][0]}..${t}` : t]).trim(); return { tag: t, date: d, commitsSincePrevious: n }; }); },
  },
  'git-commit-size': {
    desc: 'Distribuzione della dimensione dei commit (file toccati) e medie', usage: '[repo]',
    fn: (a) => { const c = shortstat(repoOf(a)); if (!c.length) throw new Error('Nessun commit'); const b = { '1 file': 0, '2-5 file': 0, '6-20 file': 0, 'oltre 20 file': 0 }; for (const x of c) b[x.files <= 1 ? '1 file' : x.files <= 5 ? '2-5 file' : x.files <= 20 ? '6-20 file' : 'oltre 20 file']++; const tot = k => c.reduce((s, x) => s + x[k], 0); return { commits: c.length, averageFiles: +(tot('files') / c.length).toFixed(2), averageLinesChanged: +((tot('insertions') + tot('deletions')) / c.length).toFixed(1), distribution: b }; },
  },
  'git-bus-factor': {
    desc: 'Bus factor: quanti autori coprono il 50% dei commit (totale e per cartella principale)', usage: '[repo]',
    fn: (a) => { const r = repoOf(a), all = {}, dirs = {}; let cur = null; for (const l of git(r, ['log', '--name-only', '--format=@@%an']).split('\n')) { if (l.startsWith('@@')) { cur = l.slice(2); all[cur] = (all[cur] || 0) + 1; cur = { n: cur, seen: new Set() }; } else if (l && cur) { const d = l.includes('/') ? l.split('/')[0] : '(radice)'; if (!cur.seen.has(d)) { cur.seen.add(d); ((dirs[d] = dirs[d] || {})[cur.n] = (dirs[d][cur.n] || 0) + 1); } } } const bf = m => { const v = Object.values(m).sort((x, y) => y - x), tot = v.reduce((s, x) => s + x, 0); let acc = 0, n = 0; for (const x of v) { acc += x; n++; if (acc * 2 >= tot) break; } return n; }; return { overall: { busFactor: bf(all), authors: Object.keys(all).length }, byDirectory: Object.fromEntries(Object.entries(dirs).sort((x, y) => Object.values(y[1]).reduce((s, v) => s + v, 0) - Object.values(x[1]).reduce((s, v) => s + v, 0)).map(([d, m]) => [d, { busFactor: bf(m), authors: Object.keys(m).length }])) }; },
  },
  'git-dir-churn': {
    desc: 'Quanti commit toccano ogni cartella principale (dove si lavora di più)', usage: '[repo] [--since="3 months ago"]',
    fn: (a, o) => { const args = ['log', '--name-only', '--format=@@%h']; if (o.since && o.since !== true) args.push('--since=' + o.since); const c = {}; let seen = null; for (const l of git(repoOf(a), args).split('\n')) { if (l.startsWith('@@')) seen = new Set(); else if (l && seen) { const d = l.includes('/') ? l.split('/')[0] : '(radice)'; if (!seen.has(d)) { seen.add(d); c[d] = (c[d] || 0) + 1; } } } return Object.entries(c).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([d, n]) => `${String(n).padStart(5)}  ${d}`).join('\n') || 'Nessuna attività'; },
  },
  'git-weekly': {
    desc: 'Commit per settimana ISO con grafico a barre (--weeks=12)', usage: '[repo] [--weeks=12]',
    fn: (a, o) => { const c = {}; for (const t of git(repoOf(a), ['log', '--format=%aI']).split('\n').filter(Boolean)) { const w = isoWeek(t); c[w] = (c[w] || 0) + 1; } const keys = Object.keys(c).sort().slice(-(+o.weeks || 12)), mx = Math.max(1, ...keys.map(k => c[k])); return keys.map(k => `${k}  ${'█'.repeat(Math.max(1, Math.round(c[k] / mx * 30)))} ${c[k]}`).join('\n') || 'Nessun commit'; },
  },
};
