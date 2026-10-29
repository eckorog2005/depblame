import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.join(import.meta.dirname, "..");

// ADR 0002: Arborist's API churn and the npm version it matches stay contained in one place.
it("is an exact-pinned dependency imported by a single module", () => {
  const { dependencies } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  expect(dependencies["@npmcli/arborist"]).toMatch(/^\d+\.\d+\.\d+$/);

  const importers = fs
    .readdirSync(path.join(root, "src"), { recursive: true, encoding: "utf8" })
    .filter((file) => /(?<!\.d)\.ts$/.test(file))
    .filter((file) => /from "@npmcli\/arborist"/.test(fs.readFileSync(path.join(root, "src", file), "utf8")));
  expect(importers).toEqual(["change-groups.ts"]);
});
