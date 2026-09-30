import { useContext, useEffect, useReducer, useState } from "react";
import { useReducedMotion } from "motion/react";
import { DecideScreen } from "./decide-screen";
import {
  useAccessDecision,
  useWorkflowDecision,
  type DecisionView,
} from "./decision-view";
import {
  ConfirmScreen,
  HomeScreen,
  ReadScreen,
  StartScreen,
  type Chrome,
} from "./flow-screens";
import {
  demoInitialState,
  demoReducer,
  type CaseId,
} from "./question-demo-model";
import { PurityBar, PurityContext, usePurityState } from "./purity";
import type { Area } from "./terminal-parts";
import {
  HistoryScreen,
  OutsideScreen,
  QueueScreen,
  SourcesScreen,
} from "./workspace-screens";
import "./terminal.css";

const titles: Record<Area, string> = {
  flow: "Ask a question",
  queue: "Decisions",
  sources: "Sources",
  history: "History",
  outside: "CLI and assistant",
};

// The whole demo: the question flow and the four workspace pages share one
// set of decisions, so a reassessment made in the flow shows in the queue.
export default function Demo({ initialArea = "flow" }: { initialArea?: Area }) {
  const [purity, setPurity] = usePurityState();
  return (
    <PurityContext.Provider value={purity}>
      <Screens initialArea={purity === 3 ? "queue" : initialArea} />
      <PurityBar purity={purity} onChange={setPurity} />
    </PurityContext.Provider>
  );
}

function Screens({ initialArea }: { initialArea: Area }) {
  const [state, dispatch] = useReducer(demoReducer, demoInitialState);
  const [area, setArea] = useState<Area>(initialArea);
  const reducedMotion = Boolean(useReducedMotion());
  const decisions: Record<CaseId, DecisionView> = {
    remediation: useWorkflowDecision("remediation"),
    access: useAccessDecision(),
    exceptions: useWorkflowDecision("exceptions"),
  };

  useEffect(() => {
    document.title = `Crowbo · ${titles[area]}`;
  }, [area]);

  // PROTOTYPE L3: there is no start screen; a question begins at home.
  const purity = useContext(PurityContext);
  useEffect(() => {
    if (purity === 3 && state.kind === "welcome") dispatch({ type: "open" });
  }, [purity, state.kind]);

  useEffect(() => {
    if (area !== "flow" || state.kind !== "research" || state.paused) return;
    const timer = window.setTimeout(() => dispatch({ type: "tick" }), 2200);
    return () => window.clearTimeout(timer);
  }, [area, state]);

  const chrome: Chrome = {
    area,
    onArea: setArea,
    onHome: () => {
      setArea("flow");
      dispatch({ type: "home" });
    },
  };
  const open = (caseId: CaseId) => {
    dispatch({ type: "show", caseId });
    setArea("flow");
  };
  const ask = () => {
    dispatch({ type: "question" });
    setArea("flow");
  };

  if (area === "queue")
    return (
      <QueueScreen
        chrome={chrome}
        decisions={decisions}
        onOpen={open}
        onNew={ask}
      />
    );
  if (area === "sources")
    return <SourcesScreen chrome={chrome} decisions={decisions} />;
  if (area === "history")
    return (
      <HistoryScreen chrome={chrome} decisions={decisions} onOpen={open} />
    );
  if (area === "outside")
    return (
      <OutsideScreen chrome={chrome} decisions={decisions} onOpen={open} />
    );

  switch (state.kind) {
    case "welcome":
      return <StartScreen chrome={chrome} dispatch={dispatch} />;
    case "question":
      return (
        <HomeScreen
          chrome={chrome}
          state={state}
          dispatch={dispatch}
          decisions={decisions}
        />
      );
    case "confirm":
      return (
        <ConfirmScreen
          chrome={chrome}
          caseId={state.caseId}
          dispatch={dispatch}
        />
      );
    case "research":
      return (
        <ReadScreen
          chrome={chrome}
          state={state}
          dispatch={dispatch}
          reducedMotion={reducedMotion}
        />
      );
    case "result":
      return (
        <DecideScreen
          key={state.caseId}
          chrome={chrome}
          decision={decisions[state.caseId]}
          onTryAnother={ask}
          reducedMotion={reducedMotion}
        />
      );
  }
}
