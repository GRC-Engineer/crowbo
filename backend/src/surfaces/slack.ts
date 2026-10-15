import { ZodError } from "zod";
import type { Answer } from "../engine/answer";
import { METHOD_VERSION } from "../engine/decide";
import type { Decision } from "../engine/model";
import { EngineError } from "../engine/errors";
import type { KbFile, KbProfile } from "../engine/kb";
import type { EngineInvoke } from "../engine/tools";

/**
 * Crowbo in Slack, for teams with no AI assistant deployed. A thin surface over the same engine
 * operations as MCP (port.ts): a mention in a thread is answered with the decision card, "brief"
 * returns the weekly list, and a direct message carrying an export runs the knowledge-base import.
 * The engine decides; a model may only route the question and phrase a summary, both checked by
 * explain.ts. Every message is a reply to the person who asked or the scheduled weekly post: the
 * surface never posts anywhere else and never sends on anyone's behalf.
 *
 * Transport-free: these functions take what Slack sent and an `invoke` for one engine (in-process,
 * or the per-workspace Durable Object), and return what to post. slack-events.ts delivers them.
 */

export interface SlackMessage {
  text: string;
  /** The decision the message is about, so a reply can be traced to it. */
  decision_id?: string;
}

/** A mention: the text with the bot's <@U…> tag, and the thread it was posted in. */
export interface Mention {
  text: string;
  thread: string;
  /** The thread's permalink, from Slack's own API; required to record a call. */
  permalink?: string | null;
}

/**
 * "record" in a mention: a call on an action, with optional facts, in a fixed form a person types.
 * No model reads it. The engine accepts only the actions it knows and the predicates it lets a
 * person assert; anything else is refused with the reason.
 *   record override move-unused-to-operator because 4 of the 31 are break-glass accounts
 *   assert group:billing-admins break_glass_exempt 4
 */
export const RECORD = /^record\s+(accept|override|defer|exception)\s+([a-z0-9-]{1,100})\s+because\s+(.{1,500})$/i;
const ASSERT = /^assert\s+([a-z]+:[A-Za-z0-9._-]+)\s+([a-z][a-z0-9_]*)\s+(\S{1,200})$/;

export function parseRecord(text: string): null | { action: string; call: string; reason: string; assertions: { subject: string; predicate: string; value: string | number }[] } | { problem: string } {
  const [first, ...rest] = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!first || !/^record\b/i.test(first)) return null;
  const m = RECORD.exec(first);
  if (!m) return { problem: "Write it as: record <accept|override|defer|exception> <action> because <reason>, then one line per fact: assert <subject> <predicate> <value>" };
  const assertions = [];
  for (const line of rest) {
    const a = ASSERT.exec(line);
    if (!a) return { problem: `Not an assertion: "${line.slice(0, 80)}". Write it as: assert <subject> <predicate> <value>` };
    assertions.push({ subject: a[1], predicate: a[2], value: /^-?\d+(\.\d+)?$/.test(a[3]) ? Number(a[3]) : a[3] });
  }
  return { action: m[2].toLowerCase(), call: m[1].toLowerCase(), reason: m[3].trim(), assertions };
}

/** Text from sources, people or models, made inert in Slack: no links, mentions or broadcasts. */
export const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const k = (n: number) => `$${Math.round(n / 1000)}k`;
const exact = (n: number) => `$${n.toLocaleString("en-US")}`;
const range = (r: { low: number; high: number }, unit = (n: number) => String(n)) => (r.low === r.high ? unit(r.low) : `${unit(r.low)}–${unit(r.high)}`);
const cites = (ns: number[]) => ns.map((n) => `[${n}]`).join("");
const BRIEF = /^(brief|weekly|weekly brief|this week)\??$/i;
const DAY = 86_400_000;

/** A refusal the person can act on: the engine's reason, or which input was invalid. Anything else is a fault and is thrown. */
function refusal(error: unknown): string | null {
  if (error instanceof EngineError) return error.message;
  if (error instanceof ZodError) return error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  return null;
}

/** When the decision was computed and how far ahead it plans: the decision's own fields. */
export interface Period {
  computed_at: string;
  horizon_days: number;
}

const periodOf = (d: Decision): Period => ({ computed_at: d.computed_at, horizon_days: d.capacity.horizon_days });

