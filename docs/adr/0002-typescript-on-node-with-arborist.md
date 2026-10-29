# TypeScript on Node, with Change groups computed by a pinned Arborist

depblame is written in TypeScript, runs on Node, and is distributed through npm (`npx depblame`). It needs npm on the machine to run `npm ci` anyway, so a single binary would save users nothing. Change groups are computed with `@npmcli/arborist`, the library npm itself uses to load and check a lockfile tree, instead of hand-written resolution logic. The spike's hand-written checker gave false positives on `overrides` and peer ranges. Arborist is pinned to an exact version and imported by one module only, so its API churn and the npm version it matches stay contained in one place. Arborist is only used to *predict* which Changes are coupled: the real `npm ci` in each Trial decides whether a Spliced state is valid, and if npm rejects a state we predicted was valid, the Trial is a skip, not a crash.

## Considered Options

- **Go single binary** (depbisect's choice): easier to distribute, but it would have to reimplement npm's tree rules, and the spike showed that this is where the bugs are.
- **Shelling out to npm for every validity check**: always correct, but each check costs seconds, and computing groups has to be cheap and needs no Trials.
