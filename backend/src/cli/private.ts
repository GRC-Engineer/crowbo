// Private local files for the operator CLI, ported from the pilot's runtime.py. Inputs and
// outputs may hold evidence, so they must live outside any Git checkout with owner-only modes.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, realpathSync, statSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CrowboError } from "../domain/errors";

/** The development checkout this CLI ships in (src/cli -> backend -> repository root). */
export const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Python `Path.expanduser().resolve()`: absolute, with symlinks resolved as far as the path exists. */
function resolvePath(path: string): string {
  const expanded = path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  let head = resolve(expanded);
  const tail: string[] = [];
  for (;;) {
    try {
      return join(realpathSync(head), ...tail);
    } catch {
      const parent = dirname(head);
      if (parent === head) return join(head, ...tail);
      tail.unshift(basename(head));
      head = parent;
    }
  }
}

const within = (path: string, root: string) => path === root || path.startsWith(root.endsWith("/") ? root : root + "/");

/** Reject paths inside this development checkout or any other Git checkout. */
export function outsideCheckout(path: string): string {
  const resolved = resolvePath(path);
  if (within(resolved, resolvePath(CHECKOUT))) throw new CrowboError("Private runtime files must be outside the development checkout");
  for (let parent = resolved; ; parent = dirname(parent)) {
    if (existsSync(join(parent, ".git"))) throw new CrowboError("Private runtime files must be outside Git checkouts");
    if (dirname(parent) === parent) break;
  }
  return resolved;
}

/** Read an owner-only (chmod 600) input outside checkouts, refusing more than `maxBytes`. */
export function readPrivate(path: string, maxBytes = 1_000_000): Buffer {
  const resolved = outsideCheckout(path);
  const fd = openSync(resolved, "r");
  try {
    if (fstatSync(fd).mode & 0o077) throw new CrowboError("Private input requires owner-only file permissions (chmod 600)");
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    for (;;) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
      if (length > maxBytes) throw new CrowboError("Private input exceeds the configured size limit");
    }
    return buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}

/** Create (mode 700) or check the private runtime directory for reports. */
export function runtimeDirectory(path: string): string {
  const directory = outsideCheckout(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (statSync(directory).mode & 0o077) throw new CrowboError("Runtime directory requires owner-only permissions (chmod 700)");
  return directory;
}

/** Write a new owner-only file outside checkouts; never overwrites (O_EXCL, raises EEXIST). */
export function writePrivateNew(path: string, text: string): string {
  const resolved = outsideCheckout(path);
  const fd = openSync(resolved, "wx", 0o600);
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
  return resolved;
}

/** Python `write_report`: a fresh `<operation>-<12 hex>.json` in the runtime directory. */
export function writeReport(directory: string, name: string, value: unknown): string {
  return writePrivateNew(join(directory, name), JSON.stringify(value, null, 2));
}

export function reportName(operation: string): string {
  return `${operation}-${randomUUID().replaceAll("-", "").slice(0, 12)}.json`;
}

/** Python `secret()` validation: 16-2048 ASCII characters without whitespace. */
export function validSecret(value: string | null | undefined): value is string {
  return !!value && value.length >= 16 && value.length <= 2048 && /^[\x00-\x7f]*$/.test(value) && !/[\s\x1c-\x1f]/.test(value);
}

/** Read the API token from the macOS Keychain (account `crowbo`, service `crowbo/api`). */
export function keychainToken(): string | null {
  try {
    const out = execFileSync("/usr/bin/security", ["find-generic-password", "-a", "crowbo", "-s", "crowbo/api", "-w"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
    });
    if (out.some((byte) => byte > 0x7f)) return null;
    return new TextDecoder().decode(out).replace(/[\r\n]+$/, "");
  } catch {
    return null;
  }
}

/** The operator's API token: `CROWBO_TOKEN`, else the Keychain. Never printed. */
export function apiToken(env: Record<string, string | undefined>, keychain: () => string | null = keychainToken): string {
  const value = env.CROWBO_TOKEN || keychain();
  if (!validSecret(value)) throw new CrowboError("Required Crowbo API credential is unavailable");
  return value;
}
