# Shared synthetic workflow cases

These three `*.v1.json` files export the **same authored records and candidate advice used by the frontend**. They are suitable inputs for backend development comparisons, not saved backend results, hidden evaluation cases or qualified expectations. No backend replay was run by this frontend task.

Edit the typed source modules (`src/access-sources.ts`, `src/access-checks.ts`, `src/access-review-model.ts`, `src/workflow-cases.ts`), then run `npm run cases:export`. `npm test` checks exact export parity before exercising behavior. Do not edit the generated packets independently. Increment the specification version when changing a published case's meaning.

Each packet gives the question and exact subject scope; stages with authored advice and available updates; exact `sourceRefs` resolving into `sourceRecords`; source quotations, interpretation, limits, periods, identities and provenance groups; explicit joins; and coverage of ten candidate source families. One source revision is stored once. An absent linked record stays unresolved. A shared origin is not independent corroboration. The non-access irrelevant overlay adds its single source without changing the current advice.

Record an operator's synthetic choice separately from source facts. Apply an update only after explicit reassessment, and retain the previous stage and its source references. A deployment cannot supply verification; a request cannot supply approval; a choice cannot create an outcome record. Free-text context is unverified and does not choose a stage.

The frontend selects at most 12 source records in the currently authored branches, below the 15-source packet bound. These packets do not simulate a connected backend's inherited-feedback accounting or permission enforcement. A later backend run must retain its actual result, source and criteria versions and report differences from this authored presentation, without relabelling the candidate advice as the model's output.
