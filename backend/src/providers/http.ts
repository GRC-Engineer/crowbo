import { CrowboError } from "../domain/errors";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * An HTTPS client pinned to one host: no redirects, no other destinations, response bodies
 * capped at `maxBytes`. The pinned host is the security boundary for provider credentials.
 */
export function fixedHostFetch(host: string, maxBytes = 8_000_000, base: FetchLike = fetch): FetchLike {
  return async (input, init) => {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.hostname !== host || (url.port !== "" && url.port !== "443")) {
      throw new CrowboError("Provider request destination is not permitted");
    }
    const response = await base(url.href, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new CrowboError("Provider redirects are not permitted");
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new CrowboError("Provider response exceeded the size limit");
        }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) (body.set(chunk, offset), (offset += chunk.byteLength));
    return new Response(body, { status: response.status, headers: response.headers });
  };
}

export function withTimeout(ms: number): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(ms) };
}

export const isTimeout = (error: unknown) =>
  !!error && typeof error === "object" && ["TimeoutError", "AbortError"].includes((error as { name?: string }).name ?? "");
