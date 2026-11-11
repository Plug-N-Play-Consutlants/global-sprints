## v1.0.49 — Delivery-first health and continuing ceremony schedules

Sprint Health now measures development delivered (Board Done + Closed) rather than acceptance sign-off; QA validation, open defects and reopened work are separate. Prior-sprint recurring Outlook series can satisfy a later sprint’s ceremony guidance when actual occurrences overlap. The schedule list offers a non-destructive Plan replacement action, and End schedule can preserve past booked meetings while safeguarding future events. The Burndown panel no longer substitutes a single horizontal progress bar for a time series; it renders observed and ideal lines only with at least two distinct recorded dates, and explains missing history otherwise. Same-state daily observations may now be saved on successive active days without fabricating past days. Velocity compares up to eight previous ended sprints in the selected workspace, marks missing history explicitly, and keeps live current-sprint progress separate. Work packages are rendered at the bottom of Reports. Accepted/Closed is explicitly labelled as PM-validated Board Closed; Done remains awaiting validation. See `RELEASE-NOTES-v1.0.49.md` and `ACCEPTANCE-v1.0.49.md`.

# PNPC Global Sprints — v1.0.49 Release Candidate

**Status:** Local/source/build/regression candidate; *not* certified against a live Azure DevOps tenant or Microsoft 365 by this package. Do not publish commercially until the live acceptance checklist is completed.

**For agents and future builds:** Begin with [`PROJECT.md`](PROJECT.md) (background, accepted state, post-launch Retrospective Board and Interactive Reporting requirements) and [`AGENTS.md`](AGENTS.md) (agent entry point). Those documents are documentation-only, not evidence of implemented features.

## What this source is

This is a **reconstructed, deployable source project**, derived from the accepted v1.0.39 VSIX/reconstructed source. It is not the original TypeScript/native project or original Git history. The original repo was not available during reconstruction. Preserve the v1.0.39 accepted VSIX as rollback.

### Canonical source structure

- `src/app-main.js` — existing reconstructed application code with the v1.0.49 integration points. It is bundled, still largely single-line; do not edit generated `app.js` directly.
- `src/gs43-schedules.js` — read-only, unit-tested schedule lifecycle, history grouping, and sprint ceremony coverage.
- `src/gs44-session.js` — stale-tab/background return handler with in-flight write protection and unsaved card draft recovery (no automatic replay of ADO writes).
- `src/gs45-mentions.js` — pure mention composer that separates confirmed identity selections from subsequent ordinary text, prevents stale searches, and serializes selected identities safely.
- `src/gs40-runtime.js` — maintainable ADO hierarchy loading, Board visualization, reporting drilldown, retrospectives and meeting/workspace lifecycle code, inserted into the application module at build time.
- `src/gs40-core.js` — pure, independently tested hierarchy, estimation, cancellation and retrospective rules.
- `build.py` — **only supported build path**. Reads source as explicit UTF-8; validates manifests, tests the generated application, checks VSIX member names and exact bundled JS parity. Refuses old `extension/` tree.
- `app.js` and `gs40-core.js` — **generated** in the root from the above canonical source by `build.py`. They are included to inspect and replay the deployed VSIX, not authoritative development sources.
- `index.html`, `extension.vsomanifest`, `extension.vsixmanifest`, `[Content_Types].xml`, `vendor/`, `images/` — extension assets.
- `*.test.cjs` — 25 local automated test files. `docs/legacy` preserves the unused old licensing display contract; it is NOT packaged or loaded.

**Important for a pre-existing local repository:** Extract this ZIP into a clean folder named exactly `PNPC-Global-Sprints-Repository`. Do not overlay it on a legacy local directory containing `extension/`, obsolete `scripts/package.py`, or `scripts/validate.py`; they are not part of this canonical build and could deploy stale assets. Preserve any existing `.git` history separately before replacing files.

## Build on Windows (PowerShell), macOS or Linux

Requires Python 3.10+ and Node.js 18+; no npm install and no extra environment variables.

```sh
python build.py --out Global-Sprints-v1.0.49.vsix
```

The build runs `node --check` and all twenty-five test files, and rejects errors. Use `python build.py --skip-tests --out path.vsix` only for troubleshooting; a commercially published VSIX must come from a fully tested build. All source reads use `encoding="utf-8"` to avoid the Windows CP1252 failure in earlier scripts.

## Product behaviour and safety

- Sprint Backlog browsing recovers missing parent context from source ADO links. A single **Add with children** action fetches actual hierarchy descendants, adds allowed items atomically to Global Sprint membership, and does **not** change native ADO iterations. Children may be included in multiple Global Sprints; same-sprint duplicates are prevented. Native-iteration differences require explicit consent, never silent native iteration changes. Users can still queue/add individual tickets.
- The Board keeps individual state and assignment controls, with expandable linked-child summaries. Parent state does not automatically change when a task changes.
- Estimates are counted once at their hierarchy owner (Story/PBI/Requirement by default; Feature-only estimates when appropriate). Child task remaining work stays separate. Shared Features cannot be credited to several sprints without allocations. New observations record parent relationships; historical observations are not rewritten.
- The retrospective editor stores draft and immutable finalized versions with action items in the sprint registry.
- **Clear All Sprint Meetings** only affects matching committed meeting records. Cross-sprint recurring series and legacy Outlook bookings require reconciliation instead of broad destructive changes. **Clear All Meetings** on a specific committed schedule intentionally cancels that entire schedule. Outlook DELETE uses the existing organizer-owned event and normal attendee cancellation mechanism, and stops on uncertain failures.
- **Close Out** first cancels/reconciles workspace meetings, preserves history, archives workspace; restoration starts a fresh planning cycle and does not reissue invitations. No native ADO work items or iterations are deleted or modified by archiving.
- Licensing checks retain Product Command as authoritative and the previously accepted outage-tolerant cache, while honouring explicit expiry of paid and trial decisions. No new ADO permission scopes.

