import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import tokenSource from "../src/tokens.css?raw";
import "../src/tokens.css";
import "../src/styles.css";
import "../src/identity.css";
import "./brand.css";
import { Crow } from "../src/components";
import {
  FeatherGlyph,
  featherDesigns,
  type FeatherDesign,
} from "../src/identity";
import * as pixelIcons from "../src/pixel-icons";

const { ArrowRight } = pixelIcons;

const poses = import.meta.glob<string>(
  "../../crow-concepts/2026-09-29/state-poses/web/*.png",
  { eager: true, import: "default" },
);

const poseNotes: Record<string, { name: string; use: string; wide?: true }> = {
  "01-inspecting": { name: "Inspecting", use: "Reading one source record" },
  "02-weighing": { name: "Weighing", use: "Comparing two options" },
  "03-challenging": { name: "Challenging", use: "A reviewer disputes a fact" },
  "04-unresolved": {
    name: "Unresolved",
    use: "Missing evidence, empty states, 404",
  },
  "05-resting": { name: "Resting", use: "Motion paused" },
  "06-pointing": { name: "Pointing", use: "The next action" },
  "12-compact-head": {
    name: "Compact head",
    use: "Inline mark beside a label",
  },
  "09-feather-in-beak": {
    name: "Carrying a feather",
    use: "A new source was added",
  },
  "07-expressions": {
    name: "Expressions",
    use: "Six head studies",
    wide: true,
  },
  "08-size-ladder": {
    name: "Size ladder",
    use: "16, 24 and 40 pixel grids",
    wide: true,
  },
  "10-pair": { name: "Pair", use: "Owner and reviewer", wide: true },
  "11-runner-carrying": {
    name: "Runner with a record",
    use: "Packet Runner delivering",
    wide: true,
  },
};

const tokens = [
  ...tokenSource.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi),
].map(([, name, hex]) => ({ name, hex: hex.toUpperCase() }));
const selected = new Set(["--chalk", "--sage", "--ink", "--oxide"]);
const supporting = new Set(["--base", "--charcoal"]);
const neutral = tokens.filter(({ name }) => !name.startsWith("--oxide"));
const warm = tokens.filter(({ name }) => name.startsWith("--oxide"));

const type = [
  {
    family: "var(--pixel)",
    name: "Geist Pixel Square",
    role: "Wordmark only",
    sample: "crowbo",
    size: 64,
  },
  {
    family: "var(--display)",
    name: "Bricolage Grotesque",
    role: "Headings",
    sample: "Test a role that fits the work",
    size: 34,
  },
  {
    family: "var(--body)",
    name: "Space Grotesk",
    role: "Reading text",
    sample:
      "Keep tickets and own-queue exports. Remove broad administration after the owner reviews the role.",
    size: 17,
  },
  {
    family: "var(--mono)",
    name: "Departure Mono",
    role: "Labels, versions, source ids",
    sample: "DECISION 001 · VERSION 2",
    size: 12,
  },
];

const copy = [
  ["Small signals. Connected.", "Records a decision draws on"],
  ["Decisions, with context.", "Removed. The heading already says it."],
  ["01 / A little perspective", "Removed. It labelled nothing."],
  [
    "Start with a question. Put the context around it.",
    "Pick a prepared security question and see the records behind the recommendation.",
  ],
  ["Same work. Different tradeoffs.", "Options for the same work"],
  [
    "Twelve shapes. Different kinds of context.",
    "Twelve feather shapes, one per kind of source",
  ],
  [
    "The original stays. The context grows.",
    "Earlier versions stay available.",
  ],
];

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="brand-section" aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        <p>{note}</p>
      </header>
      {children}
    </section>
  );
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  const status = selected.has(name)
    ? "Selected"
    : supporting.has(name)
      ? "Supporting"
      : "Step";
  return (
    <li className={`swatch swatch-${status.toLowerCase()}`}>
      <span className="swatch-chip" style={{ background: `var(${name})` }} />
      <code>{name}</code>
      <span>{hex}</span>
      <span className="swatch-status">{status}</span>
    </li>
  );
}

