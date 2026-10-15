const NODE = /^[a-z]+:[A-Za-z0-9._-]+$/;
const PREDICATE = /^[a-z][a-z0-9_]*$/;

/**
 * One typed field as a "subject predicate value" line. API values are untrusted: newlines are
 * flattened and malformed subjects or predicates are dropped, so a value can never smuggle in a second
 * line. Its own module, so the connectors that use it do not import the connector list that uses them.
 */
export function line(subject: string, predicate: string, value: string | number): string[] {
  const v = String(value).replace(/[\r\n]+/g, " ").trim();
  return NODE.test(subject) && PREDICATE.test(predicate) && v ? [`${subject} ${predicate} ${v}`] : [];
}
