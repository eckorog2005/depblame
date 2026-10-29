import fs from "node:fs";
import path from "node:path";
import { UsageError } from "./usage-error.js";

export type LockEntry = {
  version?: string;
  resolved?: string;
  integrity?: string;
  [field: string]: unknown;
};

export type State = {
  source: string;
  packageJson: Record<string, unknown>;
  lockfile: { lockfileVersion: number; packages: Record<string, LockEntry> };
};

const OTHER_LOCKFILES = ["yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"];

export function loadState(label: string, input: string): State {
  const fail = (problem: string): never => {
    throw new UsageError(`${label} ${input}: ${problem}`);
  };
  if (!fs.existsSync(input)) fail("path doesn't exist (git refs aren't supported yet)");
  const dir = fs.statSync(input).isDirectory() ? input : path.dirname(input);
  const has = (file: string) => fs.existsSync(path.join(dir, file));
  const readJson = (file: string) => {
    let value;
    try {
      value = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch {
      return fail(`${file} isn't valid JSON`);
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${file} isn't a JSON object`);
    return value;
  };

  if (!has("package.json")) fail(`no package.json in ${dir}`);
  if (!has("package-lock.json")) {
    const other = OTHER_LOCKFILES.find(has);
    fail(other ? `found ${other}, but only npm package-lock.json is supported` : `no package-lock.json in ${dir}`);
  }
  const packageJson = readJson("package.json");
  const lockfile = readJson("package-lock.json");
  if (!(lockfile.lockfileVersion >= 2) || typeof lockfile.packages !== "object") {
    fail("lockfile v1 isn't supported; regenerate it with npm 7 or later (lockfileVersion 2 or 3)");
  }
  if (packageJson.workspaces || lockfile.packages[""]?.workspaces) fail("workspaces aren't supported");
  return { source: dir, packageJson, lockfile };
}
