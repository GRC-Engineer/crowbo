import { z } from "zod";
import { sourceId } from "./decision-request";
import { type Instant, instant, isoDate, localDate, micros } from "./time";

/** Attributed feedback on immutable advice; no approval, inference or source edits. */

const text = z.string().min(1).max(2000);

export const reportedChoice = z
  .strictObject({
    kind: z.enum(["recommendation", "alternative", "custom", "defer"]),
    alternative_index: z.number().int().min(0).max(19).nullable().default(null),
    custom: text.nullable().default(null),
  })
  .superRefine((c, ctx) => {
    if ((c.kind === "alternative") !== (c.alternative_index !== null)) {
      ctx.addIssue({ code: "custom", message: "only an alternative choice requires its zero-based index" });
    }
    if ((c.kind === "custom") !== (c.custom !== null)) {
      ctx.addIssue({ code: "custom", message: "only a custom choice requires proposed text" });
    }
  });

export const reportedNote = z.strictObject({
  statement: text,
  basis: text,
  source_ids: z.array(sourceId).max(15).default([]),
});
export const reportedOutcome = reportedNote.extend({ observed_on: isoDate });

export function feedbackRequestSchema(now: () => Instant) {
  return z
    .strictObject({
      result_id: sourceId,
      reviewed_at: instant,
      rationale: text,
      choice: reportedChoice.nullable().default(null),
      corrections: z.array(reportedNote).max(5).default([]),
      outcome: reportedOutcome.nullable().default(null),
      revisit_when: z.array(text).max(5).default([]),
      supporting_revisions: z.record(sourceId, sourceId).default({}),
    })
    .superRefine((r, ctx) => {
      const fail = (message: string) => ctx.addIssue({ code: "custom", message });
      if (Object.keys(r.supporting_revisions).length > 15) return fail("too many supporting revisions");
      if (/\[(?:E|P)\d+\]/.test(JSON.stringify(r))) return fail("feedback must use exact source references, not local E/P citation labels");
      if (micros(r.reviewed_at) > micros(now())) return fail("reported review time cannot be in the future");
      if (r.outcome && r.outcome.observed_on > localDate(r.reviewed_at)) return fail("reported outcome cannot follow the reported review date");
      if (!(r.choice || r.corrections.length || r.outcome)) return fail("feedback needs a choice, correction or reported outcome");
      for (const note of [...r.corrections, ...(r.outcome ? [r.outcome] : [])]) {
        if (new Set(note.source_ids).size !== note.source_ids.length) return fail("duplicate feedback source reference");
        if (!note.source_ids.every((id) => id in r.supporting_revisions)) {
          return fail("feedback source references require exact supporting revisions");
        }
      }
    });
}
export type FeedbackRequest = z.infer<ReturnType<typeof feedbackRequestSchema>>;
