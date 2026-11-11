# Live acceptance checklist — Global Sprints v1.0.40

**Not yet executed in this build environment.** Run in a representative Azure DevOps organization and organizer-owned Microsoft 365 tenant; do not assume local tests prove delivery or permissions.

## Deployment and release
- [ ] Clean extraction to `PNPC-Global-Sprints-Repository`, no legacy extension tree or package scripts.
- [ ] Build on Windows default Python and Node without PYTHONUTF8 / environment hacks.
- [ ] Check installed ADO version equals UI header and manifests (`1.0.40`); no new scopes to approve.
- [ ] Check original v1.0.39 VSIX is retained for rollback and existing workspace records remain readable.

## Process and hierarchy
- [ ] Agile Story (New → Active → Resolved → Closed), Scrum PBI, Basic Issue, CMMI Requirement and inherited/custom Complete/Resolved workflows; test each permitted transition from the Board.
- [ ] Browse a project whose latest tasks have a parent Story outside the 200-item recent window. Confirm parent appears in selection list.
- [ ] Select Story/PBI + child tasks in one action, including children outside browse window; all show on Board and survive refresh.
- [ ] Test tasks in other native iterations, other active Global Sprints, a closed historical sprint, and source items without access; no silent reassignment.
- [ ] Confirm child task states and assignees change independently; the parent state never auto-mutates.
- [ ] Confirm card assignee lookup, comments and @mentions continue to work.

## Reporting and history
- [ ] Five-point Story with three child Tasks reports five story points (not eight), while task Remaining Work is measured separately.
- [ ] Feature-only estimate contributes once when it is the explicit parent commitment, and never appears in two sprints' velocity without allocation.
- [ ] Historical baseline, velocity, burndown, Sprint Health and Gantt are consistent after selecting and removing hierarchy items.
- [ ] Open report drilldowns, filter work packages and inspect individual source work items.
- [ ] Save, finalize and reopen retrospective; verify action ownership, due dates, immutable historical versions and switch/refresh persistence.

## Outlook and workspace lifecycle (test with real attendee mailboxes)
- [ ] Book a committed schedule; verify actual organizer event and attendee invites.
- [ ] Clear All Sprint Meetings cancels only one sprint's events in a multi-sprint schedule; other sprint invitations remain.
- [ ] Clear All Meetings on a committed schedule cancels entire schedule, including recurring events, with attendee notifications.
- [ ] Cross-sprint recurring series is blocked for sprint-level bulk cancel; cancellations are not duplicated when retried.
- [ ] Force/observe a Graph failure and pending cancellation: operations stop, the workspace stays active, failures can be reconciled.
- [ ] Close Out cancels remaining Outlook events, retains history, hides archived workspace; Restore preserves records but requires a new sprint/schedule and issues no automatic Outlook invitations.
- [ ] Confirm license outage retains last valid entitlement; explicit expired paid/trial status is denied; authoritative Product Command denial still governs.

**Release decision:** No commercial publication until critical/high issues found above are closed and actual Outlook attendee-cancellation behavior is verified.
