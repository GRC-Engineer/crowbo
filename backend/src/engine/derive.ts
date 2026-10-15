import type { Coverage, Fact } from "./model";
import { nodeName } from "./predicates";

/**
 * Facts computed by code from facts in several sources: where the data points link up. Each
 * derived fact names the source revisions it came from, carries the oldest input date and the
 * input coverage, and states its arithmetic in its quote. No model is involved.
 *
 * These three joins are the demo's rules (access held vs. access used vs. a narrower role). In
 * production, joins are declared per workflow as data and reviewed like criteria.
 *
 * Callers pass only usable facts (fresh, from sources weighted high enough), so a weak or stale
 * input can never lower or veto a derived fact; it is reported as unresolved instead.
 */

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const uniq = (xs: string[]) => [...new Set(xs)].sort();

function derived(subject: string, predicate: string, value: Fact["value"], quote: string, inputs: Fact[], coverage?: Coverage): Fact {
  const refs = new Map(inputs.map((f) => [`${f.source.record}@${f.source.revision}`, { record: f.source.record, revision: f.source.revision }]));
  return {
    subject, predicate, value, quote, kind: "derived", extractor: "derive@1",
    source: { record: `derived:${subject}/${predicate}`, revision: 1, connector: "derived" },
    observed_at: inputs.map((f) => f.observed_at).sort()[0],
    derived_from: [...refs.keys()].sort().map((k) => refs.get(k)!),
    ...(coverage ? { coverage } : {}),
  };
}

export function derive(usable: Fact[], asOf: string, windowDays = 90): Fact[] {
  const out: Fact[] = [];
  const by = (predicate: string) => usable.filter((f) => f.predicate === predicate);
  const groups = uniq(by("member_of").filter((f) => String(f.value).startsWith("group:")).map((f) => String(f.value)));
  const since = isoDay(at(asOf) - windowDays * DAY);

  for (const group of groups) {
    const memberships = by("member_of").filter((f) => f.value === group);
    const holders = uniq(memberships.map((f) => f.subject));
    out.push(derived(group, "holders", holders.length, `${holders.length} people hold ${nodeName(group)} (identity provider group membership)`, memberships));

    // Held but not used: group membership joined with the app's audit log.
    const usage = by("last_billing_action");
    if (!usage.length) continue;
    const coverage = usage.find((f) => f.coverage)?.coverage;
    const used = new Set(usage.filter((f) => holders.includes(f.subject) && String(f.value) >= since).map((f) => f.subject));
    const unused = holders.filter((h) => !used.has(h));
    const covered = coverage ? `, ${coverage.days_with_data} of ${coverage.window_days} days of logs` : "";
    out.push(derived(group, "unused_90d", unused.length, `${unused.length} of ${holders.length} holders have no billing action since ${since}${covered}`, [...memberships, ...usage], coverage));

    // People the team has said must keep access (a recorded call, validated on entry) are not moved.
    const exempt = usable.filter((f) => f.subject === group && f.predicate === "break_glass_exempt" && f.kind === "asserted");
    const keep = exempt.length ? Number(exempt.at(-1)!.value) : 0;
    const movable = Math.max(0, unused.length - Math.min(keep, unused.length));
    out.push(derived(group, "movable_unused", movable, keep ? `${unused.length} unused minus ${keep} break-glass accounts kept by decision = ${movable}` : `${movable} unused holders, none exempted`, [...memberships, ...usage, ...exempt], coverage));

    // Does the narrower role cover everything those people ever did? Audit log joined with vendor docs.
    const permits = by("permits").filter((f) => f.subject === "role:billing-operator");
    if (!permits.length) continue;
    const allowed = new Set(permits.map((f) => String(f.value)));
    const theirActions = by("billing_actions").filter((f) => unused.includes(f.subject));
    const needed = uniq(theirActions.flatMap((f) => String(f.value).split(",")));
    const missing = needed.filter((a) => !allowed.has(a));
    out.push(derived("role:billing-operator", "covers_unused_actions", missing.length === 0,
      missing.length ? `Billing Operator lacks ${missing.join(", ")}, used by unused holders` : `Every action the unused holders took (${needed.join(", ")}) is in the Billing Operator role`,
      [...permits, ...theirActions, ...usage], coverage));
  }

  // Standing admin access and its last review: a group that administers an app, joined with the date
  // it was last reviewed. With no review date there is nothing to compute, and the gap stays missing.
  for (const admin of by("grants_admin_on")) {
    const reviewed = by("last_reviewed_at").filter((f) => f.subject === admin.subject).sort((x, y) => (String(x.value) < String(y.value) ? 1 : -1))[0];
    if (!reviewed) continue;
    const age = Math.round((at(asOf) - at(String(reviewed.value))) / DAY);
    const overdue = age > windowDays;
    out.push(derived(admin.subject, "review_overdue", overdue,
      `Admin access through ${nodeName(admin.subject)} on ${nodeName(String(admin.value))} last reviewed ${reviewed.value}, ${age} days ago${overdue ? `, past the ${windowDays}-day limit` : `, within the ${windowDays}-day limit`}`,
      [admin, reviewed]));
  }

  // Leavers still active: people HR shows as gone, joined with accounts the identity provider shows as
  // active. Computed only when both are readable, so a viewer without HR access gets nothing to join.
  const left = by("terminated_on").filter((f) => String(f.value) <= asOf);
  const statuses = by("account_status");
  if (left.length && statuses.length) {
    const active = left.filter((t) => statuses.some((st) => st.subject === t.subject && st.value === "active"));
    const names = uniq(active.map((t) => nodeName(t.subject)));
    out.push(derived("directory:accounts", "leavers_active", names.length,
      names.length ? `${names.length} of ${left.length} people who left still have an active account: ${names.join(", ")}` : `None of the ${left.length} people who left has an active account`,
      [...left, ...statuses.filter((st) => left.some((t) => t.subject === st.subject))]));
  }
  // A launch that handles customer data with no finished security review before its date: the
  // launch's features, the data classes they handle, and which classes the company marks as customer
  // data. Computed only when the classification is known; the review then must happen before launch.
  for (const start of by("start_date").filter((f) => String(f.value) >= asOf)) {
    const launch = start.subject;
    const review = by("security_review").find((f) => f.subject === launch);
    const features = by("includes").filter((f) => f.subject === launch);
    const handles = by("handles_data").filter((f) => features.some((x) => x.value === f.subject));
    const classified = by("customer_data").filter((f) => handles.some((h) => h.value === f.subject));
    if (!review || !handles.length || !classified.length) continue;
    const customer = uniq(classified.filter((f) => f.value === true).map((f) => nodeName(f.subject)));
    const exposed = customer.length > 0 && review.value !== "done";
    const inputs = [start, review, ...features, ...handles, ...classified];
    out.push(derived(launch, "unreviewed_customer_data", exposed,
      customer.length
        ? `${nodeName(launch)} on ${start.value} handles ${customer.join(", ")}; security review: ${review.value}`
        : `${nodeName(launch)} handles no data class marked as customer data`,
      inputs));
    if (exposed) out.push(derived(launch, "depends_on", "control:security-review", `${nodeName(launch)} needs its security review before ${start.value}`, inputs));
  }
  return out;
}
