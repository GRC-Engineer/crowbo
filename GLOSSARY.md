# Glossary

**Subject**: the one thing a decision is about: an account in a system and scope, a finding, or an exception. Subjects are joined only by explicit identifiers, never by display names. _Avoid_: case (a case is a reasoning request), entity, asset.

**Source revision**: one immutable version of a record from a connected system, identified by a hash of its content.

**Source head**: the current revision of a source together with its access grant, readiness and withdrawal state.

**Grant**: who may read a source and which processors may handle it, with the time it was checked and when it expires. It is operator input, not authentication.

**Team**: the group whose members may see a subject's standing decisions, and only when they can also read every source behind them. A team narrows who can see a decision; it never widens it.

**Fact**: one assertion about a subject: stated, unknown or conflicting. It is either bound to exact quotes in source revisions or attributed to the operator who asserted it. A fact records what was asserted, not what is true. _Avoid_: signal.

**Operator assertion**: a fact attributed to the reader who stated it, with no source quote. It is never treated as verified.

**Standing question**: a recurring question about a subject, with a fixed shape: *should this account keep this access*, *can this finding close*, *is this exception still valid*. _Avoid_: saved query.

**Novel question**: any question that is not a standing question. It is answered by full reasoning over selected evidence and stays private to the asker.

**Criteria**: the approved, evaluated logic that turns facts into a verdict for one standing question. _Avoid_: policy, which is reserved for the customer's own policies.

**Evaluation gate**: the recorded result of evaluating a criteria version: how many cases, whether it passed, and who approved it. Criteria serve answers only after a passing gate.

**Decision version**: one immutable answer to a standing question for a subject, pinned to the facts, revisions and criteria it was computed from. _Avoid_: cached result.

**Current / Stale / Blocked / Unavailable**: how a decision reads at the moment of asking.
- *Current*: every input still holds.
- *Stale*: the answer is still shown, with reasons, because an input aged out.
- *Blocked*: the answer is withheld because its sources or facts conflict.
- *Unavailable*: the caller may not see it. No detail is disclosed.

**Assessment**: Jev's typed answers to named questions about one source revision. It is an interpretation, never a priority or risk score.

**Simulated**: advice that grants no authority and changes no system. Every recommendation and decision version is simulated.
