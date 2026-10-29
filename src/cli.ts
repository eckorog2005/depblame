import { parseArgs } from "node:util";
import { depblame } from "./core.js";
import { exitCodeFor, renderHuman, renderJson } from "./report.js";
import { loadState } from "./state.js";
import { UsageError } from "./usage-error.js";

export type Io = { stdout: (text: string) => void; stderr: (text: string) => void };

const USAGE = "usage: depblame --good <path> --bad <path> [--json] -- <test command>";
const USAGE_EXIT_CODE = 2;

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const args = parseCli(argv);
    const result = await depblame({
      good: loadState("--good", args.good),
      bad: loadState("--bad", args.bad),
      testCommand: args.testCommand,
    });
    io.stdout(args.json ? renderJson(result) : renderHuman(result));
    return exitCodeFor(result);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stderr(`depblame: ${error.message}\n${USAGE}\n`);
    return USAGE_EXIT_CODE;
  }
}

type CliArgs = { good: string; bad: string; json: boolean; testCommand: string[] };

function parseCli(argv: string[]): CliArgs {
  const separator = argv.indexOf("--");
  const testCommand = separator === -1 ? [] : argv.slice(separator + 1);
  let values;
  try {
    ({ values } = parseArgs({
      args: separator === -1 ? argv : argv.slice(0, separator),
      options: { good: { type: "string" }, bad: { type: "string" }, json: { type: "boolean", default: false } },
    }));
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  if (!values.good) throw new UsageError("missing --good <path>");
  if (!values.bad) throw new UsageError("missing --bad <path>");
  if (testCommand.length === 0) throw new UsageError("missing Test command after --");
  return { good: values.good, bad: values.bad, json: values.json, testCommand };
}
