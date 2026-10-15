/**
 * Text from the binary documents a knowledge-base export carries (PDF, DOCX), with no library: the
 * runtime's DecompressionStream does the inflating. Files are hostile until proven otherwise:
 *  - every scan is linear (no backtracking pattern runs over file content);
 *  - inflating is capped per part and across the file, and so is the text produced;
 *  - the page tree is walked iteratively with depth and node limits.
 * It fails closed: a PDF that keeps objects in object streams or its cross-reference in a stream,
 * an encrypted PDF, a page tree with missing objects, a filter other than FlateDecode or a font
 * whose text is not readable is listed as not read, never returned with guessed text or a page
 * number that might be wrong. The text is untrusted: it becomes prose, and a fact must quote it.
 */

/** Most bytes one inflated part may produce. */
export const MAX_INFLATED = 4_000_000;
/** Most bytes inflated across one file. */
export const MAX_FILE_INFLATED = 8_000_000;
/** Most characters of text taken from one file. */
export const MAX_TEXT = 1_000_000;
const MAX_PAGES = 2_000;
const MAX_TREE_DEPTH = 64;
const MAX_TREE_NODES = 10_000;

export type DocumentText =
  | { ok: true; pages: { n: number; text: string }[]; unread: string[] }
  | { ok: false; reason: string };

async function inflate(bytes: Uint8Array, format: "deflate" | "deflate-raw", cap: number): Promise<Uint8Array | null> {
  try {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) (out.set(c, at), (at += c.byteLength));
    return out;
  } catch {
    return null;
  }
}

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};
const tidy = (s: string) => s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
/** Mostly printable text, or bytes from a font this reader cannot decode. */
function readable(s: string): boolean {
  if (!s.length) return true;
  let ok = 0;
  for (const c of s) if (/[\p{L}\p{N}\p{P}\p{S}\p{Zs}\n\t]/u.test(c)) ok++;
  return ok / s.length > 0.9;
}

// ---- PDF ------------------------------------------------------------------------------------------

type PdfObject = { dict: string; stream: Uint8Array | null };
const isDigit = (c: number) => c >= 48 && c <= 57;
const isSpace = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";

/** Every "N G obj ... endobj", paired in one pass over the header and end positions. */
function pdfObjects(raw: Uint8Array, text: string): Map<number, PdfObject> {
  const heads: { id: number; at: number; body: number }[] = [];
  const header = /(\d{1,10})\s+\d{1,5}\s+obj\b/g;
  for (let m = header.exec(text); m; m = header.exec(text)) heads.push({ id: Number(m[1]), at: m.index, body: m.index + m[0].length });
  const ends: number[] = [];
  for (let i = text.indexOf("endobj"); i >= 0; i = text.indexOf("endobj", i + 6)) ends.push(i);
  // "stream" keywords (not the end of "endstream"), collected once and walked with a pointer.
  const streams: number[] = [];
  for (let i = text.indexOf("stream"); i >= 0; i = text.indexOf("stream", i + 6)) if (!text.startsWith("end", i - 3)) streams.push(i);
  const endStreams: number[] = [];
  for (let i = text.indexOf("endstream"); i >= 0; i = text.indexOf("endstream", i + 9)) endStreams.push(i);
  const out = new Map<number, PdfObject>();
  let e = 0;
  let st = 0;
  let es = -1;
  for (const [k, h] of heads.entries()) {
    const limit = heads[k + 1]?.at ?? text.length;
    while (e < ends.length && ends[e] < h.body) e++;
    if (e >= ends.length || ends[e] > limit) continue; // unterminated: not used
    const end = ends[e];
    while (st < streams.length && streams[st] < h.body) st++;
    const s = st < streams.length ? streams[st] : -1;
    if (s < 0 || s > end) {
      out.set(h.id, { dict: text.slice(h.body, end), stream: null });
      continue;
    }
    const dataStart = s + 6 + (text[s + 6] === "\r" && text[s + 7] === "\n" ? 2 : text[s + 6] === "\n" || text[s + 6] === "\r" ? 1 : 0);
    // The last "endstream" before this object's end, found by pointer, never by searching back.
    while (es + 1 < endStreams.length && endStreams[es + 1] <= end) es++;
    const endStream = es >= 0 ? endStreams[es] : -1;
    if (endStream < dataStart) continue;
    const dict = text.slice(h.body, s);
    // The declared length when it is a plain number and only whitespace follows it before endstream.
    const declared = /\/Length\s+(\d{1,10})(?!\s+\d+\s+R)/.exec(dict)?.[1];
    let stop = endStream;
    if (declared !== undefined) {
      const at = dataStart + Number(declared);
      let ws = at <= endStream;
      for (let i = at; ws && i < endStream; i++) ws = isSpace(text[i]);
      if (ws) stop = at;
    }
    if (stop === endStream) while (stop > dataStart && (text[stop - 1] === "\n" || text[stop - 1] === "\r")) stop--;
    out.set(h.id, { dict, stream: raw.subarray(dataStart, stop) });
  }
  return out;
}