/**
 * The decision card, in Slack mrkdwn, with the fields of the headless contract (docs/INTERACTION-MODEL.md):
 * question, case and version, planning period and evidence-check time; next action and trade-off;
 * deciding sources and unresolved constraints; advice, reported choice or observed outcome, each
 * marked; the full result ID and the next operations. Every value comes from the computed answer.
 */
export function card(answer: Answer, summary: { text: string; generated_by: string }, period: Period): string {
  const a = answer.answer;
  const start = period.computed_at.slice(0, 10);
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + period.horizon_days * DAY).toISOString().slice(0, 10);
  const checked = answer.sources.filter((x) => x.used).map((x) => x.read_at).filter((x): x is string => !!x).sort().at(-1);
  const lines: string[] = [
    `*${escape(answer.question)}*`,
    `_Case: ${escape(answer.topic)} · method ${METHOD_VERSION} · planning ${start} to ${end} · evidence checked ${checked ?? "never"}_`,
  ];
  if (summary.text) lines.push("", escape(summary.text), `_Summary phrased by ${escape(summary.generated_by)}, checked against the sources._`);
  lines.push("", "*Next action* (advice: a recommendation, not a decision)");
  if (a.move) lines.push(`${escape(a.move.title)} (${a.move.mode}) ${cites(a.move.cites)}`);
  else if (a.deferred) lines.push(`Not now: ${escape(a.deferred.title)}. ${escape(a.deferred.reason)}`);
  else lines.push("No move on this question.");
  if (a.move) {
    const risk = a.move.risk_removed_per_year;
    const tradeoff = risk.high > 0
      ? `Removes ${range(risk, k)} a year of expected loss (exactly ${range(risk, exact)}, rounded to $1k above) for ${range(a.move.hours)} hours`
      : `Takes ${range(a.move.hours)} hours`;
    lines.push("", "*Trade-off*", `${tradeoff}${a.move.cash.high > 0 ? ` and ${range(a.move.cash, exact)}` : ""}.`);
    const alternatives = answer.basis.alternatives.map((x) => `${escape(x.title)}${x.deferred_because ? ` (deferred: ${escape(x.deferred_because)})` : ""}`);
    if (alternatives.length) lines.push(`Ranked against: ${alternatives.join("; ")}.`);
  }
  const status = [a.decides && `Decides: ${escape(a.decides)}.`, a.delivers && `Delivers: ${escape(a.delivers)}.`, a.due && `Due ${escape(a.due.text)} (${a.due.date}) ${cites(a.due.cites)}.`].filter(Boolean);
  lines.push("", "*Status*", status.length ? status.join(" ") : "No decider or date found in the sources.");
  for (const o of answer.outcomes) {
    const kind = o.source === "stated" ? "Reported choice" : "Observed outcome";
    lines.push(`${kind}: ${escape(o.status)} (${escape(o.source)}, ${o.at.slice(0, 10)}).`);
  }
  if (a.conditions.length) lines.push(...a.conditions.map((c) => `• ${escape(c)}`));
  // A source's link is a Slack permalink the engine checked; it is shown as a plain URL.
  lines.push("", "*Sources*", ...answer.sources.map((x) => `[${x.n}] ${escape(x.label)}: ${escape(x.claim)} (weight ${x.weight}, ${x.freshness}${x.used ? "" : ", not used"}${x.read_at ? `, read ${x.read_at}` : ""})${x.link ? ` ${x.link}` : ""}`));
  if (a.unresolved.length) lines.push("", "*Unresolved*", ...a.unresolved.map((u) => `• ${escape(u)}`));
  lines.push(
    "", `_Result ${answer.decision_id}. Recommendation only; nothing executes._`,
    "_Next operations on this result: inspect it, record feedback (a call or an outcome), or reassess after new evidence._",
  );
  return lines.join("\n");
}

