# depblame

Like `git blame`, but for dependencies. When a batch dependency update breaks your build, depblame finds the exact package update that caused it.

> Status: pre-development. Design settled for the MVP; see [Decisions](#decisions).

## Problem

Your build passed last week. Since then a Dependabot or Renovate PR, or a plain `npm update`, changed 40 packages in the lockfile, many of them transitive, and now the tests fail, or `npm ci` refuses to install at all. Finding the culprit by hand means reverting packages one at a time and reinstalling over and over.

## Core idea

Given a known-good state and a known-bad state (each a `package.json` plus `package-lock.json`):

1. Compute the changes between them (packages added, removed, bumped or moved in the tree), and group them into change groups: sets of changes that can only be applied together.
2. Bisect over the change groups: splice half of them from the bad lockfile into the good one, install it with `npm ci`, run the user's test command, and narrow down based on the result.
3. Report the culprit, for example: `axios 1.7.9 → 1.8.0 breaks "npm test"`.

This needs about log2(n) installs instead of n.

```
depblame --good main --bad HEAD -- npm test
```

## Differentiator: exact states

Other tools build each intermediate state by re-resolving: they revert specs in `package.json` and let `npm install` pick versions. That can install versions that exist in neither lockfile.

depblame never re-resolves. Every trial installs a lockfile spliced from the two real lockfiles, so every version it tests is a version you actually had, and the same trial installs the same tree every time. A [spike](docs/spikes/splice-lockfile.md) confirmed that `npm ci` installs such a spliced lockfile exactly, leaves it unchanged, and refuses an inconsistent one rather than quietly re-resolving it. See [ADR 0001](docs/adr/0001-exact-spliced-states.md).

When the bad state doesn't install at all, which is common with peer-dependency conflicts in Dependabot PRs, depblame reports the conflict and the package npm names, without needing a bisect.

## MVP scope

npm `package-lock.json` (lockfile v2/v3) only. Workspaces are rejected with a clear error.

**Slice 1: diagnose**
- [ ] Parse both lockfiles, compute the change groups, and print them before doing anything else. If there is only one change group, say so and stop after the endpoint check, because bisecting can't narrow it further.
- [ ] Install both endpoints. If the bad state fails to install, report why: the conflict and package for `ERESOLVE`, a clean summary for any other install failure.

**Slice 2: bisect**
- [ ] Check both endpoints before bisecting: the good state must pass and the bad state must fail.
- [ ] Bisect loop over change groups. Exit 0 = pass, 125 = skip, anything else = fail, as in `git bisect run`. A spliced state that `npm ci` rejects counts as a skip.
- [ ] `--runs N`: run the test command N times per state. A state passes only if every run passes and fails only if every run fails; a mix stops the bisect and reports it as flaky.
- [ ] Assume one culprit. When the results are inconsistent, report that an interaction between the remaining groups is suspected instead of guessing.
- [ ] Report the culprit's changes with exact from → to versions, plus `--json` output with a `schemaVersion` field.

**Inputs and isolation**
- [ ] `--good` and `--bad` accept a git ref or a file path (a path if it exists on disk, otherwise a ref).
- [ ] Only the dependency fields of `package.json` and the lockfile change between trials. All other source code comes from the bad state. Warn if the two refs also differ elsewhere, or if `overrides` or `.npmrc` changed.
- [ ] Trials run in a `depblame-` prefixed detached git worktree in the OS temp directory, at the bad ref (or at `HEAD` with the bad files copied in). Stale `depblame-` worktrees are pruned at startup, the worktree is removed on exit, and the user's npm cache is shared across trials. The user's checkout is never touched.

**Exit codes:** 0 culprit found · 1 inconclusive, interaction suspected, flaky, or only one change group · 2 usage error · 3 good state fails (doesn't install or doesn't pass) · 4 bad state doesn't install

## Later / nice to have

- Bisect install failures: use install success instead of the test command as pass or fail, over the same change groups
- GitHub Action that runs on failing Dependabot or Renovate PRs and posts a comment naming the culprit, linking its changelog, and suggesting a pin
- Workspaces and monorepos
- More ecosystems: pnpm, yarn, pip/uv/poetry, Cargo, Go modules
- Handle interacting changes, where only a combination of updates breaks the build
- Bisect inside a change group when the group allows it. Directed coupling (subsets that include everything their members depend on) could make this possible without re-resolving
- Cache installs between bisect steps
- Link the culprit's changelog, release notes or diff (for example, via npm and GitHub APIs)

## Hard problems to design for

- **Dependency coupling:** some changes can't be applied independently. For example, package A 2.0 requires B 3.0, so they must move together. Change groups are computed from the lockfiles' dependency edges, peer dependencies included, so a subset of whole groups stays installable. Groups can be large; for example, a major ESLint bump can drag most of a lint toolchain into one group.
- **Lockfile validity:** answered by the [spike](docs/spikes/splice-lockfile.md). `npm ci` accepts a consistent spliced lockfile without re-resolving and rejects an inconsistent one. Arborist predicts which states are valid, and the real `npm ci` has the final say ([ADR 0002](docs/adr/0002-typescript-on-node-with-arborist.md)).
- **Non-determinism:** flaky tests can send the bisect down the wrong path. Both endpoints are checked first, and `--runs N` guards every state.
- **Install cost:** each step is a full install, so speed and caching matter.

## Non-goals (for now)

- Fixing the breakage automatically
- Security scanning (Dependabot, Socket, zizmor and others cover this)
- Bisecting your own code changes (use `git bisect`)

## Prior art

| Project | Notes |
|---|---|
| [depbisect](https://github.com/skyneticist/depbisect) | Go single binary, 8 ecosystems, ships a GitHub Action, `--runs N`, minimal-set proof. Bisects direct dependencies only and re-resolves every trial. Very active. |
| [lockbisect](https://github.com/BenMalaga/lockbisect) | npm only. Bisects every lockfile entry by forcing versions through `overrides`, which re-resolves. No flake handling, no CI. Quiet since July 2026. |
| `git bisect` | Bisects commits, not the individual changes inside one lockfile commit. |

## Decisions

The questions this README used to leave open are now settled:

- **Language and stack:** TypeScript on Node, distributed through npm, with a pinned `@npmcli/arborist` ([ADR 0002](docs/adr/0002-typescript-on-node-with-arborist.md)).
- **First ecosystem:** npm, lockfile v2/v3.
- **Granularity:** change groups, i.e. connected components of coupled changes, with every lockfile entry taken into account.
- **Delivery:** CLI first. The GitHub Action and PR comment come later, because the differentiator is exact states, not the Action.

Terminology is defined in [GLOSSARY.md](GLOSSARY.md).

## License

TBD
