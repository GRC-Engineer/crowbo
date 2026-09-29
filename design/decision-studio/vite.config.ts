import { resolve } from "node:path";
import { defineConfig } from "vite";

// The production build is the public website. It writes straight into the
// repository's site/ directory, which Cloudflare serves as static assets
// (see wrangler.jsonc at the repository root). emptyOutDir must be explicit
// because the output directory sits outside this project folder; it removes
// stale files from earlier builds so site/ always mirrors this source.
//
// Two pages are built together and deploy together:
//   index.html         → crowbo.ai/          public landing page
//   studio/index.html  → crowbo.ai/studio/   Decision Studio
export default defineConfig({
  base: "./",
  build: {
    outDir: "../../site",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        studio: resolve(import.meta.dirname, "studio/index.html"),
      },
    },
  },
});
