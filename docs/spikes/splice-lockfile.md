# Spike: does `npm ci` accept a spliced lockfile exactly?

Date: 2026-10-28. Result: **yes**. When `npm ci` accepts a spliced lockfile it installs that lockfile exactly and leaves it unchanged. When the splice is inconsistent it refuses rather than re-resolving.

This is the premise of depblame's positioning: every Trial installs a state built only from versions in the real Good and Bad lockfiles. depbisect and lockbisect both re-resolve instead.

## Setup

- npm **11.20.0**, Node **v26.12.1**, macOS.
- Subject: [RedHatInsights/insights-inventory-frontend#3740](https://github.com/RedHatInsights/insights-inventory-frontend/pull/3740), a Dependabot PR titled "bump the lint group with 9 updates", with failing CI. It changes only the root `package.json` and `package-lock.json`.
  - Good state: `3e183cde6864822061603ef792b2ffd50586bb52` (the parent commit of the PR's head).
  - Bad state: `9dcd745443d5934f735b8fd197e4a2a6948c766d` (the PR's head).
  - Both use `lockfileVersion` 3, with no workspaces, no links, and no `.npmrc`. The good lockfile has 2544 entries and the bad one has 2560. 168 lockfile paths differ between them.
- Every install was `npm ci --ignore-scripts --no-audit --no-fund` in a directory containing only `package.json` and `package-lock.json`.
- How each result was checked:
  - **Exact:** every lockfile entry except the root matches `node_modules/.package-lock.json` on `version`, `resolved` and `integrity`, with no extra entries. The only missing entries are optional ones (61 platform-specific packages in every run).
  - **Unchanged:** SHA-256 of `package-lock.json` (and `package.json`, in the t-series) taken before and after the install. The raw Bad state run was checked with `cmp` against the source files instead.

Scripts: [`splice-lockfile/splice.js`](splice-lockfile/splice.js) builds the spliced state (`make`, `close`) and verifies it (`verify`). [`splice-lockfile/run.sh`](splice-lockfile/run.sh) runs one Trial.

## Results

| Run | Selection | `npm ci` | Lockfile unchanged | Exact |
|---|---|---|---|---|
| t0 | none (Good state, control) | ok | yes | yes (2482 of 2544 entries installed; the root plus 61 optional entries are not) |
| t1 | `eslint-plugin-jest-dom` (1 path) | ok | yes | yes |
| t2 | `eslint-plugin-react` 7.37.5 moved from `node_modules/` to a path nested under `@redhat-cloud-services/eslint-config-redhat-cloud-services` (naive path splice) | rejected, `EUSAGE` | yes | n/a |
| **c2** | the same relocation, closed over dependency edges (12 paths, 3 rounds) | **ok** | **yes** | **yes** (2491 of 2553 entries) |
| t3 | `stylelint` group, including the hoist of `@keyv/bigmap` 1.3.1 to the root (naive) | rejected, `EUSAGE` | yes | n/a |
| t4 | the shared `keyv` Changes alone | rejected, `EUSAGE` (`Missing: keyv@4.5.4`; root `flat-cache` still needs v4) | yes | n/a |
| c3–c5 | `stylelint`, `keyv` and `eslint`, each closed over dependency edges (83–106 of the 168 paths) | `ERESOLVE` | yes | n/a |
| t5, t6 | `eslint` (naive) and all groups (t6 is identical to the Bad state) | `ERESOLVE` | yes | n/a |
| raw | the PR's own Bad state | `ERESOLVE` | yes | n/a |

## Findings

1. **No re-resolution and no rewrite, in any of the 12 runs.** A spliced lockfile is either installed exactly or refused. A refusal (`EUSAGE … not in sync`) arrives within seconds, before anything is downloaded, and lists every unsatisfied edge.
2. **A Change whose path differs between the lockfiles works, but only once the splice is closed.** Splicing paths one by one strands the packages nested under a relocated package. Adding the changed paths behind each violated edge, repeated until none are violated, produced an exact install.
3. **Assigning Changes to groups by ownership is wrong.** A shared transitive Change spliced on its own breaks unchanged packages that still depend on the old version (t4). Coupling has to be computed from the lockfile's dependency edges, and that includes peer edges, which npm also enforces (c3–c5).
4. **Closures can be large.** Closing over `stylelint` pulled in `eslint`. The closure rule in `splice.js` is a heuristic and may pull in more than strictly needed.
5. **The Bad state itself doesn't install.** `eslint@10.13.0` conflicts with the peer requirement `eslint@^9.39.5` of `@redhat-cloud-services/eslint-config-redhat-cloud-services@3.3.8`. That is most likely the PR's CI failure, but the CI logs aren't public so this is unconfirmed. npm's error already names the Culprit.

## Consequences for the design

- Change groups are connected components of coupled Changes, computed statically from the lockfile's dependency edges. See `GLOSSARY.md`.
- A Bad state that fails to install is reported as a finding (the package npm names), not treated as an abort.
- Bisecting on install success instead of on the Test command is on the roadmap. It reuses the same Change groups.

## Limits

One PR, one npm version, one platform. npm ≥ 7 is assumed; older npm and other lockfile versions are untested. The Test command was never run, because the spike only covers installing.
