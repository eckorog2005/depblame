import type { Change } from "./changes.js";
import type { Outcome, Result } from "./core.js";

const EXIT_CODES: Record<Outcome, number> = { listed: 0 };

export const exitCodeFor = (result: Result) => EXIT_CODES[result.outcome];

function describeChange(change: Change): string {
  const [versions, where] =
    change.kind === "moved"
      ? [change.to, `${change.fromPath} → ${change.path}`]
      : [`${change.from ?? ""} → ${change.to ?? ""}`, change.path];
  return `  ${change.kind.padEnd(8)} ${change.name}  ${versions}  ${where}`;
}

export function renderHuman(result: Result): string {
  const { changes } = result;
  const count = changes.length === 0 ? "No Changes" : changes.length === 1 ? "1 Change" : `${changes.length} Changes`;
  const lines = [`${count} between the Good state and the Bad state${changes.length ? ":" : "."}`];
  lines.push(...changes.map(describeChange));
  return `${lines.join("\n")}\n`;
}

export const renderJson = (result: Result) => `${JSON.stringify(result, null, 2)}\n`;
