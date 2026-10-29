import { computeChanges, type Change } from "./changes.js";
import type { State } from "./state.js";

export const SCHEMA_VERSION = 1;

export type Options = { good: State; bad: State; testCommand: string[] };

export type Outcome = "listed";

export type Result = {
  schemaVersion: typeof SCHEMA_VERSION;
  testCommand: string[];
  changes: Change[];
  warnings: string[];
  outcome: Outcome;
};

export async function depblame(options: Options): Promise<Result> {
  return {
    schemaVersion: SCHEMA_VERSION,
    testCommand: options.testCommand,
    changes: computeChanges(options.good, options.bad),
    warnings: [],
    outcome: "listed",
  };
}
