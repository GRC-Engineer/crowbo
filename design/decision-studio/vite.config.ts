import { defineConfig } from "vite";

// The production build is the public website. It writes straight into the
// repository's site/ directory, which Cloudflare serves as static assets
// (see wrangler.jsonc at the repository root). emptyOutDir must be explicit
// because the output directory sits outside this project folder; it removes
// stale files from earlier builds so site/ always mirrors this source.
export default defineConfig({
  base: "./",
  build: {
    outDir: "../../site",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
