# depblame

Finds which dependency update between two lockfile states causes a test command to fail.

## Language

### States

**Good state**:
The dependency state in which the Test command passes.
_Avoid_: baseline, before

**Bad state**:
The dependency state in which the Test command fails, or which fails to install.
_Avoid_: target, after

**Spliced state**:
The `package.json` and lockfile pair built from the Good state with a subset of Change groups applied from the Bad state.
_Avoid_: hybrid lockfile, intermediate lockfile, candidate

### Changes

**Change**:
One package moving between the Good state and the Bad state: added, removed, version bumped, or moved to a different place in the dependency tree.
_Avoid_: diff, update, bump

**Change group**:
A set of Changes that can only be applied together, because applying any part of it alone would leave a dependency unsatisfied. Change groups are derived from the two lockfiles alone and are the unit that is bisected.
_Avoid_: batch, bundle

**Splice**:
Building a Spliced state from a subset of Change groups.
_Avoid_: merge, patch, apply

### Bisecting

**Test command**:
The user-supplied command whose exit code decides whether a state passes or fails.
_Avoid_: check, script

**Trial**:
One install and one run of the Test command against a Spliced state.
_Avoid_: step, probe, run

**Culprit**:
The Change group, or single Change, shown to make the Test command fail or the install fail.
_Avoid_: offender, breaker
