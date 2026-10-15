import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");

/**
 * The rehearsal scripts run as their own entry points, which load the connector modules in an order
 * the test files never do. Each module must load first in a fresh process: an import cycle between a
 * connector and the connector list fails only there.
 */
describe("entry points load on their own", () => {
  for (const module of ["src/engine/tickets.ts", "src/engine/identity.ts", "src/engine/grc-platform.ts", "scripts/rehearsal/seed.ts", "scripts/rehearsal/record.ts"]) {
    it(module, () => {
      const out = execFileSync("bun", ["-e", `await import(${JSON.stringify(join(ROOT, module))}); console.log("loaded")`], { cwd: ROOT, encoding: "utf8", env: { ...process.env, SANDBOX_DOMAINS: "" } });
      expect(out.trim()).toBe("loaded");
    });
  }
});
