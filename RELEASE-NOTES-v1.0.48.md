# v1.0.48 — Reporting integrity and layout correction

**Baseline:** v1.0.47. **Status:** Locally tested candidate, pending Azure DevOps tenant acceptance.

- Explained Accepted / Closed as PM-validated Board Closed; Done remains awaiting review. No ADO workflow state mutated.
- Burndown: no misleading horizontal progress bar with 0/1 distinct recorded observation day; display a meaningful insufficient-history state instead. With >=2 dated observations the actual/ideal SVG line remains available. Show observed and ideal legend.
- Automatic history: same-state progress may be captured once on a later local calendar day when a sprint is loaded. Preserve original snapshots, no fabricated historical days or background scheduler.
- Velocity: compare up to eight previous ended sprints in the selected workspace, including unknown-history gaps; the current sprint is displayed only as a separate progress note. A single current-sprint bar is no longer labeled historical velocity. Last saved historical observations remain as-of measurements rather than assumed final results.
- Move Work Packages hierarchy/estimate drilldown to the final Reports section after Gantt delivery overview.
- No new ADO permissions, licensing changes, Outlook writes, native iteration rewrites or new post-launch analytics features.

**Caution:** Missing historical records cannot be recreated from today's ADO state without inventing outcomes. Validate using real History Records. An Accepted count of zero may be entirely correct if cards are in Board Done rather than Closed; do not conflate native Completed with PM validation.
