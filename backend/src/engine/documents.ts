/**
 * Text from the binary documents a knowledge-base export carries (PDF, DOCX), with no library: the
 * runtime's DecompressionStream does the inflating. The text is untrusted like any other source:
 * it becomes prose, and a fact from it must quote it exactly. Whatever cannot be read reliably (an
 * encrypted PDF, a font without a readable encoding, a filter not handled here) is reported as not
 * read, never guessed at.
 */

/** Most bytes any one inflated part may produce: a small file cannot expand into a large one. */
export const MAX_INFLATED = 4_000_000;

export type DocumentText =
  | { ok: true; pages: { n: number; text: string }[]; unread: string[] }
  | { ok: false; reason: string };

async function inflate(bytes: Uint8Array, format: "deflate" | "deflate-raw"): Promise<Uint8Array | null> {
  try {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_INFLATED) {
        await reader.cancel();
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
const readable = (s: string) => s.length === 0 || [...s].filter((c) => /[\p{L}\p{N}\p{P}\p{Zs}\n]/u.test(c)).length / s.length > 0.9;

// ---- PDF ------------------------------------------------------------------------------------------

type PdfObject = { dict: string; stream: Uint8Array | null };

function pdfObjects(raw: Uint8Array): Map<number, PdfObject> {
  const text = latin1(raw);
  const out = new Map<number, PdfObject>();
  const re = /(\d+)\s+\d+\s+obj\b([\s\S]*?)\bendobj/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const body = m[2];
    const s = body.search(/stream\r?\n/);
    if (s < 0) {
      out.set(Number(m[1]), { dict: body, stream: null });
      continue;
    }
    const start = m.index + m[0].indexOf(body) + s + body.slice(s).match(/stream\r?\n/)![0].length;
    const end = text.lastIndexOf("endstream", m.index + m[0].length);
    // The declared length when it is a plain number and only whitespace follows it before endstream;
    // otherwise (a wrong or indirect length) everything up to endstream, minus its line break.
    const declared = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(body.slice(0, s))?.[1];
    const fits = declared !== undefined && start + Number(declared) <= end && /^\s*$/.test(text.slice(start + Number(declared), end));
    const stop = fits ? start + Number(declared) : end - (text.slice(end - 2, end) === "\r\n" ? 2 : text[end - 1] === "\n" || text[end - 1] === "\r" ? 1 : 0);
    out.set(Number(m[1]), { dict: body.slice(0, s), stream: raw.subarray(start, Math.max(start, stop)) });
  }
  return out;
}

const refs = (s: string) => [...s.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
const refOf = (dict: string, key: string) => {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict);
  return m ? Number(m[1]) : null;
};

/** The page objects in reading order, from the catalog's page tree. */
function pageOrder(objects: Map<number, PdfObject>): number[] {
  const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog\b/.test(o.dict));
  const root = catalog && refOf(catalog.dict, "Pages");
  const pages: number[] = [];
  const seen = new Set<number>();
  const walk = (id: number) => {
    if (seen.has(id) || pages.length > 2000) return;
    seen.add(id);
    const o = objects.get(id);
    if (!o) return;
    if (/\/Type\s*\/Page\b/.test(o.dict)) return void pages.push(id);
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(o.dict);
    for (const k of kids ? refs(kids[1]) : []) walk(k);
  };
  if (root !== null && root !== undefined) walk(root);
  return pages;
}

/** A PDF literal string's bytes: escapes, octal codes and line continuations. */
function literal(s: string): string {
  return s.replace(/\\(\r?\n|[nrtbf()\\]|[0-7]{1,3})/g, (_m, e: string) => {
    if (/^\r?\n$/.test(e)) return "";
    if (/^[0-7]/.test(e)) return String.fromCharCode(Number.parseInt(e, 8));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" } as Record<string, string>)[e];
  });
}
const hex = (s: string) => {
  const h = s.replace(/\s+/g, "");
  return (h.length % 2 ? `${h}0` : h).match(/../g)?.map((x) => String.fromCharCode(Number.parseInt(x, 16))).join("") ?? "";
};

