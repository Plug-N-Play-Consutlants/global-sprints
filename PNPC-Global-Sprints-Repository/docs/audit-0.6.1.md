# v0.6.1 — Repository trace and correction report

## Basis and limits
Reviewed the supplied v0.6.0 repository ZIP and prior v0.5.7 exported diagnostics, plus the user's v0.6.0 runtime observations. The `scripts/audit_paths.py` tool scans source for known pathway entry points and writes `docs/audit-trace-0.6.1.json`. Its nine SOURCE_PRESENT results mean the relevant code paths exist, **not** that they pass Azure DevOps or Graph runtime tests.

## Corrected in this build
1. **Cross-project custom state collision (real source defect).** `getStates()` previously mutated the shared `WORKFLOW_MAP` from each project's state metadata. A custom state label from one project could therefore affect other projects with the same label. State-category metadata is now keyed by `project::work-item type`, and destination selection uses that scoped mapping. The global map remains only a fallback for known names when metadata is unavailable. No new source states are invented.
2. **Stale diagnostic filename (real source defect).** Exports were hardcoded as `global-sprints-test-session-0.5.7.json` regardless of installed version. The filename now derives from `DIAG_VERSION`.
3. **Revision evidence clarity.** A state-success event now includes `revisionAdvanced` to distinguish a successful HTTP response from an actual incremented ADO revision. This is diagnostic only.

## Trace matrix
| Pathway | Source evidence | Runtime evidence / limitation | Assessment |
|---|---|---|---|
| Cross-project discovery / addition | WIQL query, assigned-item loading, Board actions | User verified adding a newly created ticket in another project | User-verified |
| Outbound state PATCH | Revision test and `System.State` PATCH; success/failure events | User checked original tickets #820 and #438; prior export recorded HTTP 200 | User-verified |
| Normalization for Agile/Scrum/custom | Work-item-type states endpoint; project/type-scoped mapping after fix | Inherited process ancestry and all custom transition rules not verified | Source-corrected; runtime open |
| Parent-child hierarchy | Parent retrieval and `renderHierarchy`; state PATCH changes only `/fields/System.State` | No before/after hierarchy relationship comparison from API | Source-traced; runtime open |
| Inbound refresh | `reportRefresh`, `loadAssignedItems`, `ado.refresh.completed` | No external-edit roundtrip diagnostic supplied | Runtime open |
| Burndown history | Automatic daily snapshot and manual observation code | User saw first baseline and correctly deferred line; cross-day persistence not yet tested | Partially user-verified |
| Reports, velocity, timeline | Live report aggregation, date-axis and charts | User confirmed visual output, real counts, and demo changes | User-verified |
| Microsoft 365 | MSAL/NAA, calendar discovery, meeting lifecycle | User confirmed event creation; delayed attendee invite remains uncorrelated | User-verified with observation |
| Demo mode | Isolated demo state and edit/blocker event handlers | User verified status and blocker effects | User-verified |
| Diagnostics | Local bounded event history, versioned export, acceptance summary | v0.5.7 export examined; no runtime v0.6.1 export yet | Source-traced |

## Important remaining unknowns
- The repository does **not** currently prove that each participating project uses an Agile or Scrum inherited process. The work-item-type states endpoint is not a process-ancestry verification mechanism. Do not block or classify projects without reliable process metadata.
- The source trace does not prove whether a custom state transition is permitted for a particular work item; ADO remains the authority and rejects invalid transitions.
- A PATCH that only touches `System.State` does not intentionally change hierarchy, but a true integrity check requires comparing relation IDs before and after in ADO.
- A baseline progress snapshot is not proof of long-term retention or accurate multi-day burndown history.
- An immediate Outlook notification followed by a delayed invitation cannot be diagnosed from the existing trace without correlation to Graph event and delivery records.
- Report UI still contains date-editing guidance; user has preferred managing individual ticket dates in source ADO. Defer wording polish to v0.7 rather than silently removing existing capability in this audit.

## Release gate
Static checks and packaging are complete; **v0.6.1 is not runtime-certified**. Next targeted test: open two projects with differing custom state names (if available), check board lanes and transitions, then export diagnostics. Verify an external source-ticket edit is reflected after refresh. Cross-day snapshot persistence can be evaluated later without inventing historical data.
