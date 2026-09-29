import { useState } from "react";
import { ArrowUpRight, BookOpen, ChevronDown } from "./pixel-icons";
import type { CaseId } from "./question-demo-model";

const frameworks = {
  soc2: {
    label: "SOC 2",
    edition: "Trust Services Criteria · 2017, points of focus revised 2022",
    url: "https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022",
  },
  iso: {
    label: "ISO 27001",
    edition: "ISO/IEC 27001:2022 · Annex A",
    url: "https://committee.iso.org/files/live/sites/jtc1sc27/files/resources/Journal%202025.pdf#page=22",
  },
  nist: {
    label: "NIST CSF 2.0",
    edition: "NIST CSF 2.0 · 2024",
    url: "https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf#page=23",
  },
};
type Framework = keyof typeof frameworks;
type CaseGuide = {
  title: string;
  invitation: string;
  control: string;
  risk: string;
  compliance: string;
  research: [string, string, string, string];
  mappings: Record<
    Framework,
    { reference: string; meaning: string; check: string }
  >;
};

export const caseGuides: Record<CaseId, CaseGuide> = {
  remediation: {
    title: "Is the fix ready to close?",
    invitation:
      "A fix is marked done. Check whether it actually protects the live service.",
    control:
      "Fix known vulnerabilities and verify the result. The practical check is whether the affected service now blocks the unsafe behaviour while still supporting normal use.",
    risk: "A completed ticket can hide an exploitable service. A rushed fix can also break legitimate sign-ins; check both outcomes before proposing closure.",
    compliance:
      "Keep the finding, approved change, deployment and scoped test results together. Those records can support a control review; a merged change alone cannot demonstrate effective remediation.",
    research: [
      "Follow the finding to its fix, release and verification records.",
      "Check that each record refers to the same service, version and environment.",
      "Separate code being ready from protection working in production.",
      "Decide which check is still needed before proposing closure.",
    ],
    mappings: {
      soc2: {
        reference: "CC8.1 · Change management",
        meaning:
          "Relevant to testing, approval and implementation of the change.",
        check:
          "Can the owner trace this fix from its approved change to the deployed version and its tests?",
      },
      iso: {
        reference: "A.8.8 · Technical vulnerabilities",
        meaning: "Relevant to identifying and treating the vulnerability.",
        check:
          "What shows that the treatment addresses this finding in the affected environment?",
      },
      nist: {
        reference: "PR.PS-02 · Software maintenance",
        meaning: "Relevant to maintaining software in response to risk.",
        check:
          "Is the maintained version running, and has the intended protection been checked?",
      },
    },
  },
  access: {
    title: "Does this account need admin access?",
    invitation:
      "Someone has broad access. Find a safer arrangement that still lets them do their job.",
    control:
      "Give people the access their work requires. Review the account’s effective permissions, including access inherited through groups, against its approved tasks.",
    risk: "Broad access can make mistakes or account compromise more damaging. Removing too much can interrupt support or recovery work; infrequent tasks matter too.",
    compliance:
      "Retain the account identity, owner’s rationale, permission checks and authorised change record. These can support an access review; low usage by itself does not justify removing access.",
    research: [
      "Bring together the account, its permissions and the work its owner confirms.",
      "Check identity, inherited access and gaps in the activity history.",
      "Balance unnecessary privilege against daily and infrequent work.",
      "Find the role checks and owner review needed before changing access.",
    ],
    mappings: {
      soc2: {
        reference: "CC6.3 · Role-based access",
        meaning:
          "Relevant to adjusting permissions to responsibilities and limiting unnecessary access.",
        check:
          "Does the proposed role support the approved work without giving broader permissions?",
      },
      iso: {
        reference: "A.8.2 · Privileged access",
        meaning: "Relevant to managing administrator-level permissions.",
        check:
          "Who needs this privilege, who can approve it, and how is it reviewed?",
      },
      nist: {
        reference: "PR.AA-05 · Access permissions",
        meaning:
          "Relevant to managing and reviewing permissions with least privilege.",
        check:
          "Have direct and inherited permissions been checked against the account’s responsibilities?",
      },
    },
  },
  exceptions: {
    title: "Can this gap be handled temporarily?",
    invitation:
      "A requirement is not met. Work out what a safe, bounded exception would need.",
    control:
      "Record important administrative activity so it can be investigated. If the required logging is missing, keep the gap visible while reviewing any temporary safeguard.",
    risk: "Missing logs can leave harmful changes untraceable. A temporary safeguard may address part of that exposure, but only while it works and stays within the approved scope.",
    compliance:
      "Document the unmet requirement, safeguard tests, accountable approval, scope and expiry. An exception records a decision about a gap; it does not make the original requirement satisfied.",
    research: [
      "Compare the logging requirement with what the service actually records.",
      "Check the affected environment, requested duration and accountable owner.",
      "Separate a proposed safeguard from a tested one, and a request from approval.",
      "Identify what must hold, who must decide and when the exception needs review.",
    ],
    mappings: {
      soc2: {
        reference: "CC7.2 · System monitoring",
        meaning: "Relevant to noticing and examining unusual system activity.",
        check:
          "Can the monitoring process still detect and investigate the activity affected by this logging gap?",
      },
      iso: {
        reference: "A.8.15 · Logging",
        meaning:
          "Relevant to keeping usable records of security-related activity.",
        check:
          "Does the safeguard capture the missing activity, and what remains outside its coverage?",
      },
      nist: {
        reference: "PR.PS-04 · Logs; ID.RA-07 · Exceptions",
        meaning:
          "Relevant to usable monitoring records and tracking the risk impact of exceptions.",
        check:
          "Is the remaining gap understood, bounded and reviewed when conditions or scope change?",
      },
    },
  },
};

export function CaseGuidance({ caseId }: { caseId: CaseId }) {
  const [framework, setFramework] = useState<Framework>("soc2");
  const guide = caseGuides[caseId];
  const mapping = guide.mappings[framework];
  return (
    <details className="ask-disclosure case-guidance">
      <summary>
        <span>
          <BookOpen size={17} /> Controls, risk & compliance
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="ask-disclosure-body">
        <dl className="case-explanation">
          <div>
            <dt>The control</dt>
            <dd>{guide.control}</dd>
          </div>
          <div>
            <dt>The risk</dt>
            <dd>{guide.risk}</dd>
          </div>
          <div>
            <dt>The compliance record</dt>
            <dd>{guide.compliance}</dd>
          </div>
        </dl>
        <div
          className="framework-picker"
          role="group"
          aria-label="Choose a framework"
        >
          {(["soc2", "iso", "nist"] as const).map((id) => (
            <button
              type="button"
              key={id}
              aria-pressed={framework === id}
              onClick={() => setFramework(id)}
            >
              {frameworks[id].label}
            </button>
          ))}
        </div>
        <section
          className="framework-mapping"
          aria-label={`${frameworks[framework].label} connection`}
          aria-live="polite"
        >
          <span className="ask-small">{frameworks[framework].edition}</span>
          <h3>{mapping.reference}</h3>
          <p>{mapping.meaning}</p>
          <p>
            <strong>Ask your control owner:</strong> {mapping.check}
          </p>
          <a
            href={frameworks[framework].url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the reference <ArrowUpRight size={13} />
          </a>
        </section>
        <p className="case-mapping-note">
          Illustrative connections for this example. Confirm applicability
          against your own controls and scope. A mapping is not a compliance
          assessment or a measure of risk reduction.
        </p>
      </div>
    </details>
  );
}
