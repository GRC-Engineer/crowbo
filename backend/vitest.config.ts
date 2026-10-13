import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "cloudflare:workers": join(__dirname, "test/stubs/cloudflare-workers.ts") } },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/worker/**"],
    // Inline so the "cloudflare:workers" import inside the OAuth provider resolves to the stub.
    server: { deps: { inline: ["@cloudflare/workers-oauth-provider"] } },
  },
});