const refs = (s: string) => [...s.matchAll(/(\d{1,10})\s+\d{1,5}\s+R/g)].map((m) => Number(m[1]));
const refOf = (dict: string, key: string) => {
  const m = new RegExp(`/${key}\\s+(\\d{1,10})\\s+\\d{1,5}\\s+R`).exec(dict);
  return m ? Number(m[1]) : null;
};
/** The value of a key that is an array, or a single item; bounded to one array. */
const arrayOf = (dict: string, key: string) => {
  const i = dict.indexOf(`/${key}`);
  if (i < 0) return null;
  let j = i + key.length + 1;
  while (j < dict.length && isSpace(dict[j])) j++;
  if (dict[j] !== "[") return dict.slice(j, j + 40);
  const close = dict.indexOf("]", j);
  return close < 0 ? null : dict.slice(j + 1, close);
};

/** The page objects in reading order, walked without recursion; null when the tree is not whole. */
function pageOrder(objects: Map<number, PdfObject>): number[] | null {
  const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog\b/.test(o.dict));
  const root = catalog ? refOf(catalog.dict, "Pages") : null;
  if (root === null) return null;
  const pages: number[] = [];
  const seen = new Set<number>();
  const stack: { id: number; depth: number }[] = [{ id: root, depth: 0 }];
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    if (seen.has(id)) continue;
    if (depth > MAX_TREE_DEPTH || seen.size >= MAX_TREE_NODES || pages.length >= MAX_PAGES) return null;
    seen.add(id);
    const o = objects.get(id);
    if (!o) return null; // a page or a branch not found: the numbering after it could be wrong
    if (/\/Type\s*\/Page\b/.test(o.dict)) {
      pages.push(id);
      continue;
    }
    const kids = arrayOf(o.dict, "Kids");
    if (kids === null) return null;
    const ids = refs(kids);
    for (let i = ids.length - 1; i >= 0; i--) stack.push({ id: ids[i], depth: depth + 1 });
  }
  return pages;
}

