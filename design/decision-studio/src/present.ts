import { accessChecks } from "./access-checks.ts";
import { annualTask, recoveryPaths } from "./access-review-model.ts";
import { demoCases, type CaseId } from "./question-demo-model.ts";
import type { DemoSource, Influence } from "./source-model.ts";
import { workflowCases } from "./workflow-cases.ts";

// How records are worded and measured on screen. The authored records keep
// their full text; these helpers choose what the interface shows.

export const influenceLabel: Record<Influence, string> = {
  deciding: "Deciding",
  supporting: "Supporting",
  context: "Context",
  constraint: "Must hold",
};

// Influence squares out of five. A constraint is shown as a tag instead.
export const influenceSquares: Record<Influence, number> = {
  deciding: 5,
  supporting: 3,
  context: 1,
  constraint: 0,
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const TODAY = Date.UTC(2026, 8, 29);

function firstDate(text: string): { label: string; time: number } | null {
  const match = text.match(
    /(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December)(?: (\d{4}))?/i,
  );
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].toLowerCase());
  const year = Number(match[3] ?? 2026);
  return {
    label: `${match[1]} ${match[2].slice(0, 3)}`,
    time: Date.UTC(year, month, Number(match[1])),
  };
}

// Freshness squares out of seven, from the date the record was checked.
export function freshness(source: DemoSource): {
  squares: number;
  label: string;
} {
  const date = firstDate(source.record.checked) ?? firstDate(source.period);
  if (!date) return { squares: 4, label: source.period };
  const days = Math.round((TODAY - date.time) / 86_400_000);
  const squares =
    days <= 1 ? 7 : days <= 7 ? 6 : days <= 30 ? 5 : days <= 60 ? 4 : 3;
  return { squares, label: date.label };
}

export function tidy(text: string): string {
  const cleaned = text
    .replace(/^(Fictional test record|Prepared alternative):\s*/i, "")
    .replace(/\s*·\s*synthetic( alternative)?\b/gi, "")
    .replace(/\b(fictional|synthetic)\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function checkedOn(source: DemoSource): string {
  const date = firstDate(source.record.checked);
  if (!date) return tidy(source.record.checked.split(". ")[0]);
  const full = source.record.checked.match(
    /\d{1,2} [A-Z][a-z]+(?: \d{4})?/,
  )?.[0];
  return full ?? date.label;
}

// One condition per line, so each can be read and ticked on its own.
export function conditions(text: string): string[] {
  return text
    .split(/(?<=[.;])\s+/)
    .map((part) => part.replace(/;$/, ".").trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
}

// Who decides each example, and by when.
export const caseOwners: Record<
  CaseId,
  { decides: string; role: string; delivers: string; due: string }
> = {
  remediation: {
    decides: "Nora",
    role: "Release owner, gateway",
    delivers: "Suri",
    due: "2 October",
  },
  access: {
    decides: "Maya",
    role: "Support owner",
    delivers: "Alex Rivera",
    due: "30 September",
  },
  exceptions: {
    decides: "Security owner",
    role: "Approves exceptions for billing",
    delivers: "Inez",
    due: "11 October",
  },
};

// Every record a case can use, across all of its prepared versions.
export function caseRecords(caseId: CaseId): DemoSource[] {
  const all =
    caseId === "access"
      ? [
          ...demoCases.access.sources,
          annualTask,
          ...Object.values(recoveryPaths),
          ...Object.values(accessChecks).map((check) => check.source),
        ]
      : [
          workflowCases[caseId].initial,
          ...workflowCases[caseId].stages,
        ].flatMap((stage) => stage.sources);
  return [...new Map(all.map((record) => [record.id, record])).values()];
}

export const caseSlug: Record<CaseId, string> = {
  remediation: "gateway-fix",
  access: "support-access",
  exceptions: "audit-log-gap",
};

// Where a decision stands, as five steps. A step is filled when the record
// that shows it is among the sources of the version on screen.
const tracks: Record<
  CaseId,
  { label: string; when: (ids: Set<string>, stage: string) => boolean }[]
> = {
  remediation: [
    { label: "Finding raised", when: (ids) => ids.has("finding") },
    { label: "Fix merged", when: (ids) => ids.has("patch") },
    {
      label: "Deployed",
      when: (ids) => ids.has("deployment") && !ids.has("rollback"),
    },
    { label: "Verified", when: (ids) => ids.has("verification") },
    { label: "Closure proposed", when: (ids) => ids.has("verification") },
  ],
  access: [
    { label: "Account identified", when: (ids) => ids.has("directory") },
    { label: "Permissions read", when: (ids) => ids.has("permissions") },
    { label: "Recovery rehearsed", when: (ids) => ids.has("recovery-tested") },
    {
      label: "Daily role tested",
      when: (_, stage) => stage === "daily-tested" || stage === "observed",
    },
    { label: "Change observed", when: (ids) => ids.has("access-outcome") },
  ],
  exceptions: [
    { label: "Gap observed", when: (ids) => ids.has("logging-gap") },
    { label: "Safeguard planned", when: (ids) => ids.has("safeguard-plan") },
    { label: "Safeguard tested", when: (ids) => ids.has("safeguard-test") },
    { label: "Approved", when: (ids) => ids.has("exception-approval") },
    { label: "Reviewed daily", when: (ids) => ids.has("daily-review") },
  ],
};

export function caseTrack(
  caseId: CaseId,
  sources: DemoSource[],
  stage: string,
): { label: string; done: boolean }[] {
  const ids = new Set(sources.map((source) => source.id));
  return tracks[caseId].map(({ label, when }) => ({
    label,
    done: when(ids, stage),
  }));
}
