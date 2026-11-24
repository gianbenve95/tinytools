'use strict';
const { execFileSync } = require('child_process');
const git = (repo, args, input) => { try { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', input, maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { const m = String(e.stderr || e.message).trim().split('\n')[0]; throw new Error(/not a git repository/i.test(m) ? 'Non è un repository Git: ' + repo : /ENOENT/.test(String(e.code)) ? 'git non è installato' : m); } };
const repoOf = a => { const r = (a && a[0]) || '.'; git(r, ['rev-parse', '--git-dir']); return r; };
const optRepo = o => { const r = o.repo && o.repo !== true ? o.repo : '.'; git(r, ['rev-parse', '--git-dir']); return r; };
module.exports = { git, repoOf, optRepo };
