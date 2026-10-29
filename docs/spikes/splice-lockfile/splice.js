// Spike: splice Change groups from a bad lockfile into a good one, then verify npm ci installs it exactly.
// Usage: node splice.js <dataDir> plan                 -> prints Change groups
//        node splice.js <dataDir> make <outDir> <groupId,...|ALL|NONE>
//        node splice.js <dataDir> verify <outDir>
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require(path.join(execSync('npm root -g').toString().trim(), 'npm/node_modules/semver'));

const [dataDir, cmd, ...rest] = process.argv.slice(2);
const read = (s, f) => JSON.parse(fs.readFileSync(path.join(dataDir, s, f), 'utf8'));
const good = { pkg: read('good', 'package.json'), lock: read('good', 'package-lock.json') };
const bad = { pkg: read('bad', 'package.json'), lock: read('bad', 'package-lock.json') };
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const nameOf = (p) => p.slice(p.lastIndexOf('node_modules/') + 'node_modules/'.length);
const same = (a, b) => a && b && a.version === b.version && a.resolved === b.resolved && a.integrity === b.integrity;

function resolveFrom(packages, from, dep) {
  let dir = from;
  for (;;) {
    const cand = (dir ? dir + '/' : '') + 'node_modules/' + dep;
    if (packages[cand]) return cand;
    if (!dir) return null;
    const i = dir.lastIndexOf('/node_modules/');
    dir = i === -1 ? '' : dir.slice(0, i);
  }
}

function edges(entry) {
  const out = {};
  for (const f of ['dependencies', 'optionalDependencies', 'peerDependencies']) Object.assign(out, entry[f] || {});
  return out;
}

// Ownership ignores peer edges and stops at other top-level packages, which own themselves.
function reachable(packages, start, stopAt) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const p = stack.pop();
    if (!p || seen.has(p) || !packages[p] || (p !== start && stopAt.has(p))) continue;
    seen.add(p);
    const e = packages[p];
    for (const dep of Object.keys({ ...e.dependencies, ...e.optionalDependencies })) stack.push(resolveFrom(packages, p, dep));
  }
  return seen;
}

function topLevelChanges() {
  const tops = [];
  for (const f of DEP_FIELDS)
    for (const [n, spec] of Object.entries(bad.pkg[f] || {}))
      if ((good.pkg[f] || {})[n] !== spec) tops.push(n);
  for (const f of DEP_FIELDS)
    for (const n of Object.keys(good.pkg[f] || {}))
      if (!(bad.pkg[f] || {})[n] && !tops.includes(n)) tops.push(n);
  return tops;
}

function plan() {
  const G = good.lock.packages, B = bad.lock.packages;
  const changed = new Set([...Object.keys(G), ...Object.keys(B)].filter((p) => p !== '' && !same(G[p], B[p])));
  const owners = new Map();
  const tops = topLevelChanges();
  const stopAt = new Set(tops.map((t) => 'node_modules/' + t));
  for (const t of tops) {
    const reach = new Set([...reachable(B, 'node_modules/' + t, stopAt), ...reachable(G, 'node_modules/' + t, stopAt)]);
    for (const p of reach) if (changed.has(p)) owners.set(p, [...(owners.get(p) || []), t]);
  }
  const groups = {};
  for (const p of changed) {
    const o = owners.get(p) || [];
    const id = o.length === 1 ? o[0] : o.length === 0 ? 'orphan:' + nameOf(p) : 'shared:' + nameOf(p);
    (groups[id] ||= []).push(p);
  }
  return { changed, groups };
}

function make(outDir, which) {
  const { groups } = plan();
  const ids = which === 'ALL' ? Object.keys(groups) : which === 'NONE' ? [] : which.split(',');
  for (const id of ids) if (!groups[id]) throw new Error('unknown group ' + id);
  const lock = structuredClone(good.lock);
  const pkg = structuredClone(good.pkg);
  for (const id of ids) {
    for (const p of groups[id]) {
      if (bad.lock.packages[p]) lock.packages[p] = bad.lock.packages[p];
      else delete lock.packages[p];
    }
    if (id.includes(':')) continue;
    for (const f of DEP_FIELDS) {
      const spec = (bad.pkg[f] || {})[id];
      for (const target of [pkg, lock.packages['']]) {
        if (spec) (target[f] ||= {})[id] = spec;
        else if (target[f]) delete target[f][id];
      }
    }
  }
  lock.packages = Object.fromEntries(Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b)));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  const problems = [];
  for (const [p, e] of Object.entries(lock.packages)) {
    const deps = { ...edges(e), ...(p === '' ? e.devDependencies : {}) };
    for (const [dep, range] of Object.entries(deps)) {
      const optional = (e.optionalDependencies || {})[dep] || (e.peerDependenciesMeta || {})[dep]?.optional;
      const r = resolveFrom(lock.packages, p, dep);
      if (!r) { if (!optional && !(e.peerDependencies || {})[dep]) problems.push(`${p || '<root>'} -> ${dep}: missing`); continue; }
      const v = lock.packages[r].version;
      if (v && semver.validRange(range) && !semver.satisfies(v, range, { includePrerelease: true }))
        problems.push(`${p || '<root>'} -> ${dep}@${range}: got ${v} at ${r}`);
    }
  }
  console.log(JSON.stringify({ groups: ids, entries: Object.keys(lock.packages).length, problems }, null, 2));
}

