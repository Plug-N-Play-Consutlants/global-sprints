# v1.0.49 — Delivery-first health and cross-sprint scheduling continuity

**Baseline:** v1.0.48. **Status:** Local candidate pending live tenant acceptance; not a commercial release.

## Reporting

- **Primary Sprint Health = development delivered:** Board **Done + Closed** versus **Active/New**, not accepted-only. The progress bar and compact Planning health follow the same Board-stage classification. Example 23/41 delivered ≈ 56% (item-count; not story-point weighted).
- **QA is separate:** Awaiting validation, Accepted/Closed, open active Bug/Defect work items, and reopened items evidenced by prior observations. Done is delivery completion, not QA clearance or proof of defect-free software.
- Burndown/Velocity completion remains Done OR Closed, with reopened work returning to remaining effort at the recorded estimate owner. Prior observation history is immutable and absent dates are not manufactured.
- Retain existing blocked/overdue/unloaded warnings, historical velocity and Work Packages at bottom of Reports. No changes to native ADO states or iterations.

## Meetings

- Recurring Outlook meeting series booked while planning Sprint 2 can cover later Global Sprints in the same workspace through their recorded end dates. The planner recognizes actual unexcluded occurrences, even when a series has a prior sprint ID.
- A read-only **Ceremony coverage for this sprint** summary appears above the saved schedule list, with booking/commitment status and recorded end date. Sprints can switch and close without independently ending active workspace schedules.
- New **Plan replacement…** action on committed active schedules prefills an independent, user-reviewed project-period plan using the selected sprint duration but the NEW period's start/end; successive ceremonies default to repeating when the chosen horizon spans multiple cycles. **No Outlook events change at this stage.** Existing recurrence collision checks remain in the preview; creating and booking a replacement remains explicitly confirmed.
- **End schedule…** no longer treats past, recorded-as-finished Outlook bookings as active blockers; the source booking is preserved in schedule history. Future active series and unresolved Outlook operations still require actual cancellation/reconciliation. Clear All Meetings remains the deliberate cancellation path with attendee notification; no destructive call was executed in this build.

**Boundaries:** Scope is workspace-level (not yet a project-ID-scoped contract inside a multi-project workspace). This build does not implement partial-series Outlook recurrence truncation or an atomic cutover. All live Graph cancellation, attendee-notice, authorization and restart tests are still pending.
