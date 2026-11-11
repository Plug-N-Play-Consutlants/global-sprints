# Global Sprints v1.0.43 — Scheduling Lifecycle & Planning Guidance

Status: **pre-release candidate**, not published or live accepted. Built from the v1.0.42 source and accepted v1.0.41 Board foundation.

## Corrected

1. Planning Guidance now recognizes saved workspace meeting schedules associated with the selected sprint, including cross-sprint recurrence, instead of relying exclusively on the legacy `sprint.ceremonies` array. Guidance distinguishes planned, committed and Outlook-booked records and can open the related schedule.
2. A completed historical schedule is derived from dated meeting/recurrence records and booking/completion evidence. This includes booked historical schedules labeled Draft. Such schedules appear as **Completed** in collapsed **History** and no longer count as active meetings or block current planning. Historical records and Outlook references are preserved untouched.
3. Unresolved booking operations, recurring meetings whose end is future or unknown, contradictory records and unbooked stale drafts remain visible for review. Legacy booked Drafts can be committed to manage their bookings without re-sending invitations.
4. Outlook booking controls for uncommitted saved schedules are disabled; direct booking has a matching preflight guard. Bulk cancellation and workspace closeout filter reliably finished past meeting records; they do not retrospectively cancel those meetings.
5. Archived completed schedules no longer clutter the active Meeting editor. Past booked records remain accessible for review in schedule History. Current active schedules retain their normal calendar and management controls.
6. Living PROJECT.md and validation/acceptance documentation updated in the source package.

## Safety and limitations

- No Outlook/Graph operations run when a schedule is displayed as Completed. Classification is read-only and based on stored record state; it is **not a fresh Graph verification**.
- The last completed source records are preserved, including `outlook.eventId`, `calendarId`, booking status and meeting notes.
- No new Azure DevOps permission scopes. Licenses, Board hierarchy, effort, state transitions, @mentions, Gantt, navigation and Outlook account connections remain unchanged.
- Tests use synthetic/mock data. Real Outlook cancellation, error reconciliation, notifications, and archive/restoration acceptance remain pending.
- Source is still a reconstructed deployable application with legacy bundled main module. No general refactoring performed.

## Files

- VSIX: `Global-Sprints-v1.0.43.vsix`
- Source ZIP: `Global-Sprints-Source-v1.0.43.zip`, containing `PNPC-Global-Sprints-Repository/PROJECT.md`, `AGENTS.md`, code, tests, documentation and build script.
- Combined ZIP: `Global-Sprints-v1.0.43-Complete-Package.zip`.
