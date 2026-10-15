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

export async function collect<T>(first: string, read: (path: string) => Promise<Page<T> | null>): Promise<Listing<T>> {
  const items: T[] = [];
  let path: string | null | undefined = first;
  for (let n = 0; n < MAX_PAGES && path; n++) {
    const page = await read(path);
    if (!page) return { items, complete: false };
    items.push(...page.items);
    if (page.next === null) return { items, complete: true };
    path = page.next;
  }
  return { items, complete: false };
}

/** A list paged by Link header: complete when a page has no next link; unknown when the fetch cannot see links. */
export async function linked<T>(api: FetchJson, first: string): Promise<Listing<T>> {
  if (!api.page) {
    const body = (await api(first)) as T[] | null;
    return { items: body ?? [], complete: false };
  }
  const page = api.page;
  return collect<T>(first, async (path) => {
    const r = await page(path);
    return r ? { items: (r.body as T[] | null) ?? [], next: r.next } : null;
  });
}

/** How much of a list a record states, for its completeness. */
export const completeness = (l: Listing<unknown>, of: string) => ({ read: l.items.length, total: l.complete ? l.items.length : null, of });
