import Arborist, { type Node } from "@npmcli/arborist";
import { computeChanges, type Change } from "./changes.js";
import type { State } from "./state.js";

export type ChangeGroup = { id: number; changes: Change[] };

// Above this, checking every combination costs more than coupling the Changes outright.
const MAX_CHECKED_CHANGES = 10;

type Trees = { good: Node; bad: Node; changeAt: Map<string, number> };

export async function computeChangeGroups(good: State, bad: State): Promise<ChangeGroup[]> {
  const changes = computeChanges(good, bad);
  const [goodTree, badTree] = await Promise.all([loadTree(good), loadTree(bad)]);
  const changeAt = new Map<string, number>();
  changes.forEach((change, i) => {
    changeAt.set(change.path, i);
    if (change.fromPath) changeAt.set(change.fromPath, i);
  });
  const trees: Trees = { good: goodTree, bad: badTree, changeAt };
  const groups = new DisjointSets(changes.length);

  for (const [lockPath, i] of changeAt) {
    const parent = parentPath(lockPath);
    if (parent === null) continue;
    const parentChange = changeAt.get(parent);
    const parentInBoth = goodTree.inventory.get(parent) && badTree.inventory.get(parent);
    if (parentChange !== undefined && !parentInBoth) groups.union([i, parentChange]);
  }

  const sourcePaths = new Set([...goodTree.inventory.keys(), ...badTree.inventory.keys()]);
  for (const source of sourcePaths) {
    const depNames = new Set(
      [goodTree, badTree].flatMap((tree) => [...(tree.inventory.get(source)?.edgesOut.keys() ?? [])]),
    );
    for (const depName of depNames) {
      const coupled = changesCoupledBy(trees, source, depName);
      if (coupled.length > 1) groups.union(coupled);
    }
  }

  const byRoot = new Map<number, Change[]>();
  changes.forEach((change, i) => {
    const root = groups.find(i);
    byRoot.set(root, [...(byRoot.get(root) ?? []), change]);
  });
  return [...byRoot.values()].map((groupChanges, i) => ({ id: i + 1, changes: groupChanges }));
}

const loadTree = (state: State) => new Arborist({ path: state.source }).loadVirtual();

function changesCoupledBy(trees: Trees, source: string, depName: string): number[] {
  const { good, bad, changeAt } = trees;
  const sourceChange = changeAt.get(source === "" ? `node_modules/${depName}` : source);
  const walk: string[] = [];
  for (const candidate of resolutionWalk(source, depName)) {
    walk.push(candidate);
    if (!changeAt.has(candidate) && good.inventory.get(candidate)) break;
  }
  const involved = [
    ...new Set([sourceChange, ...walk.map((candidate) => changeAt.get(candidate))].filter((i) => i !== undefined)),
  ];
  if (involved.length < 2) return [];
  if (involved.length > MAX_CHECKED_CHANGES) return involved;

  for (let combination = 0; combination < 2 ** involved.length; combination++) {
    const applied = new Set(involved.filter((_, bit) => combination & (1 << bit)));
    const treeFor = (i: number | undefined) => (i !== undefined && applied.has(i) ? bad : good);
    const targets = walk.map((candidate) => treeFor(changeAt.get(candidate)).inventory.get(candidate));
    const targetIndex = targets.findIndex((node) => node !== undefined);
    const target = targets[targetIndex];
    const sourceNodes =
      sourceChange === undefined
        ? [good.inventory.get(source), bad.inventory.get(source)]
        : [treeFor(sourceChange).inventory.get(source)];
    for (const sourceNode of sourceNodes) {
      const edge = sourceNode?.edgesOut.get(depName);
      // An edge already broken in its own state can't be fixed by grouping; npm ci will reject it.
      if (!edge?.valid) continue;
      // Arborist rejects a peer that resolves to the package's own child ("PEER LOCAL").
      const peerLocal = edge.peer && source !== "" && targetIndex === 0;
      if (peerLocal || !(target ? edge.satisfiedBy(target) : edge.optional)) return involved;
    }
  }
  return [];
}

function* resolutionWalk(from: string, name: string): Generator<string> {
  for (let dir: string | null = from; dir !== null; dir = parentPath(dir)) {
    yield dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
  }
}

function parentPath(lockPath: string): string | null {
  if (lockPath === "") return null;
  const i = lockPath.lastIndexOf("/node_modules/");
  return i === -1 ? "" : lockPath.slice(0, i);
}

class DisjointSets {
  readonly #parent: number[];

  constructor(size: number) {
    this.#parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    while (this.#parent[i] !== i) i = this.#parent[i] = this.#parent[this.#parent[i]!]!;
    return i;
  }

  union([first, ...rest]: number[]) {
    for (const i of rest) this.#parent[this.find(i)] = this.find(first!);
  }
}
