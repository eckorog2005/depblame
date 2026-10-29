declare module "@npmcli/arborist" {
  export interface Edge {
    readonly optional: boolean;
    readonly peer: boolean;
    readonly valid: boolean;
    satisfiedBy(node: Node): boolean;
  }

  export interface Node {
    readonly edgesOut: Map<string, Edge>;
    // Not a Map: Arborist's Inventory.has() takes a Node, not a location.
    readonly inventory: Pick<Map<string, Node>, "get" | "keys">;
  }

  export default class Arborist {
    constructor(options: { path: string });
    loadVirtual(): Promise<Node>;
  }
}
