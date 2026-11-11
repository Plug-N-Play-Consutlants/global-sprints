# Global Sprints v1.0.40 — Consolidated Pre-Release Release Candidate

Baseline: previously accepted v1.0.39. The Azure DevOps extension identity remains `PlugNPlayConsultants.global-sprints`; no permission scopes added.

## Repository/build correction
- Single canonical source (`src/app-main.js`, `src/gs40-runtime.js`, `src/gs40-core.js`) and deterministic VSIX bundling.
- Explicit UTF-8 reads for the default Windows Python build; no legacy `extension/` directory or parallel package scripts.
- Manifest/header/runtime/version validation and comparison of tested JavaScript to actual VSIX contents.
- Removed unused licensing-contract from shipped runtime; archived for historical reference.

## Planning/Board
- Browse missing source hierarchy ancestors, distinguish User Story/PBI from linked Task children, and add an entire hierarchy-aware work package in one action.
- Fetch actual ADO child links beyond the 200-most-recent browse window; source native iteration and other sprint conflicts are excluded with clear feedback rather than silently changing them.
- Retain individual-ticket queueing and state/assignment editing. Parent and child cards remain individually actionable; linked-child summary is available from the parent card.

## Reporting, retrospectives
- Store new snapshot parentId and task remaining work; update observation fingerprints, use first recorded baseline versus latest observation when comparing velocity progress.
- Count estimates once at the owning commitment: story/PBI/requirement or Feature only when Feature is sole estimate owner. Child task remaining-work is a separate time metric; overlapping multi-sprint Features are flagged/excluded from live totals rather than counted repeatedly.
- Expand Sprint Health metrics to distinguish commitment units from child tasks. Add searchable, clickable work-package report breakdown.
- Add Sprint Retrospective with draft, finalize, follow-up owner/due dates, preserved historical versions and explicit revision reopening.

## Meeting/workspace lifecycle
- Add **Clear All Sprint Meetings**, scope-guarded by sprint meeting identity or non-recurring meeting date; do not delete other sprints' events. Cross-sprint recurring Outlook series and unresolved legacy operations require manual handling.
- Add **Clear All Meetings** to committed saved schedules for deliberate schedule-wide bulk cancellation.
- Both bulk paths use existing organizer-owned Graph cancellation, attendee notices and per-event reconciliation. Stop on failure and retain cancellation history.
- Replace Archive control with **Close Out**: cancel outstanding workspace meetings, archive workspace/history, retain records for restoration and require fresh planning. Preserve workspace on partial failure.

## Licensing and support
- Restore cached Product Command decisions outage-tolerantly; reject any verified explicit expired paid or trial entitlement.
- Keep all accepted v1.0.39 Board-state resolution, assignee lookup, @mentions, Gantt, Outlook booking and licensing endpoints otherwise unchanged.

## Known limits / release gates
- The historical original repository/TypeScript project was not available; legacy bundled application source remains largely single-line. New functions are kept in readable canonical source modules.
- Automated tests do not perform live ADO writes or Outlook Graph mutations. Complete `ACCEPTANCE-v1.0.40.md` before publishing. Windows encoding issue is addressed in code but the build was executed in Linux for this package.
- Feature estimates spanning multiple Global Sprints require explicit allocation to sprint-specific work items before accurate velocity credit. Old snapshots are not retroactively altered.
- Graph recurring series can span multiple sprints; sprint-only bulk cancel refuses these rather than cancelling unintended occurrences. Cancel such series manually or use the clearly scoped full-schedule action.
