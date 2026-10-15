import type { FetchJson } from "./model";

/**
 * Lists read page by page. A provider says how to read one page: its items, and the path of the next
 * page or null when the page states there is none. A list is complete only when the last page read
 * says so; a page cap reached, a page that cannot be read, or a page that does not say is incomplete.
 */

export const MAX_PAGES = 50;

export interface Page<T> {
  items: T[];
  /** The next page's path; null when this page states it is the last; undefined when it does not say. */
  next: string | null | undefined;
}

export interface Listing<T> {
  items: T[];
  complete: boolean;
}

/**
 * key: an item's identity. Items are counted once; a page whose items all repeat is a loop, and a page
 * path seen before is a loop: either stops the read as incomplete, never complete with duplicates.
 */
export async function collect<T>(first: string, read: (path: string) => Promise<Page<T> | null>, key?: (item: T) => string): Promise<Listing<T>> {
  const items: T[] = [];
  const seenPaths = new Set<string>();
  const seenItems = new Set<string>();
  let path: string | null | undefined = first;
  for (let n = 0; n < MAX_PAGES && path; n++) {
    if (seenPaths.has(path)) return { items, complete: false };
    seenPaths.add(path);
    const page = await read(path);
    if (!page) return { items, complete: false };
    let added = 0;
    for (const item of page.items) {
      const k = key?.(item);
      if (k !== undefined) {
        if (seenItems.has(k)) continue;
        seenItems.add(k);
      }
      items.push(item);
      added++;
    }
    if (page.items.length > 0 && added === 0) return { items, complete: false };
    if (page.next === null) return { items, complete: true };
    path = page.next;
  }
  return { items, complete: false };
}

/** A next link as a path: real Link headers carry absolute URLs; only the path and query are followed. */
export function nextPath(next: string | null): string | null {
  if (next === null || next.startsWith("/")) return next;
  try {
    const u = new URL(next);
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

/** A list paged by Link header: complete when a page has no next link; unknown when the fetch cannot see links. */
export async function linked<T>(api: FetchJson, first: string, key?: (item: T) => string): Promise<Listing<T>> {
  if (!api.page) {
    const body = (await api(first)) as T[] | null;
    return { items: body ?? [], complete: false };
  }
  const page = api.page;
  return collect<T>(first, async (path) => {
    const r = await page(path);
    // A Link header that cannot be followed leaves the list incomplete, never complete.
    return r ? { items: (r.body as T[] | null) ?? [], next: r.next === null ? null : (nextPath(r.next) ?? undefined) } : null;
  }, key);
}

/** How much of a list a record states, for its completeness. */
export const completeness = (l: Listing<unknown>, of: string) => ({ read: l.items.length, total: l.complete ? l.items.length : null, of });
