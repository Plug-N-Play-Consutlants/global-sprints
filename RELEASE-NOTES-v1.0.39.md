# Global Sprints v1.0.39 — Process-aware Board state transitions

## Source baseline

Reconstructed deployable v1.0.38 source, not the original Git repository. Package keeps the Azure DevOps extension publisher/ID and all existing scopes. No source project items are written during this build or test run.

## Defect addressed

Moving cards from In Progress to Done could fail for native Agile and custom work-item types whose finished states do not match a short fixed list of names (for example, `Complete`). An earlier implementation also unconditionally treated a native state called `Resolved` as a Done stage, even when Azure DevOps reports that state's category as `InProgress` (some CMMI/Agile subtypes). State definitions are specific to **project and work-item type**, not just a process label.

## Changes

1. Read the actual work-item-type `states` REST response, including each state's category; accept either `category` or `stateCategory` fields. Interpret `Proposed`, `InProgress`, `Resolved`, `Completed`, and `Removed` categories as source-authoritative. Category metadata takes precedence over state-name guesses.
2. Resolve target state candidates according to their native categories. For Global Sprints Done, prefer a native `Resolved`-category state, then a native `Done` stage, then a native `Completed`-category terminal state. When the native state is terminal, preserve a per-sprint Board Done override (accepted v1.0.36 behaviour).
3. Support names `Complete`, `Completed`, `Closed`, `Done`, `Finished` and arbitrarily named `Completed`-category states, without embedding a per-project map. If the only finishing-named state is categorized as `InProgress`, allow its selection but retain ADO's authoritative incomplete status in reporting.
4. Before any *real* state change, use the official Work Item Update `validateOnly=true` endpoint. If the project's rules reject a candidate, test the next suitable native candidate without saving invalid state changes. A failure leaves the card in its original Board column.
5. Re-read the workflow metadata if there is no eligible candidate or if validation rejects all candidates and the cached process metadata has changed. Report project, type, and transition details in sanitized diagnostic events.
6. Final Completed/Closed Board acceptance remains an explicit display decision where ADO already has a terminal state. Do not manufacture an unsupported second native state.
7. Update the **visible header**, diagnostic version, both manifests, and packaging script to 1.0.39.

## Preserved

Card assignment picker, @mentions, commenting, work-item editing, planning queue, sprint history, Sprint Health's native-state interpretation, Outlook meeting scheduler, licensing, Gantt, reporting, and extension scopes are unchanged. Existing assignment and identity tests continue to pass.

## Automated tests

`node --check app.js`, `node process-agnostic.test.cjs` (18 cases), `node workflow-and-mentions.test.cjs`, `node assignment.test.cjs`, `node identity-resolution.test.cjs`, verified source archive and VSIX, and version metadata checks. Validation uses mock ADO responses; no real project transition or Azure DevOps authorization was exercised. The actual configured workflow for the user's affected Agile project remains unknown until live testing.

## Acceptance

- Confirm ADO Installed and Global Sprints header both show v1.0.39.
- In the affected Agile project, move an active ticket into Done; verify its native ADO state changes to the supported completion state and its Global Sprints card stays in Done after refresh.
- Check that moving it to the final Completed column is deliberate and does not invent a nonexistent ADO state.
- Check a previously accepted project still moves correctly and that card assignment and @mentions still work.
- If a transition fails, export Support Diagnostics; `ado.workflow.transition_validation_rejected` identifies the exact project/type/state and native validation error. Some custom process rules legitimately restrict transitions and cannot be bypassed by a marketable extension.
