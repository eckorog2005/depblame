import type { Change } from "./changes.js";
import type { Outcome, Result } from "./core.js";

const EXIT_CODES: Record<Outcome, number> = { listed: 0 };

export const exitCodeFor = (result: Result) => EXIT_CODES[result.outcome];

function describeChange(change: Change): string {
  const [versions, where] =
    change.kind === "moved"
      ? [change.to, `${change.fromPath} → ${change.path}`]
      : [`${change.from ?? ""} → ${change.to ?? ""}`, change.path];
  return `    ${change.kind.padEnd(8)} ${change.name}  ${versions}  ${where}`;
}

const counted = (n: number, noun: string) => (n === 0 ? `No ${noun}s` : n === 1 ? `1 ${noun}` : `${n} ${noun}s`);

export function renderHuman(result: Result): string {
  const { changeGroups } = result;
  const changeCount = changeGroups.reduce((sum, group) => sum + group.changes.length, 0);
  const lines = [
    changeCount === 0
      ? "No Changes between the Good state and the Bad state."
      : `${counted(changeCount, "Change")} between the Good state and the Bad state, in ${counted(changeGroups.length, "Change group")}:`,
  ];
  for (const group of changeGroups) {
    lines.push(`  Change group ${group.id}`, ...group.changes.map(describeChange));
  }
  return `${lines.join("\n")}\n`;
}

export const renderJson = (result: Result) => `${JSON.stringify(result, null, 2)}\n`;