/** The weekly brief's Markdown as Slack mrkdwn: headings and bold become *bold*. */
export function toMrkdwn(markdown: string): string {
  return escape(markdown)
    .split("\n")
    .map((l) => l.replace(/^#{1,6} (.+)$/, "*$1*").replace(/\*\*(.+?)\*\*/g, "*$1*"))
    .join("\n");
}

/** A mention in a thread: "brief" posts the weekly list; anything else is a question for the card. */
export async function handleMention(invoke: EngineInvoke, mention: Mention): Promise<SlackMessage> {
  const question = mention.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!question) return { text: "Ask me a security question, or say \"brief\" for this week's list." };
  if (BRIEF.test(question)) return weeklyPost(invoke);
  const record = parseRecord(question);
  if (record) return recordCall(invoke, record, mention.permalink ?? null);
  try {
    const r = (await invoke("decide", { question })) as Answer & { summary: { text: string; generated_by: string } };
    const decision = (await invoke("next_moves", {})) as Decision;
    return { text: card(r, r.summary, periodOf(decision)), decision_id: r.decision_id };
  } catch (error) {
    const reason = refusal(error);
    if (reason === null) throw error;
    return { text: escape(reason) };
  }
}

/** Record a call from a thread, with the thread as its provenance; refused without a permalink. */
async function recordCall(invoke: EngineInvoke, record: NonNullable<ReturnType<typeof parseRecord>>, permalink: string | null): Promise<SlackMessage> {
  if ("problem" in record) return { text: escape(record.problem) };
  if (!permalink) return { text: "Nothing recorded: Slack did not give this thread's link, and a call is kept only with where it was made." };
  try {
    const r = (await invoke("record_call", { ...record, provenance: { permalink } })) as {
      recorded: { seq: number }; proposals: unknown[]; decision_diff: null | { after: string; changed_reasons: string[]; added: string[]; removed: string[] };
    };
    const d = r.decision_diff;
    const changed = d ? [...d.changed_reasons, ...d.added.map((a) => `now proposed: ${a}`), ...d.removed.map((a) => `no longer proposed: ${a}`)] : [];
    return {
      text: [
        `Recorded: ${record.call} on ${escape(record.action)}, kept in decision memory (entry ${r.recorded.seq}) with this thread as its source.`,
        changed.length ? `What changed: ${changed.map(escape).join("; ")}.` : "The decision is unchanged.",
        r.proposals.length ? "This source has been disputed more than once; a weight change is proposed for a person to accept." : "",
      ].filter(Boolean).join("\n"),
      ...(d ? { decision_id: d.after } : {}),
    };
  } catch (error) {
    const reason = refusal(error);
    if (reason === null) throw error;
    return { text: `Nothing recorded: ${escape(reason)}` };
  }
}

/** The scheduled weekly post: the brief, as computed, with nothing added. */
export async function weeklyPost(invoke: EngineInvoke): Promise<SlackMessage> {
  const brief = (await invoke("weekly_brief", {})) as { markdown: string; decision_id: string };
  return { text: toMrkdwn(brief.markdown), decision_id: brief.decision_id };
}

/** A direct message carrying an export: runs the import and replies with the first profile. */
export async function handleExport(invoke: EngineInvoke, files: KbFile[], declaration: { synthetic: true }): Promise<SlackMessage> {
  try {
    const r = (await invoke("import_knowledge_base", { synthetic: declaration.synthetic, files })) as { profile: KbProfile; decision_id: string };
    return { text: profileText(r.profile), decision_id: r.decision_id };
  } catch (error) {
    const reason = refusal(error);
    if (reason === null) throw error;
    return { text: `Import refused: ${escape(reason)}` };
  }
}

export function profileText(p: KbProfile): string {
  const list = (items: string[], none: string) => (items.length ? items.map((i) => `• ${i}`) : [`• ${none}`]);
  const read = p.files.filter((f) => f.format !== "not_read").length;
  return [
    `*First profile from your export* (${read} of ${p.files.length} files read)`,
    "", "*Systems and owners*", ...list(p.systems.map((s) => `${escape(s.id)}: ${s.owner ? escape(s.owner) : "no owner found"}`), "none found"),
    "", "*Controls*", ...list(p.controls.map((c) => `${escape(c.id)}${c.assigned_to ? `, assigned to ${escape(c.assigned_to)}` : ""}`), "none found"),
    "", "*Stale, shown and not used*", ...list(p.stale.map((s) => `${escape(s.subject)} ${escape(s.predicate)}: ${escape(s.reason)}`), "nothing stale"),
    "", "*Next moves*", ...list(p.next_moves.map((m) => `${escape(m.title)} (${m.mode})`), "none yet"),
    ...(p.files.some((f) => f.reason) ? ["", "*Files with notes*", ...p.files.filter((f) => f.reason).map((f) => `• ${escape(f.path)}: ${escape(f.reason!)}`)] : []),
    "", "_Recommendations only; nothing executes._",
  ].join("\n");
}
