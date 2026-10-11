# PNPC Global Sprints

Azure DevOps extension source baseline reconstructed from the **runtime-verified v0.3.48 VSIX**.

## Repository structure

- `extension/`: deployable source assets and manifests extracted unchanged from v0.3.48.
- `scripts/validate.py`: local static and packaging checks.
- `scripts/package.py`: reproducible VSIX packaging from the `extension/` directory.
- `docs/build-history.md`: artifact-level changes across available historical VSIX builds.
- `docs/production-readiness.md`: current limitations and next stabilization work.

## Important

This is the first source-control baseline, **not** evidence of a prior Git history or a complete production-ready codebase. Do not upload `.vsix` packages as the only source code. The checked-in `extension/` directory is the editable application; VSIX packages are generated releases.

The packaged vendor libraries are preserved as supplied by the verified build; their versions, licenses, and future update strategy should be documented before public release.

## Local workflow

From the repository root:

```powershell
python scripts/validate.py
python scripts/package.py
```

This uses Python's standard library. It does not require npm, tfx, or an internet connection. For production, add a pinned dependency pipeline, automated tests and Marketplace release controls.

## Baseline

v0.3.48: Azure DevOps extension loads and Microsoft 365 NAA sign-in was verified by the product owner. Calendar operations have not yet been implemented. Keep this as a rollback checkpoint while stabilization changes are tested.

## v0.3.50

- Removed obsolete Microsoft 365 migration UI and identifiers.
- Added on-demand Microsoft Graph calendar discovery after successful sign-in.
- Calendar preference is browser-local and scoped to Microsoft account and Azure DevOps organization; it is not written to the shared sprint registry.
- No Outlook event writes are performed.
- Preserve existing workspace and sprint data.


### v0.3.51 session recovery repair
On startup, after the Azure DevOps load handshake, the extension attempts to restore an MSAL account and validate it with a silent User.Read token request. No interactive prompt is triggered automatically. If the browser has discarded MSAL's cache, Connect remains available. Calendar preferences are unchanged and no events are written.


## v0.4.0 Outlook ceremony booking (initial integration)

- Select and save an Outlook calendar in Configuration.
- Save a meeting record under Planning, then select **Schedule in Outlook**.
- The explicit confirmation shows the calendar and attendee count.
- Dates/times use the scheduling user's browser local timezone and are transmitted to Graph as UTC.
- Participants must be email addresses separated by commas or semicolons.
- The meeting is first marked `outlook.state=pending` in the shared registry. Graph is called only after this save succeeds.
- Successful Graph creation stores the calendar, connected account, event ID and event URL in the meeting.
- If Graph's result or the subsequent registry save is uncertain, the meeting stays pending. **Do not repeat booking** without reconciling the calendar.
- Booked/pending meetings cannot be edited or removed until Outlook update/cancellation support is implemented.
- This build does not synchronize reschedules, deletions, recurring series, Teams links or meetings edited directly in Outlook.
- The selected calendar preference is still browser-local, as in v0.3.52.
- Multi-user conflict handling still depends on the Azure DevOps storage service ETag behavior; this is not a fully tested production transaction system.

Runtime verification: pending.


## v0.4.0 Outlook lifecycle
- Edit a linked ceremony to PATCH the existing Outlook event.
- Cancel a confirmed event with explicit confirmation, retaining ceremony history.
- Review uncertain updates and cancellations using the saved event ID.
- Uncertain initial POST without an event ID still requires manual Outlook reconciliation to prevent duplicate invitations.
- Linked records remain protected from deletion.
- Multi-user concurrency and recovery from external Outlook changes require further production testing.


## v0.4.1 — Outlook lifecycle hardening

- Retains proposed ceremony changes during an uncertain Outlook PATCH so they can be recovered.
- The Review Outlook status action compares event title, start/end time and attendee addresses before accepting a pending update. If the event differs, it remains pending for manual investigation.
- Treats an Outlook DELETE returning HTTP 404 as an already-absent event and records cancellation, without issuing another invitation.
- Existing event creation, rescheduling, attendee updates, and cancellation are preserved.
- No Outlook changes are performed automatically on load.

