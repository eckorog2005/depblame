import type { LockEntry, State } from "./state.js";

export type ChangeKind = "added" | "removed" | "bumped" | "moved";

export type Change = {
  name: string;
  kind: ChangeKind;
  path: string;
  fromPath?: string;
  from: string | null;
  to: string | null;
};

const nameAt = (lockPath: string) => lockPath.slice(lockPath.lastIndexOf("node_modules/") + "node_modules/".length);

const sameEntry = (a: LockEntry, b: LockEntry) =>
  a.version === b.version && a.resolved === b.resolved && a.integrity === b.integrity;

export function computeChanges(good: State, bad: State): Change[] {
  const goodPackages = good.lockfile.packages;
  const badPackages = bad.lockfile.packages;
  const lockPaths = [...new Set([...Object.keys(goodPackages), ...Object.keys(badPackages)])].sort();
  const changes: Change[] = [];
  for (const lockPath of lockPaths) {
    const goodEntry = goodPackages[lockPath];
    const badEntry = badPackages[lockPath];
    if (lockPath === "" || (goodEntry && badEntry && sameEntry(goodEntry, badEntry))) continue;
    changes.push({
      name: nameAt(lockPath),
      kind: !goodEntry ? "added" : !badEntry ? "removed" : "bumped",
      path: lockPath,
      from: goodEntry?.version ?? null,
      to: badEntry?.version ?? null,
    });
  }
  return pairMoves(changes, goodPackages, badPackages);
}

function pairMoves(
  changes: Change[],
  goodPackages: Record<string, LockEntry>,
  badPackages: Record<string, LockEntry>,
): Change[] {
  const unpairedRemovals = changes.filter((c) => c.kind === "removed");
  const paired = new Set<Change>();
  const result: Change[] = [];
  for (const change of changes) {
    if (change.kind === "added") {
      const removal = unpairedRemovals.find(
        (r) => r.name === change.name && sameEntry(goodPackages[r.path]!, badPackages[change.path]!),
      );
      if (removal) {
        unpairedRemovals.splice(unpairedRemovals.indexOf(removal), 1);
        paired.add(removal);
        result.push({ ...change, kind: "moved", fromPath: removal.path, from: removal.from });
        continue;
      }
    }
    result.push(change);
  }
  return result.filter((c) => !paired.has(c));
}
