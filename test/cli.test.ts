import { describe, expect, it } from "vitest";
import path from "node:path";
import { run } from "../src/cli.js";

const fixture = (name: string, side: "good" | "bad") =>
  path.join(import.meta.dirname, "fixtures", name, side);

async function depblame(argv: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = await run(argv, {
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
  });
  return { exitCode, stdout, stderr };
}

const between = (name: string, ...extra: string[]) =>
  depblame(["--good", fixture(name, "good"), "--bad", fixture(name, "bad"), ...extra, "--", "npm", "test"]);

describe("listing Changes", () => {
  it("lists a version bump with its lockfile path and exact versions", async () => {
    const { exitCode, stdout } = await between("bumped");

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/bumped\s+left-pad\s+1\.0\.0 → 1\.3\.0\s+node_modules\/left-pad/);
  });

  it("lists an added package and leaves unchanged ones out", async () => {
    const { exitCode, stdout } = await between("added");

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/added\s+is-even\s+→ 1\.0\.0\s+node_modules\/is-even/);
    expect(stdout).not.toContain("left-pad");
  });

  it("lists a removed package", async () => {
    const { exitCode, stdout } = await between("removed");

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/removed\s+is-even\s+1\.0\.0 →\s+node_modules\/is-even/);
  });

  it("lists a package that moved in the tree as one Change with both lockfile paths", async () => {
    const { exitCode, stdout } = await between("moved");

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(
      /moved\s+eslint-plugin-react\s+7\.37\.5\s+node_modules\/eslint-plugin-react → node_modules\/@acme\/lint-config\/node_modules\/eslint-plugin-react/,
    );
    expect(stdout).not.toMatch(/added|removed/);
  });

  it("says how many Changes there are", async () => {
    const { stdout } = await between("bumped");

    expect(stdout).toMatch(/^1 Change between the Good state and the Bad state/);
  });

  it("says so when the states have no Changes", async () => {
    const good = fixture("bumped", "good");
    const { exitCode, stdout } = await depblame(["--good", good, "--bad", good, "--", "npm", "test"]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^No Changes between the Good state and the Bad state/);
  });
});

describe("--json", () => {
  it("prints the Changes as JSON with a schemaVersion", async () => {
    const { exitCode, stdout } = await between("moved", "--json");

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 1,
      changes: [
        {
          name: "eslint-plugin-react",
          kind: "moved",
          fromPath: "node_modules/eslint-plugin-react",
          path: "node_modules/@acme/lint-config/node_modules/eslint-plugin-react",
          from: "7.37.5",
          to: "7.37.5",
        },
      ],
      warnings: [],
    });
  });
});

describe("Test command", () => {
  it("is everything after --, with its arguments preserved", async () => {
    const testCommand = ["npx", "vitest", "run", "--good", "-t", "two words", "--"];
    const { stdout } = await depblame([
      "--json",
      "--good",
      fixture("bumped", "good"),
      "--bad",
      fixture("bumped", "bad"),
      "--",
      ...testCommand,
    ]);

    expect(JSON.parse(stdout).testCommand).toEqual(testCommand);
  });
});

describe("usage errors exit 2 before doing any work", () => {
  const good = fixture("bumped", "good");
  const bad = fixture("bumped", "bad");

  it.each([
    ["--good is missing", ["--bad", bad, "--", "npm", "test"], /--good/],
    ["--bad is missing", ["--good", good, "--", "npm", "test"], /--bad/],
    ["there is no --", ["--good", good, "--bad", bad], /Test command/],
    ["nothing follows --", ["--good", good, "--bad", bad, "--"], /Test command/],
    ["an unknown option is given", ["--good", good, "--bad", bad, "--nope", "--", "npm", "test"], /--nope/],
    ["a stray argument precedes --", ["--good", good, "--bad", bad, "npm", "--", "test"], /npm/],
  ])("when %s", async (_, argv, message) => {
    const { exitCode, stdout, stderr } = await depblame(argv);

    expect(exitCode).toBe(2);
    expect(stderr).toMatch(message);
    expect(stdout).toBe("");
  });

  const invalid = (name: string) => path.join(import.meta.dirname, "fixtures", "invalid", name);

  it.each([
    ["the path doesn't exist", invalid("does-not-exist"), /does-not-exist.*doesn't exist/],
    ["package.json is missing", invalid("no-package-json"), /no package\.json/],
    ["package-lock.json is missing", invalid("no-lockfile"), /no package-lock\.json/],
    ["the lockfile is v1", invalid("v1"), /lockfile v1 isn't supported/],
    ["the lockfile isn't valid JSON", invalid("not-json"), /package-lock\.json.*valid JSON/],
    ["the lockfile isn't a JSON object", invalid("lockfile-null"), /package-lock\.json.*JSON object/],
    ["package.json isn't a JSON object", invalid("package-json-array"), /package\.json.*JSON object/],
    ["only a yarn lockfile is present", invalid("yarn"), /yarn\.lock.*only npm package-lock\.json is supported/],
    ["only a pnpm lockfile is present", invalid("pnpm"), /pnpm-lock\.yaml.*only npm package-lock\.json is supported/],
    ["the state uses workspaces", invalid("workspaces"), /workspaces aren't supported/],
  ])("when the Good state is invalid because %s", async (_, goodPath, message) => {
    const { exitCode, stdout, stderr } = await depblame(["--good", goodPath, "--bad", bad, "--", "npm", "test"]);

    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--good/);
    expect(stderr).toMatch(message);
    expect(stdout).toBe("");
  });

  it("when the Bad state is invalid", async () => {
    const { exitCode, stderr } = await depblame(["--good", good, "--bad", invalid("v1"), "--", "npm", "test"]);

    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--bad.*lockfile v1 isn't supported/);
  });
});

describe("state paths", () => {
  it("accept a path to either file of the state instead of its directory", async () => {
    const { exitCode, stdout } = await depblame([
      "--good",
      path.join(fixture("bumped", "good"), "package.json"),
      "--bad",
      path.join(fixture("bumped", "bad"), "package-lock.json"),
      "--",
      "npm",
      "test",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/bumped\s+left-pad\s+1\.0\.0 → 1\.3\.0/);
  });
});