**Runtime verification pending.** Shared-registry multi-user conflict handling and initial booking without an event ID remain production hardening tasks.


## v0.4.2 — Ceremony removal and shared-write safeguards

- Cancelled Outlook meetings can now be removed from the Planning ceremony list. Active or unresolved Outlook-linked meetings remain protected from orphaning.
- Registry mutations check the current server ETag before applying changes, and retain the service ETag during writes so concurrent edits fail rather than silently overwriting. A conflict requires refreshing before retrying; automatic merge is intentionally not attempted.
- Retains all v0.4.1 Outlook creation, update, cancellation and reconciliation behavior.

Runtime verification is required in Azure DevOps, including multi-user conflict testing.

## v0.5.1 Reporting and synchronization

Reports now includes Azure DevOps-backed sprint health, segmented completion, project and workload breakdowns, management attention, CSV export, observation-based burndown and item-count velocity, plus an interactive auto-generated timeline with revision-checked write-through to original work-item scheduling fields. Refresh explicitly retrieves current work-item revisions. History is not reconstructed from present-day state. Calendar and board functionality remain from v0.4.2.

## v0.5.2 — Integrated reporting and workflow corrections
- Closed work items can occupy the visual Done column for project processes without native Done; native Closed status and accepted reporting remain unchanged. Moving an open item to Done in such a process explicitly warns before closing its original ADO ticket.
- PM Action Queue refreshes after assigned work is loaded and shares the report's assigned-item coverage definition.
- Reporting identifies assigned, executable, planning-context, and unavailable work separately.
- Automatic dated observations are recorded on complete work-item loads (maximum once per calendar day) without inventing historical observations.
- Current graphical charts and date-editing timeline are retained; older historical velocity cannot be inferred without evidence.


## v0.5.3 — Reports startup crash repair

Normalizes legacy and current observation timestamps before Reports burndown/velocity sorting and rendering. Invalid timestamps are excluded from charts rather than causing a runtime exception. No sprint or Outlook data is changed.

## v0.5.4 demo reporting
Demo Mode now includes a populated, isolated reporting workspace with synthetic sprint health, velocity, burndown, project/team charts and interactive ticket dates, effort and state. Existing older local demo fixtures are regenerated to include reporting history. Production ADO and Outlook data are untouched.

## v0.5.5 reporting visualization refinements

- Calendar date axes and Today markers in live and demo timelines.
- Blocker drill-down from demo Sprint Health to ticket editor.
- Burndown axis labels and per-observation SVG tooltips.
- No changes to Outlook, ADO write-through or persistence.

## v0.5.6 reporting acceptance diagnostics

Support now includes a bounded, local-only diagnostic session export, a new-session control and a clear-log control. It captures work-item coverage, failures and existing diagnostic operations, without transmitting records automatically. Review exported JSON before sharing. This is instrumentation for acceptance testing, not proof of runtime success.

## v0.5.7 acceptance instrumentation
- Diagnostics export schema v3 includes current-session acceptance checklist and aggregate warning/error counts.
- Captures ADO state/date write attempts, successes and failures; refresh events; automatic snapshot outcomes; demo ticket, blocker, membership and scenario interactions.
- Checks are marked observed, not tested, failed, or pass where evidence is sufficient. An observed event is not a comprehensive regression pass.
- No access tokens or request/response bodies are logged. The local diagnostic log is bounded to 600 events.

## v0.6.0 initial functional audit

See `docs/audit-0.6.0.md` for source findings, corrections, and outstanding runtime tests.

## v0.6.1 repository trace

Run `python scripts/audit_paths.py` for the offline pathway-presence matrix. Findings, corrections, and unverified runtime paths are documented in `docs/audit-0.6.1.md` and `docs/audit-trace-0.6.1.json`.
