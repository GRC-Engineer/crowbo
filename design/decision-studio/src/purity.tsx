import { createContext, useContext, useEffect, useState } from "react";

// PROTOTYPE. Four levels of the same demo, each removing one kind of noise
// from the level before. Nothing is added at any level except this switch.
//   0  as shipped
//   1  calm   — one runner moves at a time, no log, no bob
//   2  quiet  — one hint plus ?, no key badges in the body, no header art
//   3  pure   — lands on the inbox, screens cut to record, track and inputs
export type Purity = 0 | 1 | 2 | 3;

export const levels: { level: Purity; name: string; removes: string }[] = [
  { level: 0, name: "As shipped", removes: "nothing" },
  { level: 1, name: "Calm", removes: "motion" },
  { level: 2, name: "Quiet", removes: "controls and art" },
  { level: 3, name: "Pure", removes: "structure" },
];

export function purityFromUrl(): Purity {
  const raw = new URLSearchParams(window.location.search).get("purity");
  const value = Number(raw);
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

export const PurityContext = createContext<Purity>(0);
export const usePurity = () => useContext(PurityContext);

export function usePurityState(): [Purity, (next: Purity) => void] {
  const [purity, setPurity] = useState<Purity>(purityFromUrl);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (purity === 0) url.searchParams.delete("purity");
    else url.searchParams.set("purity", String(purity));
    window.history.replaceState(null, "", url);
  }, [purity]);
  return [purity, setPurity];
}

export function PurityBar({
  purity,
  onChange,
}: {
  purity: Purity;
  onChange: (next: Purity) => void;
}) {
  return (
    <div className="t-proto" role="group" aria-label="Prototype level">
      <span>
        proto <b>L{purity}</b> {levels[purity].name} · removes{" "}
        {levels[purity].removes}
      </span>
      {levels.map((entry) => (
        <button
          type="button"
          key={entry.level}
          aria-pressed={entry.level === purity}
          onClick={() => onChange(entry.level)}
        >
          L{entry.level}
        </button>
      ))}
    </div>
  );
}