## Acceptance required before commercial release

Read `ACCEPTANCE-v1.0.49.md` and `VALIDATION-v1.0.49.md`. Local synthetic tests are **not** a substitute for verifying registry concurrency, ADO organization permissions/custom workflow transitions, actual Outlook meeting cancellation notifications, partial failures, archive restoration and UI rendering in the host.

## v1.0.41 focused acceptance correction
Open a User Story/PBI from Planning search or Browse Backlog to review a visible nested package before adding. Check native-iteration exceptions explicitly. Kanban parent cards show expanded linked children; task cards keep independent states. See RELEASE-NOTES-v1.0.41.md.

## v1.0.42 focused polish and audit hardening

- **Sprint Closeout Notes**: Save/finalization messages are adjacent to the action buttons; selected-sprint/finalization context remains in the heading. Validations and persistence failures are shown in the same local status, and the shared persistence function preserves default feedback for all other callers.
- **Saved Workspace Meeting Schedules**: Collapsible disclosure, collapsed by default, with saved/committed/Outlook-booked counts. Existing schedule editor and calendar actions are unchanged.
- **End schedule…** now uses existing red/danger styling, with the same lifecycle callback and confirmation. No Outlook DELETE behaviour was changed.
- **License response validation** rejects active trials without an expiry and invalid remote dates; valid paid-entitlement outage tolerance remains. This is client-side validation only, not backend commercial security certification.
- Regression tests now derive the active runtime version from `extension.vsomanifest` rather than rejecting every legitimate version increment.

No commercial publication authorized; live Outlook cancellation and Product Command verification are separate acceptance gates.

## v1.0.44 scheduling lifecycle correction

Past, completed Outlook-linked schedules are shown under collapsed **History**, not as actionable `Draft` rows. Pending, unresolved or future-recurring invitations remain visible for review. New Outlook booking of workspace schedule records requires internal `Committed` status; legacy booked Drafts can be committed without duplicate invitations. Planning Guidance recognizes the selected sprint's workspace meetings. These changes use stored meeting metadata; they do not verify actual Outlook delivery or cancel any meetings. See RELEASE-NOTES-v1.0.44.md and ACCEPTANCE-v1.0.44.md.

## v1.0.46 Board @mention composer correction

Live v1.0.44 observation: selecting an @mention succeeded, but continuing the sentence caused the picker to search for the selected person's name plus ordinary text, yielding “No matching Azure DevOps users found.” A name displayed in a textarea is plain text visually; the new blue linked-identity chip confirms it is also retained as a resolved mention. Selected tokens no longer trigger searches as text continues. The actual editor handlers, async-search sequencing, second-mention creation, unresolved-token rejection and ADO mention-anchor generation have focused runtime tests.

No changes to identity-service scopes, work-item state transitions, Board layout, Outlook scheduling/cancellation, licensing or reporting. Test actual posting and ADO notification delivery in the live host before accepting v1.0.46.

## v1.0.46 reliability maintenance

Cross-sprint membership is permitted; a source work item is deduplicated only within the selected Global Sprint. The Board header includes **Refresh Board**, which updates registry/work-item data without a full-page reload and defers while a card editor or save is active. HTTP 412 errors report fresh revision conflicts without replaying PATCH; Product Command HTTP 403 is logged separately from transient service failures. See `PROJECT.md`, `RELEASE-NOTES-v1.0.46.md` and `ACCEPTANCE-v1.0.46.md`.

## v1.0.48 reporting correction

The live Sprint Delivery overview and Sprint Health now classify Done/Awaiting validation and Accepted/Closed using the selected Global Sprint Board stage, while retaining native ADO state for source metadata. New immutable snapshots save that Board stage alongside native completion category; older snapshots remain unchanged. Historical velocity uses latest saved scope per sprint and shows an observation date, not an invented final result. Auto observations include all assigned context items and capture Board-only acceptance changes. Refresh Board is green. See `RELEASE-NOTES-v1.0.48.md` and `ACCEPTANCE-v1.0.48.md`.


## v1.0.49 — Sprint delivery and cross-sprint ceremony continuity

- Sprint Health numerator: Board Done + Closed; denominator: executable Done + Closed + Active/New, with missing-data warnings. PM validation is a separate QA clearance measure; open active Bug/Defect records and reopened historical work are counted where recorded.
- Burndown and Velocity continue to count completed effort in either Done or Closed. Reopened work returns to remaining effort; no historical snapshots rewritten.
- Cross-sprint calendar continuity: recurring workspace schedules booked under an old sprint count as existing planned/committed/booked coverage when actual non-excluded occurrences overlap the selected sprint. A read-only banner makes that coverage visible.
- `Plan replacement…` prepares a new independent project-period plan and leaves all old Outlook events untouched. Ending a committed schedule requires active/future bookings to be cancelled/reconciled, while preserving already-finished Outlook event history. New meeting booking remains an explicit user action.
- Local regression: 25 test files; live ADO/Outlook acceptance remains pending. See `RELEASE-NOTES-v1.0.49.md`.