function Brand() {
  return (
    <div className="brand">
      <header className="brand-masthead">
        <div>
          <a className="brand-wordmark" href="../">
            crowbo
          </a>
          <h1>Brand system</h1>
          <p>
            The rules that make a Crowbo page look like Crowbo. Everything here
            is rendered from the same tokens, icons and artwork the website
            uses. The brand guide in the repository records what was selected
            and when.
          </p>
        </div>
        <Crow />
      </header>

      <Section
        id="characters"
        title="Characters"
        note="Modular Crow is the primary character. Packet Runner is the flying companion. Both were selected on 24 September 2026."
      >
        <ul className="character-grid">
          <li>
            <Crow />
            <strong>Modular Crow</strong>
            <span>Opening, landing page, source network</span>
          </li>
          <li>
            <Crow pose="glide" />
            <strong>Packet Runner, glide</strong>
            <span>Page headings</span>
          </li>
          <li>
            <Crow pose="up" />
            <strong>Packet Runner, up</strong>
            <span>Progress</span>
          </li>
          <li>
            <Crow pose="down" />
            <strong>Packet Runner, down</strong>
            <span>End of a list</span>
          </li>
        </ul>
      </Section>

      <Section
        id="poses"
        title="Crow state poses"
        note="Candidates generated on 29 September 2026 from the approved crow. None is selected and none is used in the product. The grid is approximate, so a selected pose needs a redraw on the native grid before use."
      >
        <ul className="pose-grid">
          {Object.entries(poseNotes).map(([key, pose]) => {
            const source = Object.entries(poses).find(([path]) =>
              path.includes(key),
            )?.[1];
            return (
              <li key={key} className={pose.wide ? "pose-wide" : undefined}>
                <img
                  src={source}
                  alt={`Candidate crow pose: ${pose.name}`}
                  loading="lazy"
                />
                <strong>{pose.name}</strong>
                <span>{pose.use}</span>
                <em>Candidate</em>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        id="colour"
        title="Colour"
        note="Four selected colours and two supporting values. Every other step sits between them. Near-black carries most of the area, chalk carries reading contrast, sage carries sources and structure, and oxide marks the one thing to act on."
      >
        <div
          className="proportion"
          aria-label="Approximate share of area: near-black 70 percent, chalk 15, sage 10, oxide 5"
        >
          <span style={{ background: "var(--ink)", flexGrow: 70 }} />
          <span style={{ background: "var(--chalk)", flexGrow: 15 }} />
          <span style={{ background: "var(--sage)", flexGrow: 10 }} />
          <span style={{ background: "var(--oxide)", flexGrow: 5 }} />
        </div>
        <ul className="swatches">
          {neutral.map((token) => (
            <Swatch key={token.name} {...token} />
          ))}
        </ul>
        <ul className="swatches">
          {warm.map((token) => (
            <Swatch key={token.name} {...token} />
          ))}
        </ul>
      </Section>

      <Section
        id="type"
        title="Type"
        note="Four local typefaces, one job each. One uppercase mono label per block. No text is set below 11 pixels."
      >
        <ul className="type-list">
          {type.map((face) => (
            <li key={face.name}>
              <div>
                <strong>{face.name}</strong>
                <span>{face.role}</span>
              </div>
              <p style={{ fontFamily: face.family, fontSize: face.size }}>
                {face.sample}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="shape"
        title="Shape"
        note="The crow is drawn in square pixels, so the interface is too. One grid pixel is 4 CSS pixels."
      >
        <ul className="shape-grid">
          <li>
            <div className="shape-demo shape-square" />
            <strong>Square corners</strong>
            <span>Panels, inputs, dialogs</span>
          </li>
          <li>
            <div className="shape-demo shape-stepped pixel-corner" />
            <strong>Stepped corner</strong>
            <span>Primary buttons and tags</span>
          </li>
          <li>
            <div className="shape-demo shape-shadow" />
            <strong>Hard shadow</strong>
            <span>Floating layers only</span>
          </li>
          <li>
            <div className="shape-demo shape-mark">
              <i />
              <i />
              <i />
            </div>
            <strong>Square marks</strong>
            <span>Status, packets, bullets</span>
          </li>
          <li>
            <div className="shape-demo shape-wire" />
            <strong>Right-angle wires</strong>
            <span>Connections between sources</span>
          </li>
        </ul>
        <p className="shape-never">
          Not used: rounded corners, circles, blurred shadows, frosted overlays,
          glow rings, faded grids and gradient fills. A test fails the build if
          a stylesheet adds one.
        </p>
      </Section>

      <Section
        id="icons"
        title="Icons"
        note="Thirty-one icons drawn on a 16-unit grid from filled rectangles, so they share the stepped edges of the crow and the feathers."
      >
        <ul className="icon-grid">
          {Object.entries(pixelIcons).map(([name, Icon]) => (
            <li key={name}>
              <span>
                <Icon size={32} />
                <Icon size={24} />
                <Icon size={16} />
              </span>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="feathers"
        title="Feathers"
        note="Twelve feather shapes, one per kind of source. The circuits inside them are drawn, not measured."
      >
        <ul className="feather-grid">
          {(Object.keys(featherDesigns) as FeatherDesign[]).map((kind) => (
            <li key={kind}>
              <FeatherGlyph kind={kind} />
              <strong>{featherDesigns[kind].label}</strong>
              <span>{featherDesigns[kind].use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="components"
        title="Components"
        note="The same classes the demo uses."
      >
        <div className="component-row">
          <button className="primary-button" type="button">
            Review next action <ArrowRight size={16} />
          </button>
          <button className="secondary-button" type="button">
            Compare options
          </button>
          <span className="badge oxide">Owner review pending</span>
          <span className="badge">Synthetic source</span>
        </div>
      </Section>

      <Section
        id="voice"
        title="Voice"
        note="A line says what the thing is or does. If it could sit unchanged on another product's page, it is cut."
      >
        <table className="copy-table">
          <thead>
            <tr>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {copy.map(([before, after]) => (
              <tr key={before}>
                <td>{before}</td>
                <td>{after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <footer className="brand-footer">
        <span>Unlisted page. Not indexed.</span>
        <span>Crowbo, 2026</span>
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The Crowbo root element is missing.");
createRoot(root).render(
  <StrictMode>
    <Brand />
  </StrictMode>,
);
