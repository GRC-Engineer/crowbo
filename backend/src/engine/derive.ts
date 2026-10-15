import { type Coverage, type Fact, isPartial } from "./model";
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
    // A fact computed from a listing read in part says so.
    ...(inputs.find((f) => isPartial(f.completeness)) ? { completeness: inputs.find((f) => isPartial(f.completeness))!.completeness } : {}),
  };
}

export function derive(usable: Fact[], asOf: string, windowDays = 90): Fact[] {
  const out: Fact[] = [];
  const by = (predicate: string) => usable.filter((f) => f.predicate === predicate);
  const groups = uniq(by("member_of").filter((f) => String(f.value).startsWith("group:")).map((f) => String(f.value)));
  const since = isoDay(at(asOf) - windowDays * DAY);

  // A list counts only when every record that stated it says it was read completely (a stated total,
  // or a last page), and at least one listing exists. Unknown completeness is incomplete. When a join
  // is skipped for a partial read, a read_in_part fact on the join's subject says how much was read.
  const listings = (name: string) => by("read").filter((f) => f.subject.startsWith("listing:") && f.subject.endsWith(`.${name}`));
  const whole = (facts: Fact[]) => facts.every((f) => f.completeness !== undefined && !isPartial(f.completeness));
  const readInPart = (subject: string, facts: Fact[]) => {
    const partial = facts.find((f) => f.completeness === undefined || isPartial(f.completeness));
    if (!partial) return;
    const c = partial.completeness;
    out.push(derived(subject, "read_in_part", true, c ? `${c.of} read in part (${c.read} of ${c.total ?? "an unknown number of"} ${c.of})` : "read without a stated completeness", [partial]));
  };


  for (const group of groups) {
    const memberships = by("member_of").filter((f) => f.value === group);
    // Counts over a membership list read in part would be wrong, not just uncertain.
    if (!whole(memberships)) {
      readInPart(group, memberships);
      continue;
    }
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

  // Standing admin access to an app and its last review: who administers the app (people flagged as
  // its admins, and members of groups that administer it), joined with the date the app's admin access
  // was last reviewed. No review date: nothing to compute, the gap stays missing. Lists read in part:
  // unresolved. No group name or vendor decides who is an admin.
  for (const app of uniq([...by("admin_of"), ...by("grants_admin_on")].map((f) => String(f.value)))) {
    const reviewed = by("last_reviewed_at").filter((f) => f.subject === app).sort((x, y) => (String(x.value) < String(y.value) ? 1 : -1))[0];
    if (!reviewed) continue;
    const direct = by("admin_of").filter((f) => f.value === app);
    const groupsOf = by("grants_admin_on").filter((f) => f.value === app);
    const viaGroups = by("member_of").filter((m) => groupsOf.some((g) => g.subject === m.value));
    // A group list read in part may have missed a group that grants admin on this app.
    const groupLists = listings("groups");
    if (!whole([...direct, ...viaGroups, ...groupLists])) {
      readInPart(app, [...groupLists, ...direct, ...viaGroups]);
      continue;
    }
    const admins = uniq([...direct, ...viaGroups].map((f) => f.subject));
    const age = Math.round((at(asOf) - at(String(reviewed.value))) / DAY);
    const overdue = age > windowDays;
    out.push(derived(app, "review_overdue", overdue,
      `Admin access to ${nodeName(app)} (${admins.length} admins) last reviewed ${reviewed.value}, ${age} days ago${overdue ? `, past the ${windowDays}-day limit` : `, within the ${windowDays}-day limit`}`,
      [reviewed, ...direct, ...groupsOf, ...viaGroups]));
  }

  // Leavers still active: people HR shows as gone, joined with accounts the identity provider shows as
  // active. Computed only when both are readable, so a viewer without HR access gets nothing to join.
  const left = by("terminated_on").filter((f) => String(f.value) <= asOf);
  const statuses = by("account_status");
  if (left.length && statuses.length && !whole(statuses)) readInPart("directory:accounts", statuses);
  else if (left.length && statuses.length) {
    const active = left.filter((t) => statuses.some((st) => st.subject === t.subject && st.value === "active"));
    const names = uniq(active.map((t) => t.subject));
    out.push(derived("directory:accounts", "leavers_active", names.length,
      // Counts only: who left is HR data, and text from this claim may reach a wider audience than its readers.
      names.length ? `${names.length} of ${left.length} people who left still ${names.length === 1 ? "has" : "have"} an active account` : `None of the ${left.length} people who left has an active account`,
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
    const unclassified = handles.filter((h) => !classified.some((c) => c.subject === h.value));
    // Every data class the launch handles must be classified, or the answer could miss customer data.
    if (!review || !handles.length || unclassified.length) continue;
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

  // S5: vendors that handle customer data with no security review in a year (or never).
  const vendorListing = listings("vendors");
  const handles = by("handles_data").filter((f) => f.subject.startsWith("vendor:"));
  const vendorReviews = by("last_reviewed_at").filter((f) => f.subject.startsWith("vendor:"));
  if (vendorListing.length && !whole([...vendorListing, ...handles, ...vendorReviews])) readInPart("vendors:all", [...vendorListing, ...handles, ...vendorReviews]);
  else if (vendorListing.length) {
    const classes = uniq(handles.map((h) => String(h.value)));
    const classified = by("customer_data").filter((f) => classes.includes(f.subject));
    const customer = new Set(classified.filter((f) => f.value === true).map((f) => f.subject));
    const vendors = uniq(handles.filter((h) => customer.has(String(h.value))).map((h) => h.subject));
    // Every class a vendor handles is classified, and every such vendor states its last review.
    if (classes.length && classes.every((c) => classified.some((f) => f.subject === c)) && vendors.every((v) => vendorReviews.some((r) => r.subject === v))) {
      const lastReview = (v: string) => String(vendorReviews.find((r) => r.subject === v)!.value);
      const stale = vendors.filter((v) => lastReview(v) === "never" || at(asOf) - at(lastReview(v)) > 365 * DAY);
      out.push(derived("vendors:all", "unreviewed_customer_data_vendors", stale.length,
        `${stale.length} of ${vendors.length} vendors handling customer data have no security review in 365 days${stale.length ? `: ${stale.map((v) => `${nodeName(v)} (${lastReview(v)})`).join(", ")}` : ""}`,
        [...vendorListing, ...handles, ...classified, ...vendorReviews.filter((r) => vendors.includes(r.subject))]));
    }
  }

  // S6: exceptions past their review date, or signed by someone who has left (HR, narrowest audience).
  // The claim names exceptions, never the person who left: text from it may reach a wider audience.
  const exceptionListing = listings("exceptions");
  const reviewBy = by("review_by").filter((f) => f.subject.startsWith("exception:"));
  const signers = by("signer").filter((f) => f.subject.startsWith("exception:"));
  if (exceptionListing.length && !whole([...exceptionListing, ...reviewBy, ...signers])) readInPart("exceptions:all", [...exceptionListing, ...reviewBy, ...signers]);
  else if (exceptionListing.length) {
    const exceptions = uniq([...reviewBy, ...signers].map((f) => f.subject));
    const hrListing = listings("terminations");
    const hr = hrListing.length > 0 && whole(hrListing);
    const past = reviewBy.filter((f) => String(f.value) < asOf);
    const terminated = hr ? by("terminated_on").filter((t) => String(t.value) <= asOf) : [];
    const gone = signers.filter((s) => terminated.some((t) => t.subject === s.value));
    const flagged = uniq([...past, ...gone].map((f) => f.subject));
    // Without a complete HR read the signers cannot be checked: a count of zero would claim more than is known.
    if (hr || flagged.length) {
      const why = [...past.map((f) => `${nodeName(f.subject)} past its review date (${f.value})`), ...gone.map((f) => `${nodeName(f.subject)} signed by someone who left`)];
      const hrNote = hr ? "" : hrListing.length ? "; signers not checked, HR terminations read in part" : "; signers not checked, HR terminations not readable";
      out.push(derived("exceptions:all", "exceptions_needing_review", flagged.length,
        `${flagged.length} of ${exceptions.length} exceptions need re-signing${why.length ? `: ${why.join("; ")}` : ""}${hrNote}`,
        [...exceptionListing, ...past, ...gone, ...(hr ? [...hrListing, ...terminated.filter((t) => gone.some((g) => g.value === t.subject))] : [])]));
    } else if (hrListing.length) readInPart("exceptions:all", hrListing);
  }

  // S7: controls that take recurring hours with no linked risk, obligation or commitment, from any source.
  const controlListing = listings("controls");
  const linkCounts = by("link_count").filter((f) => f.subject.startsWith("control:"));
  if (controlListing.length && !whole([...controlListing, ...linkCounts])) readInPart("controls:all", [...controlListing, ...linkCounts]);
  else if (controlListing.length) {
    const linked = new Set([...by("linked_risk"), ...by("linked_obligation"), ...by("customer_commitment")].map((f) => f.subject));
    const effort = linkCounts.filter((f) => f.value === 0 && !linked.has(f.subject)).flatMap((f) => {
      const hours = by("hours_per_quarter").filter((h) => h.subject === f.subject && Number(h.value) > 0);
      return hours.length ? [{ control: f.subject, hours: Math.max(...hours.map((h) => Number(h.value))), inputs: [f, ...hours] }] : [];
    });
    const total = effort.reduce((n, e) => n + e.hours, 0);
    out.push(derived("controls:all", "unlinked_effort_controls", effort.length,
      effort.length ? `${effort.length} control${effort.length === 1 ? " takes" : "s take"} ${total} hours a quarter with no linked risk, obligation or commitment: ${effort.map((e) => nodeName(e.control)).join(", ")}` : "Every control with recurring hours is linked to a risk, obligation or commitment",
      [...controlListing, ...effort.flatMap((e) => e.inputs)]));
  }
  return out;
}
