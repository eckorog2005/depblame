# depblame

Like `git blame`, but for dependencies. When a batch dependency update breaks your build, depblame finds the exact package update that caused it.

> Status: pre-development. Language and stack not yet chosen.

## Problem

Your build passed last week. Since then a Dependabot or Renovate PR, or a plain `npm update`, changed 40 packages in the lockfile, many of them transitive, and now the tests fail. Finding the culprit by hand means reverting packages one at a time and reinstalling over and over.

## Core idea

Given a known-good lockfile and a known-bad lockfile:

1. Compute the set of changed packages (added, removed, version bumped).
2. Bisect the changes: apply half of them, install, run the user's test command, and narrow down based on the result.
3. Report the minimal culprit, for example: `axios 1.7.9 → 1.8.0 breaks "npm test"`.

This needs about log2(n) installs instead of n.

```
depblame --good main --bad HEAD -- npm test
```

## Differentiator: CI-native

Similar CLIs already exist (see Prior art). depblame's focus is on running automatically where the breakage happens:

- A GitHub Action that triggers when a Dependabot or Renovate PR fails CI
- It bisects automatically and posts a PR comment naming the culprit, linking its changelog or release notes, and suggesting the fix (pin or exclude that package)

## MVP scope

- [ ] Parse two lockfiles and compute the changed packages (start with one ecosystem, probably npm `package-lock.json`)
- [ ] Build an intermediate lockfile from any subset of the changes
- [ ] Bisect loop: install, then run the user-supplied command and use its exit code as pass or fail
- [ ] Report the culprit clearly on the CLI
- [ ] Take good and bad states from git refs or from file paths
- [ ] Work in an isolated directory or worktree so the user's checkout is never touched

## Later / nice to have

- GitHub Action and PR comment bot
- More ecosystems: pnpm, yarn, pip/uv/poetry, Cargo, Go modules
- Handle interacting changes, where only a combination of updates breaks the build
- Detect flaky tests (re-run to confirm pass or fail before trusting a result)
- Cache installs between bisect steps
- Link the culprit's changelog, release notes or diff (for example, via npm and GitHub APIs)

## Hard problems to design for

- **Dependency coupling:** some changes can't be applied independently. For example, package A 2.0 requires B 3.0, so they must move together. Subsets must stay installable.
- **Lockfile validity:** a hand-built intermediate lockfile must be accepted by the package manager without re-resolving.
- **Transitive changes:** a bump of a top-level package can bring many transitive changes with it. Decide whether to bisect at the top level, transitively, or both.
- **Non-determinism:** flaky tests can send the bisect down the wrong path.
- **Install cost:** each step is a full install, so speed and caching matter.

## Non-goals (for now)

- Fixing the breakage automatically
- Security scanning (Dependabot, Socket, zizmor and others cover this)
- Bisecting your own code changes (use `git bisect`)

## Prior art

| Project | Notes |
|---|---|
| [depbisect](https://github.com/skyneticist/depbisect) | Multi-ecosystem CLI with minimal-set proof. Created June 2026, early stage. |
| [lockbisect](https://github.com/BenMalaga/lockbisect) | Bisects inside a lockfile diff. Created June 2026, early stage. |
| `git bisect` | Bisects commits, not the individual changes inside one lockfile commit. |

Study both before building. depblame should aim to be the best CI-integrated option, not another CLI that does the same thing.

## Open questions

- **Language and stack:** not yet decided. Single-binary distribution would make it easy to run in CI.
- **First ecosystem:** npm, or something less well served?
- **Granularity:** top-level dependencies or every lockfile entry?
- **Delivery:** CLI first and then the Action, or the Action first?

## License

TBD