function verify(outDir) {
  const lock = JSON.parse(fs.readFileSync(path.join(outDir, 'package-lock.json'), 'utf8')).packages;
  const hidden = JSON.parse(fs.readFileSync(path.join(outDir, 'node_modules/.package-lock.json'), 'utf8')).packages;
  const mismatched = [], missing = [], extra = [];
  for (const [p, e] of Object.entries(lock)) {
    if (p === '') continue;
    if (!hidden[p]) missing.push(`${p}${e.optional ? ' (optional)' : ''}`);
    else if (!same(e, hidden[p])) mismatched.push(`${p}: lock ${e.version} hidden ${hidden[p].version}`);
  }
  for (const p of Object.keys(hidden)) if (!lock[p]) extra.push(p);
  const unexplained = missing.filter((m) => !m.includes('(optional)'));
  console.log(JSON.stringify({ exact: !mismatched.length && !extra.length && !unexplained.length,
    mismatched, extra, missingOptional: missing.length - unexplained.length, missingUnexplained: unexplained }, null, 2));
}

// Grows a selection of changed paths until every dependency edge in the spliced tree is satisfied,
// or no further changed path can fix the remaining violations.
function close(which) {
  const { changed, groups } = plan();
  const tops = topLevelChanges();
  const B = bad.lock.packages;
  let sel = new Set(which.split(',').flatMap((id) => groups[id]));
  const pkgTops = new Set(which.split(',').filter((id) => !id.includes(':')));
  for (let round = 0; ; round++) {
    const packages = structuredClone(good.lock.packages);
    for (const p of sel) { if (B[p]) packages[p] = B[p]; else delete packages[p]; }
    for (const t of tops) if (sel.has('node_modules/' + t)) pkgTops.add(t);
    const add = new Set();
    let unfixable = 0;
    for (const [p, e] of Object.entries(packages)) {
      if (p === '') continue;
      for (const [dep, range] of Object.entries({ ...e.dependencies, ...e.optionalDependencies, ...e.peerDependencies })) {
        const r = resolveFrom(packages, p, dep);
        const optional = (e.optionalDependencies || {})[dep] || (e.peerDependenciesMeta || {})[dep]?.optional || (e.peerDependencies || {})[dep];
        const ok = r ? !semver.validRange(range) || semver.satisfies(packages[r].version, range, { includePrerelease: true }) : optional;
        if (ok) continue;
        const fixes = [p, r, resolveFrom(B, p, dep), ...Object.keys(B).filter((q) => q.startsWith(p + '/node_modules/'))]
          .filter((q) => q && changed.has(q) && !sel.has(q));
        if (fixes.length) fixes.forEach((q) => add.add(q)); else unfixable++;
      }
    }
    if (!add.size) {
      console.log(JSON.stringify({ rounds: round, paths: sel.size, ofChanged: changed.size, topLevel: [...pkgTops], unfixable }));
      return [...pkgTops].join(',') + '|' + [...sel].join(',');
    }
    add.forEach((q) => sel.add(q));
  }
}

if (cmd === 'close') {
  const spec = close(rest[1]);
  const [ts, ps] = spec.split('|');
  const lock = structuredClone(good.lock);
  const pkg = structuredClone(good.pkg);
  for (const p of ps.split(',')) { if (bad.lock.packages[p]) lock.packages[p] = bad.lock.packages[p]; else delete lock.packages[p]; }
  for (const t of ts ? ts.split(',') : [])
    for (const f of DEP_FIELDS) {
      const s = (bad.pkg[f] || {})[t];
      for (const target of [pkg, lock.packages['']]) { if (s) (target[f] ||= {})[t] = s; else if (target[f]) delete target[f][t]; }
    }
  lock.packages = Object.fromEntries(Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b)));
  const outDir = rest[0];
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
} else if (cmd === 'plan') {
  const { changed, groups } = plan();
  console.log(`changed paths: ${changed.size}`);
  for (const [id, ps] of Object.entries(groups)) console.log(`${id} (${ps.length}): ${ps.slice(0, 6).join(', ')}${ps.length > 6 ? ' …' : ''}`);
} else if (cmd === 'make') make(rest[0], rest[1]);
else if (cmd === 'verify') verify(rest[0]);