/** The text shown by one content stream, in one pass: Tj, TJ, ' and " strings; line breaks where text moves. */
export function contentText(ops: string): string {
  let out = "";
  let pending = "";
  let array: string | null = null;
  let i = 0;
  const n = ops.length;
  while (i < n) {
    const c = ops[i];
    if (c === "(") {
      let depth = 1;
      let s = "";
      i++;
      while (i < n && depth > 0) {
        const d = ops[i];
        if (d === "\\") {
          const e = ops[i + 1];
          if (e === undefined) break;
          if (e >= "0" && e <= "7") {
            let k = 1;
            while (k < 3 && ops[i + 1 + k] >= "0" && ops[i + 1 + k] <= "7") k++;
            s += String.fromCharCode(Number.parseInt(ops.slice(i + 1, i + 1 + k), 8) & 0xff);
            i += 1 + k;
            continue;
          }
          if (e === "\r" || e === "\n") {
            i += e === "\r" && ops[i + 2] === "\n" ? 3 : 2;
            continue;
          }
          s += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[e] ?? e;
          i += 2;
          continue;
        }
        if (d === "(") depth++;
        else if (d === ")" && --depth === 0) {
          i++;
          break;
        }
        s += d;
        i++;
      }
      if (array !== null) array += s;
      else pending = s;
      continue;
    }
    if (c === "<" && ops[i + 1] !== "<") {
      const close = ops.indexOf(">", i + 1);
      const h = (close < 0 ? ops.slice(i + 1) : ops.slice(i + 1, close)).replace(/[^0-9A-Fa-f]/g, "");
      let s = "";
      for (let k = 0; k < h.length; k += 2) s += String.fromCharCode(Number.parseInt(h.slice(k, k + 2).padEnd(2, "0"), 16));
      if (array !== null) array += s;
      else pending = s;
      i = close < 0 ? n : close + 1;
      continue;
    }
    if (c === "[") {
      array = "";
      i++;
      continue;
    }
    if (c === "]") {
      pending = array ?? "";
      array = null;
      i++;
      continue;
    }
    if (c === "-" || c === "." || isDigit(c.charCodeAt(0))) {
      let j = i + 1;
      while (j < n && (ops[j] === "." || isDigit(ops.charCodeAt(j)))) j++;
      if (array !== null && Number(ops.slice(i, j)) < -200) array += " ";
      i = j;
      continue;
    }
    if (/[A-Za-z'"*]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z*]/.test(ops[j])) j++;
      const op = ops.slice(i, j);
      if (op === "Tj" || op === "TJ") out += pending;
      else if (op === "'" || op === '"') out += `\n${pending}`;
      else if (op === "Td" || op === "TD" || op === "T*" || op === "Tm" || op === "ET") out += "\n";
      if (op === "Tj" || op === "TJ" || op === "'" || op === '"') pending = "";
      i = j;
      if (out.length > MAX_TEXT) break;
      continue;
    }
    i++;
  }
  return tidy(out);
}

/** The filters on a stream, in order: one name or an array of names. */
const filters = (dict: string) => {
  const v = arrayOf(dict, "Filter");
  return v === null ? [] : [...v.matchAll(/\/(\w+)/g)].map((m) => m[1]);
};

export async function pdfText(raw: Uint8Array): Promise<DocumentText> {
  const text = latin1(raw);
  if (!text.startsWith("%PDF-")) return { ok: false, reason: "not a PDF" };
  // Encryption is declared in the trailer (or the cross-reference stream's dictionary): anywhere counts.
  if (text.includes("/Encrypt")) return { ok: false, reason: "the PDF is encrypted" };
  // Objects in object streams cannot be read here, so page numbering after them could be wrong.
  if (text.includes("/ObjStm") || /\/Type\s*\/XRef\b/.test(text)) return { ok: false, reason: "object streams or cross-reference streams are not supported" };
  const objects = pdfObjects(raw, text);
  const order = pageOrder(objects);
  if (!order) return { ok: false, reason: "the page tree refers to objects that are missing or too deep" };
  if (!order.length) return { ok: false, reason: "no pages found in the PDF" };
  const pages: { n: number; text: string }[] = [];
  const unread: string[] = [];
  let inflated = 0;
  let produced = 0;
  for (const [i, id] of order.entries()) {
    const n = i + 1;
    const page = objects.get(id)!;
    const contents = arrayOf(page.dict, "Contents") ?? "";
    let ops = "";
    let problem: string | null = null;
    for (const ref of [...new Set(refs(contents))]) {
      const o = objects.get(ref);
      if (!o?.stream) {
        problem = "a content stream is missing";
        break;
      }
      const chain = filters(o.dict);
      if (chain.length > 1 || (chain.length === 1 && chain[0] !== "FlateDecode")) {
        problem = `content uses the ${chain.join(" + ")} filter, not read here`;
        break;
      }
      const room = Math.min(MAX_INFLATED, MAX_FILE_INFLATED - inflated);
      const bytes = chain.length ? await inflate(o.stream, "deflate", room) : o.stream.length <= room ? o.stream : null;
      if (!bytes) {
        problem = "a content stream could not be inflated or is too large";
        break;
      }
      inflated += bytes.length;
      ops += `${latin1(bytes)}\n`;
    }
    const pageText = problem ? "" : contentText(ops);
    if (problem) unread.push(`page ${n}: ${problem}`);
    else if (!readable(pageText)) unread.push(`page ${n}: its fonts are encoded in a way not read here`);
    else if (pageText) {
      produced += pageText.length;
      if (produced > MAX_TEXT) {
        unread.push(`pages ${n} onwards: the document has more text than is read here`);
        break;
      }
      pages.push({ n, text: pageText });
    }
  }
  return { ok: true, pages, unread };
}

// ---- DOCX -----------------------------------------------------------------------------------------

/** One file from a zip archive, by name, inflated with a size cap. */
export async function unzipEntry(raw: Uint8Array, name: string): Promise<Uint8Array | null> {
  if (raw.length < 22) return null;
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let eocd = -1;
  for (let i = raw.length - 22; i >= Math.max(0, raw.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let at = v.getUint32(eocd + 16, true);
  for (let k = 0; k < count && at + 46 <= raw.length; k++) {
    if (v.getUint32(at, true) !== 0x02014b50) return null;
    const method = v.getUint16(at + 10, true);
    const size = v.getUint32(at + 20, true);
    const declared = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const skip = nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    const entry = new TextDecoder().decode(raw.subarray(at + 46, at + 46 + nameLen));
    at += 46 + skip;
    if (entry !== name) continue;
    if (declared > MAX_INFLATED || local + 30 > raw.length || v.getUint32(local, true) !== 0x04034b50) return null;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (start + size > raw.length) return null;
    const data = raw.subarray(start, start + size);
    return method === 0 ? (data.length <= MAX_INFLATED ? data : null) : method === 8 ? inflate(data, "deflate-raw", MAX_INFLATED) : null;
  }
  return null;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
/** XML character references; one out of range becomes the replacement character instead of throwing. */
function entity(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d{1,8}|#x[0-9a-fA-F]{1,6});/g, (_m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e];
    const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "�";
  });
}

/** The paragraphs of a DOCX's main document, in order, in one pass over its tags. */
export async function docxText(raw: Uint8Array): Promise<DocumentText> {
  const xml = await unzipEntry(raw, "word/document.xml");
  if (!xml) return { ok: false, reason: "no readable word/document.xml (not a DOCX, damaged, or too large)" };
  const doc = new TextDecoder().decode(xml);
  let out = "";
  let inText = false;
  let i = 0;
  while (i < doc.length && out.length <= MAX_TEXT) {
    const lt = doc.indexOf("<", i);
    if (lt < 0) break;
    if (inText) out += entity(doc.slice(i, lt));
    const gt = doc.indexOf(">", lt);
    if (gt < 0) break;
    const tag = doc.slice(lt + 1, gt);
    const name = tag.replace(/^\//, "").split(/[\s/]/, 1)[0];
    if (name === "w:t") inText = !tag.startsWith("/") && !tag.endsWith("/");
    else if (name === "w:tab" && !tag.startsWith("/")) out += "\t";
    else if (name === "w:br" && !tag.startsWith("/")) out += "\n";
    else if (name === "w:p" && tag.startsWith("/")) out += "\n";
    i = gt + 1;
  }
  const text = tidy(out.slice(0, MAX_TEXT));
  return { ok: true, pages: text ? [{ n: 1, text }] : [], unread: out.length > MAX_TEXT ? ["the document has more text than is read here"] : [] };
}

export function base64Bytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
