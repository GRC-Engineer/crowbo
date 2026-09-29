import slack from "./assets/providers/slack.svg";
import github from "./assets/providers/github.svg";
import notion from "./assets/providers/notion.svg";
import okta from "./assets/providers/okta.svg";
import zendesk from "./assets/providers/zendesk.svg";
import calendar from "./assets/providers/googlecalendar.svg";
import linear from "./assets/providers/linear.svg";
import drive from "./assets/providers/googledrive.svg";
import aws from "./assets/providers/amazonwebservices.svg";
import datadog from "./assets/providers/datadog.svg";

export const providers = {
  slack: { name: "Slack", logo: slack },
  github: { name: "GitHub", logo: github },
  notion: { name: "Notion", logo: notion },
  okta: { name: "Okta", logo: okta },
  zendesk: { name: "Zendesk", logo: zendesk },
  calendar: { name: "Google Calendar", logo: calendar },
  linear: { name: "Linear", logo: linear },
  drive: { name: "Google Drive", logo: drive },
  aws: { name: "AWS", logo: aws },
  datadog: { name: "Datadog", logo: datadog },
};
export type Provider = keyof typeof providers;

export function sourceProvider(id: string): Provider {
  switch (id) {
    case "activity":
      return "zendesk";
    case "directory":
      return "okta";
    case "roles":
      return "zendesk";
    case "calendar":
      return "calendar";
    case "owner":
      return "slack";
    default:
      return "notion";
  }
}

export function ProviderMark({ provider }: { provider: Provider }) {
  return (
    <img
      className="provider-mark"
      src={providers[provider].logo}
      alt=""
      aria-hidden="true"
    />
  );
}

export function ProviderTag({ provider }: { provider: Provider }) {
  return (
    <span className="provider-tag">
      <ProviderMark provider={provider} />
      {providers[provider].name}
      <small>example</small>
    </span>
  );
}
