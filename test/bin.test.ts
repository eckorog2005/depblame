import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

const root = path.join(import.meta.dirname, "..");
const fixture = (name: string, side: "good" | "bad") => path.join(import.meta.dirname, "fixtures", name, side);
let tmp: string;
let bin: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "depblame-bin-test-"));
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  const tarball = execFileSync("npm", ["pack", "--pack-destination", tmp], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .at(-1)!;
  const app = path.join(tmp, "app");
  fs.mkdirSync(app);
  execFileSync("npm", ["install", "--offline", "--no-audit", "--no-fund", path.join(tmp, tarball)], {
    cwd: app,
    stdio: "ignore",
  });
  bin = path.join(app, "node_modules", ".bin", "depblame");
}, 60_000);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

it("the installed package runs as depblame", () => {
  const ok = spawnSync(bin, ["--good", fixture("bumped", "good"), "--bad", fixture("bumped", "bad"), "--", "npm", "test"], {
    encoding: "utf8",
  });
  expect(ok.status).toBe(0);
  expect(ok.stdout).toMatch(/bumped\s+left-pad\s+1\.0\.0 → 1\.3\.0/);

  const usage = spawnSync(bin, ["--good", fixture("bumped", "good")], { encoding: "utf8" });
  expect(usage.status).toBe(2);
  expect(usage.stderr).toMatch(/usage: depblame/);
});
