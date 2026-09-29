import { ArrowUpRight, ChevronRight, Plug } from "./pixel-icons";
import { Badge, Eyebrow } from "./components";
import { feathers } from "./domain";
import {
  ProviderMark,
  providers,
  sourceProvider,
  type Provider,
} from "./providers";
import "./integrations.css";

const proposedScopes: Record<Provider, string> = {
  slack: "Messages and threads from selected channels.",
  zendesk: "Ticket activity and role definitions for a selected team.",
  okta: "People and group membership within the selected team.",
  calendar: "Events and availability from selected calendars.",
  notion: "Pages explicitly shared with Crowbo, including policies.",
  github: "Pull requests, reviews and change records in selected repositories.",
  linear: "Issues, project plans and deadlines from selected teams.",
  drive: "Selected files and their version metadata.",
  aws: "Selected object metadata and infrastructure configuration records.",
  datadog: "Selected monitor results and incident events.",
};

const integrationOrder: Provider[] = [
  "slack",
  "zendesk",
  "okta",
  "calendar",
  "notion",
  "github",
  "linear",
  "drive",
  "aws",
  "datadog",
];

function exampleSources(provider: Provider) {
  return feathers.filter((source) => sourceProvider(source.id) === provider);
}

export function Integrations({
  onInspect,
}: {
  onInspect: (provider: Provider) => void;
}) {
  return (
    <div className="integrations">
      <div className="integration-demo-note">
        <Plug size={19} />
        <div>
          <strong>Demo workspace</strong>
          <p>
            No tools are connected. Explore example mappings and proposed access
            below; the source records are synthetic.
          </p>
        </div>
      </div>
      {[
        { label: "Tools represented in this decision", hasSources: true },
        { label: "Other design examples", hasSources: false },
      ].map((group) => (
        <section className="integration-group" key={group.label}>
          <h2>{group.label}</h2>
          <ul className="integration-list">
            {integrationOrder
              .filter(
                (provider) =>
                  exampleSources(provider).length > 0 === group.hasSources,
              )
              .map((provider) => {
                const count = exampleSources(provider).length;
                return (
                  <li key={provider}>
                    <button
                      className="integration-row"
                      onClick={() => onInspect(provider)}
                      aria-label={`View ${providers[provider].name} integration`}
                    >
                      <span className="integration-logo">
                        <ProviderMark provider={provider} />
                      </span>
                      <span className="integration-name">
                        <strong>{providers[provider].name}</strong>
                        <span>{proposedScopes[provider]}</span>
                      </span>
                      <span className="integration-records">
                        {count > 0
                          ? `${count} example ${count === 1 ? "record" : "records"}`
                          : "No example records"}
                      </span>
                      <Badge>Not connected</Badge>
                      <ChevronRight size={17} />
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function IntegrationDetails({
  provider,
  onViewSources,
}: {
  provider: Provider;
  onViewSources: (provider: Provider) => void;
}) {
  const count = exampleSources(provider).length;
  return (
    <div className="integration-details">
      <div className="integration-detail-identity">
        <span className="integration-logo">
          <ProviderMark provider={provider} />
        </span>
        <Badge>Not connected</Badge>
        <span>Demo example</span>
      </div>
      <dl className="source-meta">
        <dt>Permissions</dt>
        <dd>None granted</dd>
        <dt>Last sync</dt>
        <dd>Never</dd>
        <dt>Sync schedule</dt>
        <dd>Not configured</dd>
      </dl>
      <section className="integration-scope">
        <Eyebrow>Proposed access · read only</Eyebrow>
        <p>{proposedScopes[provider]}</p>
        <small>
          Illustrative scope for this design. No access is requested or granted
          in the demo.
        </small>
      </section>
      <section className="integration-source-link">
        <h2>Sources from {providers[provider].name}</h2>
        <p>
          {count > 0
            ? `${count} synthetic ${count === 1 ? "record is" : "records are"} mapped to this tool in the current decision. They were not synced from a live account.`
            : "This tool has no source records in the current demo."}
        </p>
        {count > 0 && (
          <button
            className="primary-button"
            onClick={() => onViewSources(provider)}
          >
            View {count} example {count === 1 ? "source" : "sources"}
            <ArrowUpRight size={16} />
          </button>
        )}
      </section>
    </div>
  );
}
