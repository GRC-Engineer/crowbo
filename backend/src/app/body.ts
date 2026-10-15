/**
 * Read a request body with a hard cap, whether or not Content-Length is sent (HTTP/2 and
 * streaming clients may omit it). A declared oversize length is refused before reading, and
 * reading stops at the first chunk past the cap. Null when the body is too large.
 */
export async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) return null;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) (body.set(chunk, offset), (offset += chunk.byteLength));
  return body;
}
