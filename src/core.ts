import { computeChangeGroups, type ChangeGroup } from "./change-groups.js";
import type { State } from "./state.js";

export const SCHEMA_VERSION = 1;

export type Options = { good: State; bad: State; testCommand: string[] };

export type Outcome = "listed";

export type Result = {
  schemaVersion: typeof SCHEMA_VERSION;
  testCommand: string[];
  changeGroups: ChangeGroup[];
  warnings: string[];
  outcome: Outcome;
};

export async function depblame(options: Options): Promise<Result> {
  return {
    schemaVersion: SCHEMA_VERSION,
    testCommand: options.testCommand,
    changeGroups: await computeChangeGroups(options.good, options.bad),
    warnings: [],
    outcome: "listed",
  };
}