/** The text shown by one content stream: Tj, TJ, ' and " strings, with lines broken where the text moves down. */
export function contentText(ops: string): string {
  let out = "";
  const re = /\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[[\s\S]*?\]\s*TJ|\bT[dD]\b|\bT\*|\bTm\b|\bET\b|\bTj\b|'|"/g;
  let pending = "";
  for (let m = re.exec(ops); m; m = re.exec(ops)) {
    const t = m[0];
    if (t.startsWith("(")) pending = literal(t.slice(1, -1));
    else if (t.startsWith("<")) pending = hex(t.slice(1, -1));
    else if (t.startsWith("[")) {
      for (const part of t.matchAll(/\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]*>|-?\d+(?:\.\d+)?/g)) {
        const p = part[0];
        out += p.startsWith("(") ? literal(p.slice(1, -1)) : p.startsWith("<") ? hex(p.slice(1, -1)) : Number(p) < -200 ? " " : "";
      }
    } else if (t === "Tj" || t === "'" || t === '"') {
      out += (t === "Tj" ? "" : "\n") + pending;
      pending = "";
    } else out += "\n";
  }
  return tidy(out);
}

export async function pdfText(raw: Uint8Array): Promise<DocumentText> {
  if (latin1(raw.subarray(0, 8)).indexOf("%PDF-") !== 0) return { ok: false, reason: "not a PDF" };
  const objects = pdfObjects(raw);
  if ([...objects.values()].some((o) => /\/Encrypt\b/.test(o.dict))) return { ok: false, reason: "the PDF is encrypted" };
  const order = pageOrder(objects);
  if (!order.length) return { ok: false, reason: "no pages found in the PDF" };
  const pages: { n: number; text: string }[] = [];
  const unread: string[] = [];
  for (const [i, id] of order.entries()) {
    const n = i + 1;
    const page = objects.get(id)!;
    const contents = /\/Contents\s*\[([^\]]*)\]/.exec(page.dict)?.[1] ?? /\/Contents\s+(\d+\s+\d+\s+R)/.exec(page.dict)?.[1] ?? "";
    let ops = "";
    let problem: string | null = null;
    for (const ref of refs(contents)) {
      const o = objects.get(ref);
      if (!o?.stream) continue;
      const filter = /\/Filter\s*\/?\[?\s*\/(\w+)/.exec(o.dict)?.[1];
      const bytes = filter === undefined ? o.stream : filter === "FlateDecode" ? await inflate(o.stream, "deflate") : null;
      if (!bytes) {
        problem = filter === "FlateDecode" ? "a content stream could not be inflated or is too large" : `content uses the ${filter} filter, not read here`;
        break;
      }
      ops += `${latin1(bytes)}\n`;
    }
    const text = problem ? "" : contentText(ops);
    if (problem) unread.push(`page ${n}: ${problem}`);
    else if (!readable(text)) unread.push(`page ${n}: its fonts are encoded in a way not read here`);
    else if (text) pages.push({ n, text });
  }
  return { ok: true, pages, unread };
}

// ---- DOCX -----------------------------------------------------------------------------------------

/** One file from a zip archive, by name, inflated with a size cap. */
export async function unzipEntry(raw: Uint8Array, name: string): Promise<Uint8Array | null> {
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
    const data = raw.subarray(start, start + size);
    return method === 0 ? data : method === 8 ? inflate(data, "deflate-raw") : null;
  }
  return null;
}

const entity = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]);

/** The paragraphs of a DOCX's main document, in order. */
export async function docxText(raw: Uint8Array): Promise<DocumentText> {
  const xml = await unzipEntry(raw, "word/document.xml");
  if (!xml) return { ok: false, reason: "no readable word/document.xml (not a DOCX, damaged, or too large)" };
  const doc = new TextDecoder().decode(xml);
  const paragraphs = [...doc.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) =>
    p[0].replace(/<w:tab\/>/g, "<w:t>\t</w:t>").replace(/<w:br\/>/g, "<w:t>\n</w:t>").replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_m, t: string) => `\u0000${t}\u0000`)
      .split("\u0000").filter((_x, i) => i % 2 === 1).map(entity).join(""));
  const text = tidy(paragraphs.join("\n"));
  return { ok: true, pages: text ? [{ n: 1, text }] : [], unread: [] };
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
