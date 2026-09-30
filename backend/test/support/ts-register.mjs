// Lets a plain `node --experimental-transform-types` child process import this repository's
// TypeScript sources, whose relative imports omit the `.ts` extension.
import { register } from "node:module";

register("./ts-hook.mjs", import.meta.url);
