# PNPC Global Sprints — Agent Project Brief

**Documentation baseline:** November 3, 2026 (living brief; updated through v1.0.49 implementation and pending acceptance)  
**Current application:** v1.0.49, pre-commercial-release acceptance candidate (automated validation only)  
**Extension identity:** `PlugNPlayConsultants.global-sprints`  
**Source repository folder (must not be renamed):** `PNPC-Global-Sprints-Repository`  
**Local working directory used by product owner:** `F:\Development\Global Sprints\PNPC-Global-Sprints-Repository`  
**Document purpose:** Persistent operating context for developers and AI coding agents: background, current state, product invariants, remaining launch validation and *post-launch* direction. This document is a specification and handoff, **not evidence that a feature is implemented or tested**. **Treat it as a mandatory, evolving project artifact: update it with every accepted change, defect, audit finding, design decision and release.** Keep the same `PROJECT.md` filename and repository location; do not replace it with scattered one-off handoffs.

## 1. Product mission and positioning

Global Sprints is a PNPC Azure DevOps extension for organization-wide, cross-project sprint coordination **without replacing or rewriting Azure DevOps' native project iterations, process templates, work-item relationships or source records**. It is intended for small teams and program managers who coordinate multiple projects, including projects using different Agile processes or custom inherited workflows.

The product values are low-friction planning, a familiar Board, accurate reporting, lightweight ceremonies, and a clear bridge back to native ADO work items. Avoid making users perform two separate operations to accomplish one goal. Avoid imposing one methodology on every project. Prefer existing navigation, styles and components over parallel UI systems.

- Standard navigation: **Board → Planning → Reports → Gantt → Configuration → Support → Demo**. Default landing tab: **Board**.
- Board: organization-wide sprint execution, independent item state/assignee/comments, hierarchy awareness, source ADO synchronization.
- Planning: choose and assemble Global Sprint work from project backlogs, retain hierarchy, plan Outlook-backed ceremonies and committed meeting schedules.
- Reports: Sprint Health, burndown, velocity and Gantt summaries; preserve baselines/history and prevent double-counted effort.
- Gantt: intentionally **lightweight**, milestone-first project timeline. This is *not* a replacement for specialist project scheduling software. Azure DevOps source execution data is read-only; PNPC-only phases/milestones may be added. Distinct project bars, gold milestone diamonds and vertical date guides; shared milestones represented once.
- Outlook is the launch calendar integration; do not add Google Calendar as an assumed requirement.
- Licensing is organization-based via Product Command; not per-seat. Outage tolerance is intentional, but explicit verified expiry and authoritative denial must be respected.

## 2. Current implementation and acceptance status

**v1.0.45 is the last user-confirmed functional baseline (the @mention composer appeared to work in live ADO). v1.0.49 is the current reporting/schedule-continuity acceptance candidate; v1.0.47 and v1.0.48 received Reports feedback, with the v1.0.48 delivery-health interpretation explicitly superseded by v1.0.49. v1.0.46 received acceptance feedback on Reports/Velocity; its Board refresh behavior has not been fully live accepted.** v1.0.42 UI changes, v1.0.43 schedule history and v1.0.41 hierarchy/effort features were positively tested, but bulk Outlook cancellation, workspace restoration, licensing rejection and the new v1.0.46 refresh/membership corrections still require live acceptance. Do not silently call it launch-ready, and do not conflate passing synthetic tests with successful live tenant acceptance.

### User-confirmed live behaviours (as of October 28, 2026)

- Agile workflow transitions, including the affected project's **In Progress → Resolved** path, now work. Process-agnostic mapping is a requirement for Agile, Scrum, Basic, CMMI and inherited/custom state definitions; don't hardcode state names globally.
- Work-item Board Done/Completed placement synchronizes with native ADO state while preserving a separate, intentional Global Sprints lane. Distinguish sprint-specific Board delivery/validation stage from native ADO state, and report both without overwriting source state. As of v1.0.47, Reports Done/Awaiting validation follows the Global Sprints Board Done stage, even when native ADO represents the item with a Completed-category state; Accepted/Closed follows Board Closed. Historical observations retain their as-of stage.
- Card assignee selection and @mentions were previously accepted in the live host; however, the product owner reported **@mentions broken again in v1.0.43**, alongside intermittent Board-card controls becoming unresponsive until a manual refresh. The v1.0.44 mention correction failed live acceptance after selection; v1.0.45 addressed subsequent-text handling and the owner reported it appears to work. Continue regression monitoring.
- The work-package preview shows a User Story/PBI and its children **before** adding. The user confirmed that parent/children can be added and the Board hierarchy is now visible.
- Effort accounting works for the user's tested scenarios; cross-process behaviour works. Both were explicitly reconfirmed by the product owner after v1.0.41.
- Outlook meeting creation and attendee invitations have been observed working in live usage. This does **not** certify bulk cancellation, cross-sprint recurring safety, or archival flows.

### Implemented in v1.0.40–v1.0.41 but not yet fully accepted live

- Searchable work-package breakdown and clickable source work-item links in Reports; **not** the envisioned fully interactive reporting experience.
- A text-based sprint retrospective/closeout notes editor with draft, finalize, action owners/dates and saved historical versions; **not** the envisioned collaborative retrospective Board. The product owner reports that note-taking works; reframe as **Sprint Closeout Notes** when UI cleanup is authorized. Move save-success/error feedback from the top-of-section status into a small inline status directly beside or below the Save Draft/Finalize controls on the same card. Preserve other meaningful statuses and accessibility announcements.
- Clear All Sprint Meetings, Clear All Meetings for a committed schedule, workspace Close Out/archive and Restore. Requires live Microsoft 365 and ADO acceptance, including partial failures and attendee notifications. The product owner has **not** tested Outlook ending/cancellation and does not plan to do so during the current session; never mark it passed or failed without evidence.
- Canonical source-first packaging and local regressions. Windows build reproducibility is addressed in source but should be checked on the actual Windows development machine. Verify installed VSIX/runtime/manifest versions match.

### Existing work-item and reporting rules — must preserve

1. Discover the actual ADO parent/child relation and work-item-type workflow metadata; do not infer hierarchy solely from labels such as `Task` or `User Story`.
2. Selecting a parent shows a *visible reviewable package* of descendant items, state, assignee, native iteration and conflicts. Eligible children can be included in one operation. Standalone ticket selection remains possible.
3. Never silently move or rewrite native iterations, parent links or unrelated ADO work items. Child task state/assignment may change independently of its parent.
4. Parent commitment Story Points/Effort are counted **once** at the configured estimate owner. Child Task Remaining Work is a separate time-based measure. Feature-only estimates and cross-sprint feature sharing need explicit ownership/allocation rules; do not credit a full shared Feature to multiple sprints.
5. Snapshots and sprint baselines are historical records. Do not rewrite them merely to make present-day charts look consistent.
6. Workflow changes must validate permitted native transitions and use actual work-item type state categories. A state named `Resolved` may be intermediate in one process and treated differently elsewhere.
7. Outlook operations must target only known, organizer-managed meeting records. Individual and bulk cancellation must be scope-safe, retryable, and must not report success for unresolved failures. Workspace archival must not delete native ADO data.


### v1.0.44 — Board card @mention regression and stale-tab recovery (implementation; LIVE ACCEPTANCE PENDING)

- **User observation (2026-10-28):** v1.0.43 historical schedule presentation looks better, but work-item comments on Board cards no longer reliably resolve/post @mentions, and some card functions fail after a tab has been left open; manually refreshing the ADO extension restores them. On returning to a stale tab, Global Sprints should reload instead of allowing silent failure.
- **Code-level diagnosis:** The legacy identity normalizer accepted `entityId` from the ADO host people picker as though it were the Azure DevOps storage-key GUID/VSID. An Entra directory entity ID is not necessarily a WIT mention VSID; when the host returns a display name plus a directory ID, the old direct path skipped IMS/Graph resolution. Host-token/session handling was also tied to the token captured at iframe startup: 401 reads could refresh a changed token, but a 401 write or HTTP 203/html response left the app open without explicit recovery. The actual live trigger and tenant response remain unverified pending new diagnostics.
- **v1.0.44 intended fix:** Resolve host `entityId` through the IMS endpoint at `vssps.dev.azure.com` before using its identity as an @mention; preserve identity/Graph fallback and team-member lookups; do not cache empty/transient results; report selection and comment-posting failure distinctly. HTML comment anchors require a validated VSID (`data-vss-mention=version:2.0,<VSID>`); never silently degrade a failed selected mention into an ordinary comment. Do not change the accepted WIT assignee save semantics.
- **Stale-tab behaviour:** On return after at least five minutes away, or first interaction after comparable idle time, automatically reload the extension iframe. Detect authentication-related 401 and 203/non-JSON redirects, and prompt recovery rather than silently failing. Read-only GETs may refresh an SDK token and retry **once**; ADO writes are **never replayed automatically**. Prevent reload while an operation is in flight or a registry save is busy. Preserve unsaved Board-card text, selected assignment, state, and selected mention identities in this tab's session storage, restoring them when the same work item is reopened; do not reload with dirty edits if session storage cannot save the draft. One automatic-reload cooldown prevents repeated loops during actual ADO outages. Retain the selected Global Sprints tab across reloads.
- **Tests:** Host directory ID vs ADO VSID distinction; IMS enrichment and Graph fallback; empty/failed search retry; retained HTML mention markup and visible failure; stale-tab focus/visibility/idle logic; unsaved-card recovery; write-in-flight guard; 401 read token renewal; no write replay on 401; 203 HTML redirect; reload-loop guard; old Board/Workflow/Outlook/Reporting tests.
- **Live acceptance pending:** (1) verify @mention picker returns users and that selected @mentions create actual notifications in native ADO, (2) leave extension unfocused >5 minutes, return and verify iframe refreshes with current tab preserved, (3) edit an unsaved card, leave unfocused, return and reopen the same work item to recover its draft, (4) ensure ordinary saved Board actions work after return, (5) check exported Support Diagnostics for `ado.mentions.*` and `session.*` events if anything fails. These checks have **not** been run against a live tenant by the build process.

### v1.0.45 — Selected @mention becomes a new search (confirmed v1.0.44 live regression)

- **Product-owner observation:** From a Board work-item comment, typing `@` finds a person and selecting that person succeeds; the text subsequently appears as ordinary text and the picker displays **“No matching Azure DevOps users found.”** This occurred after installing v1.0.44. Do not mistake this symptom for proof that the user does not exist in the directory.
- **Verified source defect:** `activeMention()` looked backward from the caret for the last `@` and greedily consumed following ordinary words. Once an identity was selected, the plain-text textarea still contained `@Full Name`; typing ` please ...` caused an entirely new lookup for `Full Name please ...`. Pending asynchronous searches could also show results after selection, and selected mentions had no visible linked-identity indicator.
- **v1.0.45 local correction:** A pure `GS45Mentions` helper treats the selected full `@Name` as a resolved token with a word boundary, so continued typing cannot extend it into a lookup. The picker checks the live candidate before selection, invalidates pending asynchronous searches when selecting or editing, and preserves the caret on pointer selection. Selected identities are visibly shown as linked chips below the textarea (the textarea remains plain text). Multiple mentions are supported, removing a mention removes its identity link, and unresolved mentions block posting before any API write. Verified ADO VSID anchors remain mandatory.
- **Automated validation:** The pure composer and actual extracted Board editor event handlers are executed in tests: select person → type further words without requery → add second person → serialize two ADO mention anchors; stale query response must not override newer suggestions; missing selection is rejected. Existing v1.0.44 identity, authentication, assignment, workflow, hierarchy, reporting and Outlook-related tests remain in the full suite.
- **Live acceptance pending:** Select a known person on a Board comment, continue typing a sentence, verify linked chip remains and no false “No matching” appears, then submit and verify actual mention markup/notification in native ADO. Repeat with two distinct mentions. Keep v1.0.44 as rollback until tenant acceptance. Stale-tab recovery is also pending live acceptance. **No other feature or Outlook lifecycle changes were authorized by this fix.**


### Confirmed v1.0.42 planning checklist defect — 2026-10-28

- **User observation:** The Planning guidance continues to display `○ To do: Plan sprint ceremonies — Use the Guided Ceremony Planner to preview standups, review and refinement. Go to step` despite all relevant ceremonies already being planned.
- **Verified code-level cause:** In `src/app-main.js`, `renderPlanningSteps()` checks only `(s.ceremonies || []).length > 0`. The Guided Ceremony Planner saves new schedule records under `registry.workspaces[].meetingSchedules[]`, with schedule-level `sprintId` and per-meeting `sprintId`, `date`, `status`, `outlook` and lifecycle fields. Therefore legitimate saved/committed or booked meetings in the workspace schedule store are ignored by the checklist. The Go to step action scrolls to `ceremonyAssistant`, not to the saved schedule. This is a **false-negative guidance status**, not proof of missing meetings.
- **Implemented locally in v1.0.43 (live acceptance pending):** Replace the legacy-only completion predicate with a read-only, sprint-scoped status resolver that combines legacy `s.ceremonies` and eligible workspace schedule records. Respect current `workspaceId`/sprint association, per-meeting `sprintId`, defined-period overlap where appropriate, and recurrence coverage; exclude cancelled/retired records. Do not infer sprint coverage merely from the existence of any workspace schedule. Distinguish `Planned` (saved meeting records), `Committed` (internally committed schedule), and `Booked in Outlook` (actual booked event/series). The *planning* checklist should be completed based on real planned ceremonies, not require sending Outlook invitations. Avoid calling the step complete if only an unrelated sprint's ceremonies exist. Link the action to the relevant saved schedule where possible. Do not modify Outlook events, sprint assignments or saved records as part of the guidance fix.
- **Regression scenarios:** (1) legacy sprint ceremonies only; (2) saved workspace schedule linked to selected sprint; (3) committed and Outlook-booked records; (4) unrelated sprint schedule; (5) cancelled/retired-only schedule; (6) multi-sprint schedule with recurrence; (7) selection and refresh persistence. Verify the UI's advisory state without creating or cancelling Outlook meetings.


### v1.0.43 — Schedule lifecycle and ceremony guidance (implementation; NOT live accepted)

- **Fix false ceremony guidance:** `renderPlanningSteps()` now discovers relevant workspace meeting-schedule records and legacy sprint-native ceremonies, scoped to the chosen sprint. The checklist shows `Planned`, `Committed` or `Booked in Outlook` according to records, and links directly to an existing schedule. It does not require Outlook booking to recognize planned ceremonies.
- **Completed history:** The read-only `GS43Schedules.view()` resolver classifies a schedule as `Completed` when every meeting/recurring series has actually passed its final dated occurrence with valid linked booking/completion/cancellation evidence and no pending Outlook operation. This includes the reported previous sprint's booked `Draft`. It stays in `History`, collapsed by default, with records and meeting IDs retained. The user can inspect the record there, but cannot book/cancel past events through that history view. No stored schedule record is deleted or mutated during classification.
- **Active work:** Saved Schedules summary counts active/committed/historical records separately, without counting old bookings as active. Meeting editor omits completed/retired archived schedules. Current-sprint scheduling and workspace closeout/cancellation candidate selection skip safely finished past meetings. A past schedule cannot block future planning merely because its historical Outlook links remain booked.
- **Exceptions remain actionable:** Pending/sync-pending/cancel-pending operations, uncertain event identity, unbooked stale drafts, and recurring series with future occurrences do **not** become Completed. Legacy Drafts with active bookings show an explicit `Draft · Outlook-booked` status and can be **committed without rebooking**; new Outlook bookings from uncommitted saved schedules are blocked. Cancellation and closeout continue to respect unresolved operations and ownership.
- **Scope/safety:** No Graph GET/POST/PATCH/DELETE is executed for history classification; it is a view based on stored records, **not proof of a fresh Microsoft Graph reconciliation**. Do not treat past date alone as proof of a meeting having happened. Don't rewrite history or send retrospective cancellations merely to tidy a list.
- **Tests:** `gs43-schedules.test.cjs` covers dated history, uncertainty, recurring end dates, and sprint matching; `gs43-integration.test.cjs` exercises the actual saved-schedules renderer and guidance. Existing workflow/identity/assignment/licensing/reporting tests must still pass.
- **Live acceptance still required:** Install v1.0.43 and verify the October 13–26 schedule moves to collapsed History and reads Completed; the current committed schedule remains active and unaffected; Plan Sprint Ceremonies no longer wrongly shows To do; future and pending Outlook links remain actionable. **Do not perform bulk Outlook cancellations just to test the UI fix.** Actual Outlook cancellation and archive/restore integration remain unverified.

## 3. Architecture and repository operating instructions

The v1.0.43 source is a **reconstructed deployable codebase**, not the original TypeScript/native repository or original Git history. Do not describe generated bundled files as the definitive editable source.

Canonical development files:

- `src/app-main.js` — reconstructed existing application with integration anchors (still largely bundled).
- `src/gs40-runtime.js`, `src/gs41-runtime.js` — readable incremental runtime integration; `src/gs43-schedules.js` adds read-only schedule lifecycle and sprint-coverage resolution.
- `src/gs40-core.js` — pure hierarchy, accounting and lifecycle logic.
- `build.py` — sole supported VSIX build pipeline. Generates `app.js` and `gs40-core.js` in root, runs tests, validates version and compares packaged runtime to tested code.
- `*.test.cjs` — regression tests; `README.md`, `VALIDATION-v1.0.41.md` and release notes explain validation scope.
- `docs/legacy/` is historical; it is not the deployed licensing implementation.

Build requirements: Python 3.10+, Node 18+, explicit UTF-8. Canonical build command:

```shell
python build.py --out Global-Sprints-v1.0.43.vsix
```

**Agent workflow for every future development request:**

1. Read this `PROJECT.md`, `README.md`, the latest release notes, and any explicit user acceptance/defect notes. Confirm the actual current deployed version and source package; do not assume a historical sandbox link is available.
2. Reproduce the issue or trace the full user path (UI → selection/action → state persistence → ADO/Graph → reload → reports). Find the authoritative source file. Do not patch generated `app.js` and leave source out of sync.
3. Separate **user-accepted behaviour**, **implemented-but-untested behaviour**, and **future design**. Never elevate a future concept to shipped functionality by changing only copy or documentation.
4. Write/extend tests for the changed path and relevant regression areas: process mapping, hierarchy, assignments, mentions, effort/snapshots, Outlook and licensing. Include error/rollback and multi-project cases.
5. Preserve the accepted Board, Planning, Reporting, Gantt, Outlook booking, license and permissions behaviours unless the request explicitly changes them. No hidden new ADO scopes, native iteration rewrites, surprise per-seat model, or data deletion.
6. Prefer **one consolidated source-first build** over serial microbuilds. Verify VSIX contents, version everywhere (UI, diagnostics, manifests, release metadata), exact folder name, and source ZIP integrity. Maintain a rollback reference.
7. State separately what passed static/unit/synthetic tests and what passed actual ADO/Outlook acceptance. Do not claim live tests that were not performed.
8. For architectural changes, evaluate saved workspace/sprint migrations, authorization boundaries, concurrency conflicts, privacy, recovery and historical-data compatibility before implementation.
9. **Always maintain this living `PROJECT.md`:** on each accepted test, discovered defect, resolved audit finding, planned feature, or completed build, update current state and open risks; distinguish *observed live*, *automated only*, *planned*, and *deferred*. Every source release must carry the updated `PROJECT.md`, with `AGENTS.md` pointing agents to it. Do not overwrite earlier acceptance evidence or declare items complete based solely on a change log. Keep a short dated decision log here and a separate version-specific release note only for changed code.

## 4. Pre-launch audit closure and current UX follow-ups

### VS Code audit closure tracker (original audit of v1.0.39; reviewed against v1.0.41)

| Finding | Status in current source | Remaining release gate |
|---|---|---|
| Default Windows Python encoding failed | **Code corrected / Linux build verified:** `build.py` uses explicit UTF-8; recent source package rebuild passed all ten automated test files. | Re-run from a clean checkout on the actual Windows development machine using normal Python/Node commands (without `PYTHONUTF8`). |
| Two competing root and `extension/` trees; old scripts targeting v0.9.16 | **Corrected in distributed v1.0.41 source:** one canonical `src/` path and `build.py`; stale `extension/` is absent and rejected if present. | Confirm the local Windows working repository was replaced/cleaned correctly, that its Git history was retained, and VSIX packaging uses the canonical root. |
| Unbounded offline cached licensing | **Partially corrected:** explicitly verified paid/trial `expiresAt` is now checked; outage tolerance for previously verified unexpired licenses is preserved. | Determine the commercial revocation/expiry policy when no expiry is supplied; test fresh denial, revocation, suspended, expired and outage recovery against Product Command. **The current UI client gate is not tamper-resistant; commercial enforcement and entitlement authority require an explicit launch decision.** |
| Live integration not exercised by static audit | **Partly user-accepted:** Agile/other process transitions, work-package hierarchy, effort accounting, assignee/@mentions and Outlook invitation creation. | Live bulk Outlook cancellation, attendee notifications, partial-failure handling, workspace closeout/restore, and final installed-extension regression remain open. |
| Unused licensing contract in active runtime | **Corrected:** excluded from packaged runtime; historical copy retained in `docs/legacy/`. | Confirm on the installed VSIX; no new license endpoint/scope changes expected. |
| 388 KB one-line reconstructed application | **Still technical debt:** canonical reconstructed `src/app-main.js` remains largely bundled; new changes live in readable modules. | Gradual modularization and source-map/maintainability improvements after functionality stabilizes; do not rewrite broadly without a regression and migration plan. |

**Audit interpretation:** A passed synthetic test is not certification of a live Azure DevOps tenant, Outlook Graph calendar operation, or commercial licensing security. Conversely, an `NOT_TESTED` result does not imply a failure. Do not regress accepted functionality solely to satisfy static quality suggestions.

### Approved UX cleanup (NOT YET IMPLEMENTED; no new build authorized by these notes)

- **Sprint Closeout Notes:** Preserve the current text-based form and history. The save-success/error message currently appears near the `Sprint Retrospective` heading (`gs40RetroStatus`); move *save feedback* directly beside/below **Save draft** and **Finalize** in that same card so it is visible in the user's action context. Keep select-sprint/finalization status accessible. Rename/reposition the feature as Closeout Notes in a future approved UI pass; do not confuse it with the future collaborative Retrospective Board.
- **Saved Workspace Meeting Schedules:** Make the whole section collapsible (expand/collapse control, clear count/summary, and visible status); allow schedule-level details to expand as they do now. Preserve booked schedule state and controls when collapsed; no accidental discard or calendar mutation.
- **Outlook schedule ending:** Style **End schedule…** as a red/destructive action rather than a grey `secondary` button; keep its confirmation and behaviour intact. **Clear All Meetings** on committed schedules is already `danger`/red in current source. Confirm the intended action remains clearly differentiated from bulk cancellation and draft Start Over.
- **Outlook end/cancel acceptance:** User explicitly deferred destructive live testing this evening. Do not label the operation verified; it should be tested later using disposable meetings and real attendee-cancellation checks.

### Release-gate priorities

1. Verify a clean Windows build of the canonical repository and compare installed extension files/versions against packaged source.
2. Validate licensing states and commercial enforcement boundaries before publication; preserve outage tolerance while rejecting authoritative expiry/revocation.
3. Complete live Outlook bulk-cancel and workspace closeout/restore safety tests, including cross-sprint recurrence and partial failures.
4. Run refreshed in-app diagnostics/health audit plus end-to-end regression on the installed candidate.
5. Treat the three UI refinements above as a small consolidated polish pass after higher-risk functional verification; do not issue a microbuild for each note.

## 4. Pre-launch completion boundary

The user has **not** authorized commercial publication. Remaining acceptance includes live committed-meeting bulk cancellation (including attendee notices), cross-sprint recurrence safeguards, archive/restore, retrospective closeout notes persistence, basic report drilldown, and final diagnostics/build verification. Report findings rather than treating an untested path as failed or passed. The product owner will decide when to publish.

**Do not delay launch solely to add the two aspirational post-launch product improvements below.** The text-based closeout notes and basic work-package report are pre-launch features and should remain functional. Collaborative retrospectives and richer interactive reports are explicitly **post-launch roadmap items**, not part of a v1.0.41 bug fix.

## 5. Post-launch future state — Collaborative Retrospective Board

**Status: DESIGN DIRECTION ONLY — NOT BUILT.** This is *different from* the existing text-based sprint closeout notes editor. Preserve those notes, but label/position them as **Sprint Closeout Notes** (when UI work is later requested) and integrate their historical records with future collaborative retrospectives without silently migrating or deleting data.

### User intent

Build a simple, familiar, facilitated retrospective Board that resembles the existing Global Sprints Kanban Board. The primary experience should be lightweight and immediately understandable, using restrained sticky-note/Post-it-style cards where practical. A standard-card fallback is acceptable. Do **not** create a heavy workshop application or a proliferation of lanes.

**Default board columns (keep minimal):**

1. **Went Well** — successes and positives.
2. **Could Improve** — challenges and opportunities.
3. **Action Items** — actions explicitly agreed by the team after discussion.

The host may add, rename or reorder columns, or use an optional custom column such as **Shoutouts**. Start with those three defaults; do not make teams configure a template just to run a retrospective. Custom columns are **feedback categories**, not workflow phases.

**Separate session stages/controls, not extra lanes:**

1. **Collect (private)** — facilitator/sprint creator/owner starts or delegates a session, may set an optional timer; contributors privately submit notes into feedback columns. Notes from other participants are not visible during private collection. Timer is extendable/pausable as appropriate.
2. **Reveal (public)** — facilitator reveals the notes in the *same columns*. Preserve content and grouping; no mechanical move from a Draft lane to a Public lane is necessary.
3. **Vote** — participants allocate votes to surfaced notes or grouped themes. Votes **rank discussion priorities only**. **Never automatically promote the highest-voted notes to Action Items.**
4. **Discuss and decide** — facilitator leads prioritized discussion; the team intentionally creates or moves agreed actionable improvements to Action Items, with owner and target date. Many discussed notes may generate no action.
5. **Close / historical record** — capture the session, categories, notes, voting outcomes, and accepted action items for subsequent sprint review/closeout. Prior improvement actions should be easy to review in the next retrospective.

This distinction is a firm product rule: **columns categorize feedback; stages govern visibility and interaction.** Draft/private vs revealed/public are note visibility/session states, not additional Board swimlanes. Maintain minimal lane count and permit optional additions.

### Safety, permissions and collaboration criteria

- Private collection/anonymous contribution is a **privacy feature**. Do not implement merely by hiding names in the browser; storage, authorization and host capabilities need a designed threat model. Do not promise anonymity from organization administrators or platform operators without technical proof.
- Facilitator controls reveal, stage progression and timer. Participants can add/edit their own notes during permitted stages; stage changes and saved notes must remain consistent across multiple concurrent contributors/devices.
- Prevent accidental duplicate voting and define a clear voting budget, but preserve participant privacy. Support grouping/merging similar feedback without losing original contributions or tally integrity.
- An Action Item is a **deliberate human decision**, not an automated consequence of vote count. Support link-out or conversion to ADO work items if explicitly designed later; never silently create native ADO tickets.
- Use the existing white/pale-blue/dark-blue Global Sprints design language with restrained note colours and accessible controls; do not let aesthetics compromise readability or keyboard access.
- Future implementation should include live multi-user host/participant tests, visibility/permission tests, timer/reveal race conditions, voting integrity, persistence, archival and audit recovery.

### Minimum acceptance scenarios (when built)

- Two contributors post notes during private collection: neither sees the other's content; host can reveal all at the correct stage.
- Notes stay under **Went Well**, **Could Improve**, or a custom column while stages advance; no artificial Draft/Public swimlanes appear.
- Voting sorts or highlights discussion priority; the top-voted note remains a discussion topic until a human explicitly creates an action.
- Host assigns an agreed action owner/date; session closes and the action persists to next sprint/history.
- Timer expires or is extended without losing notes; simultaneous contributor writes do not overwrite each other.

## 6. Post-launch future state — Interactive Reporting

**Status: DESIGN DIRECTION / EXPANSION ONLY — NOT FULLY BUILT.** Current v1.0.41 reporting includes Sprint Health, velocity/burndown/history, Gantt summaries and a searchable/clickable work-package breakdown. That is a useful base, **not a completed interactive analytics experience**.

### User intent and product principles

Make existing reports **explorable and actionable**, not merely more decorative. A program manager should be able to start from a trend or metric, identify which project/story/task contributed to it, examine the reason, and open the underlying work item **without leaving a confusing or stale selection context**. Keep the initial interface lightweight and consistent with the Board/Planning patterns; avoid a separate business-intelligence platform.

### Preferred progressive scope (validate design with product owner before building)

1. **Metric-to-source drilldowns:** Click a Sprint Health segment, velocity point/bar, burndown point or work-package metric to inspect the underlying sprint/project/parent-child work items and their relevant snapshot states. Direct links to native ADO work items should remain available.
2. **Cross-project and sprint filters:** Filter by Global Sprint, project, work-item type, state/category and assignee when data support it. Make active filters obvious and easy to reset; keep report totals consistent with the visible selection.
3. **Trend comparison:** Use the existing velocity history (historical guidance: eight-sprint window) and burndown observations for actual sprint-over-sprint comparisons, with clear baseline vs current distinctions. Never fabricate or backfill missing daily observations.
4. **Hierarchical attribution:** Show a commitment unit and nested execution tasks with independent states; distinguish Story Points/Effort from task Remaining Work and other units. Do not count both the parent estimate and child tasks as separate points, and never count a shared multi-sprint Feature in full more than once.
5. **Explainability and data quality:** Make exclusions, unassigned estimates, inaccessible ADO items, missing observations, in-progress/resolved/terminal distinctions and incomplete history visible. Data quality needs clear labels, not silent zeroes or invented totals.
6. **Optional later conveniences:** Saved views, comparisons, and export only when there is a clear operational use case and the product owner prioritizes them. Do not introduce these as prerequisites to the core drilldown experience.

### Reporting invariants and cautions

- Authoritative data comes from source ADO items plus Global Sprints' own stored membership, baselines and snapshots. Respect source workflow categories per project/work-item type.
- Distinguish live current-state queries from **as-of historical snapshot** views; opening a historical point must not silently replace it with the present-day state without a clear label.
- Maintain consistency with Board and Planning totals, including filter and hierarchy semantics. Historical snapshots should be append-only/immutable as designed; do not retroactively recompute what was believed committed then.
- Chart interactions must be usable without pointer-only controls, remain performant with many work items/projects and degrade predictably if ADO access is revoked or partial.
- Future tests should cover each metric→work-item drilldown, unit conversions/labels, filter intersections, multi-project hierarchies, custom process mapping, snapshot gaps, and reconciliation after source edits.

### Minimum acceptance scenarios (when built)

- Clicking a velocity metric reveals the exact contributing commitment work items and total points/effort; child tasks are not double-counted.
- Clicking a historical burndown observation shows the **historical** membership/state/remaining work where recorded, with any unavailable fields disclosed.
- Filtering to one project and one sprint updates charts and drilldown totals consistently; clearing filters restores original metrics.
- A custom Agile workflow with `Resolved` and a Scrum workflow with `Done`/`Closed` are both categorized according to their actual workflow metadata, not by hardcoded labels.
- A shared Feature spanning two sprints cannot be silently credited twice; missing history is visible rather than interpolated as fact.

## 7. Future-feature governance

These two post-launch initiatives are **intentional future state**, not requests to implement immediately. Before any build, review this document with the latest acceptance feedback; confirm exact scope, data model, privacy/permissions and UX with the product owner. Consolidate implementation and regression rather than shipping cosmetic fragments. Keep current closeout notes and existing basic report breakdown; evolve them without introducing duplicate stores or inconsistent measures.

Other agreed post-launch possibilities can be tracked separately, but this document does not grant permission to change unrelated features or publish the extension. Update this brief after each accepted release with the new baseline, evidence of live acceptance, remaining risks and explicit next-stage decisions.

## 8. Living document decisions and maintenance log

- **2026-10-28 — v1.0.41 accepted for work-package hierarchy; effort and cross-process behaviour also confirmed.** Preserve the exact validated paths in future regression tests.
- **2026-10-28 — Sprint Closeout Notes UX:** Existing note-taking works; localize save feedback at the Save/Finalize controls rather than showing it at the top of the panel.
- **2026-10-28 — Saved Workspace Meeting Schedules UX:** Make schedule list collapsible; style **End schedule…** red. Actual Outlook cancel/end not yet live-tested.
- **2026-10-28 — Audit reconciliation:** Canonical build/UTF-8 and active licensing-contract cleanup are addressed in source, verified by a Linux-hosted rebuild. Windows clean-build, Product Command commercial enforcement/recovery, live bulk Outlook cancellation/archive/restore and bundled-source maintainability remain distinct open gates.
- **2026-10-28 — v1.0.42 partially accepted:** Sprint Closeout Notes inline feedback, collapsible Saved Workspace Meeting Schedules, versioning and `PROJECT.md` accepted; licensing initial tests passed but rejection deferred. End schedule button was not located by product owner; its display is restricted to `Committed` schedules. Outlook cancellation not live-tested.
- **2026-10-28 — New confirmed planning-guidance defect:** The `Plan sprint ceremonies` completion step ignores workspace-level meeting schedules and only checks the legacy sprint ceremony array. Fix in the next consolidated build; see dedicated defect section above.
- **Standing requirement:** `PROJECT.md` is updated continuously alongside code and user acceptance notes. Future agents must never treat outdated text as evidence of a current deployment; verify source and live installed state before recording a pass.

### 2026-10-28 — Schedule lifecycle inconsistency: Draft with Outlook bookings (confirmed from v1.0.42 source)

**Observed live UX:** Saved Workspace Meeting Schedules showed `2 saved · 1 committed · 14 Outlook bookings`; an October 13–26 schedule showed `10 meeting records · 10 Outlook bookings · Draft`, with `Commit schedule` and `Discard draft`. Attempting Discard returned: `This schedule contains Outlook bookings or unresolved requests. Cancel or reconcile the linked Outlook meetings before retiring or discarding this schedule.` User cannot see `End schedule…` for this Draft.

**Source finding:** `renderWorkspaceSchedules()` uses `(sc.lifecycle || 'Draft')` for label and actions; `Book all in Outlook` is available regardless of lifecycle and `scheduleCeremonyInOutlook` does not require a committed schedule. `changeScheduleLifecycle('discard'/'retire')` correctly blocks removal while any meeting has an Outlook state other than `cancelled`. `End schedule…` and `Clear All Meetings` are exposed only for Committed schedules. Consequently a *Draft* schedule can contain real Outlook bookings and be neither discardable nor endable in its displayed state. Counts are stored booking links, not a fresh Graph reconciliation. This is an internal schedule lifecycle/UX defect, not proof the invites were never sent or a request to delete Outlook events.

**Product-owner clarification — historical schedule disposition (2026-10-28):** If the October 13–26 record represents legitimate ceremonies from the preceding sprint that have already occurred, it should read **Completed** and disappear from the default **active/actionable** Saved Workspace Meeting Schedules list. Keep it in historical schedule records (accessible via an Archive/History view) with its meeting IDs and booking outcomes. It must not demand a Draft discard, retrospective Outlook cancellation, or manual lifecycle action, and **must not block the current sprint's planning, committing or bookings**. A date range in the past is not itself sufficient proof: assess each occurrence/series end date and outstanding booking/cancellation requests; do not hide a genuinely unresolved operation or future recurrence. Any exception should be scoped to the affected historic schedule and surfaced as a separate warning/reconciliation entry, not a global blocker. Read-only normalization of a verified historical record should not produce calendar mutations or attendee notices.

**v1.0.43 implementation and remaining acceptance requirements:**
- Automatically recognize completed historical schedules, including legacy Draft-labeled schedules whose ceremonies genuinely occurred; show **Completed** rather than Draft, move them to an accessible historical/archive view and omit them from actionable counts by default. Completed is a derived lifecycle/presentation outcome unless an explicit safe persisted migration is validated. Preserve the full meeting/audit trail.
- Keep present-sprint actions independent of unrelated completed/legacy schedules. Validation and blockers must be scoped to the operation's target sprint and future meeting identities, not blanket-check every workspace schedule for historical bookings.
- Never cancel or re-send notices for meetings that have already occurred merely to close or archive the schedule. For partially past or recurring series extending into the future, separate historic occurrences from future live commitments and only act on the latter with explicit confirmation.
- Make lifecycle and action availability coherent. Prevent new Outlook bookings from an uncommitted Draft (or atomically commit before booking with clear confirmation); do not silently mutate existing records.
- Handle legacy Draft-with-bookings safely. Show `Draft · Outlook-booked / needs reconciliation` clearly and offer an explicit recovery path to verify associated events, reconcile status, commit/retain, or cancel booked events first, then discard/retire as appropriate. Preserve audit trail and meeting IDs. Avoid unsafe retrospective meeting cancellations and attendee notices for meetings already held.
- Distinguish internal draft, committed schedule, Outlook booking state, past/completed meeting state, cancellation and retirement. Make the actionable controls and labels match those distinctions. `End schedule…` should not be invisible solely because a legacy Draft has Outlook bookings.
- Do not equate a recorded `outlook.state==='booked'` with a live Graph-verified meeting, or blindly delete such records. Where safe to archive already-completed historical meetings, preserve their history without re-sending cancellation emails.
- Check for overlapping/duplicate meeting schedules before any new bookings; the observed counts alone do **not** establish duplicates.
- Regression: Draft unbooked → discard; Draft unbooked → commit → book; Draft booked legacy → recover/reconcile → safely archive; committed booked → cancel and notify → retire; past completed events → show Completed in History and remove from active list without cancellations; historic booked schedule → does not block new sprint planning/commit/bookings; mixed past/future recurring series → retain future obligations; uncertain/pending Graph result → scope warning to affected schedule and reconcile before destructive action; different sprint schedules must be unaffected.

**Current acceptance:** v1.0.43 is the next candidate. The code changes are locally tested; no Outlook cancellation was live-tested or authorized by this observation. Do not recommend casually discarding the old schedule or cancelling its bookings to clear the UI. Coordinate this correction with the previously recorded false `Plan sprint ceremonies` checklist status in the next consolidated build.


- **2026-10-28 — v1.0.43 maintenance candidate:** Read-only completed schedule history and sprint-scoped ceremony guidance implemented and locally tested. Source/VSIX packaging aligned; no actual Outlook cancellation run; live tenant acceptance pending.

- **2026-10-28 — v1.0.44 maintenance candidate:** Focused mention identity and stale ADO iframe recovery implementation; 16 local automated test files and source-first VSIX packaging. Awaiting live Board comment/mention and tab-return acceptance. Outlook cancellation and workspace closeout remain unverified; no commercial release authorized.

- **2026-10-29 — v1.0.45 candidate:** Corrected post-selection @mention lookup behavior using resolved-token recognition and explicit linked chips, with actual UI-handler and serialization regressions. Product-owner live acceptance remains pending; retrospective Board and fully interactive reporting remain post-launch design requirements, not implemented features.


## v1.0.46 — Cross-sprint membership, Board refresh and operational diagnostics (October 29, 2026)

**Problem reports:** Work item **#910** was rejected in Sprint 2 as belonging to a Test sprint, despite the intended rule allowing one ADO source ticket in multiple Global Sprints. Board data occasionally required disruptive reloads, and users requested a Refresh Board control. The v1.0.45 support export additionally recorded HTTP 412 work-item PATCH failures and Product Command 403 responses, but lacked sufficient sanitized operation context. The automated audit loaded 35/35 items, found no duplicate IDs *within the selected sprint*, and cannot inspect competing cross-sprint membership. It does not prove the source ticket's live registry membership.

**Implemented (local testing only):**

1. **Cross-sprint membership:** `src/gs41-runtime.js` no longer blocks a package item for occurring in another active Global Sprint or workspace; the other sprint is shown as informational. Membership deduplication is still **per selected sprint**. The existing native ADO iteration is never changed. Adding/removing from one Global Sprint does not mutate another Global Sprint's membership. Do not credit one completed ADO item as separate independently delivered work in multiple velocity summaries without explicit attribution rules; this is a reporting-design consideration, not a reason to block membership.
2. **Refresh Board:** `src/gs46-board.js` adds a visible **Refresh Board** button and last-update status above the swimlanes. It reconciles shared registry membership with fresh ADO reads without reloading the extension iframe or interrupting an open card/editor. Sync is deferred while editing, saving, switching or running Outlook operations. The existing lightweight polling remains in place and is similarly edit-aware. Returning to a tab inactive for five minutes now attempts a soft refresh; only genuine authentication expiry or unrecoverable session errors use guarded frame reload and draft preservation. Do not add real-time subscriptions or websockets without an explicit product decision.
3. **HTTP 412 handling:** Native state `validateOnly` PATCH failures trigger a **read-only** fetch of the work item's latest revision. If the revision changed, report a specific retry-after-refresh conflict; do not automatically replay a PATCH. If the revision has not changed, the failure may be due to workflow rules and the candidate state may still be rejected normally. HTTP 401/403 bypass fallback-state trials and must be handled as auth/permission issues.
4. **Read-only POST classification:** Work-items batch and WIQL POSTs are reads, not mutations. They can renew an expired SDK token once, but **genuine ADO writes are never replayed**. Diagnostics no longer misleadingly label read-only POSTs as writes.
5. **Licensing 403:** Treat an HTTP 403 as an authorization/transport rejection event, distinct from a timeout/503 or an authoritative signed entitlement decision. The verified cache and outage tolerance remain intact pending Product Command contract verification. Do not silently reinterpret a transport rejection as revoked, nor bypass an actual verified suspension/revocation.
6. **Sanitized diagnostics:** Log numeric work-item IDs/revisions, status, membership counts, operation types and fixed error codes while excluding arbitrary user text, names, email, tokens and registry contents. UI errors distinguish conflict/auth/permission where possible.

**Verification required:** Try #910 in Sprint 2 while retaining another sprint membership, confirm same-sprint deduplication and removal isolation, allow a second PM to modify membership and use **Refresh Board**, leave a tab inactive >5 minutes then return with and without an open edit, validate stale-revision conflict feedback, and test 403 licensing with Product Command. No live ADO, Product Command or Outlook mutations were performed during this build. 

**Remaining pre-launch:** Live Outlook bulk cancellation/attendee notifications, workspace archive/restore, authoritative Product Command rejection testing, clean Windows checkout/build, and final audit. Future **post-launch** retrospective Board and rich interactive reporting designs remain unchanged and must not be confused with today's Sprint Closeout Notes and searchable report breakdown.


## 2026-11-03 — v1.0.47 reporting and Board refresh correction (local build; live acceptance pending)

**Reported v1.0.46 defects:** (1) the Refresh Board action should be green, (2) `Done / Awaiting validation` in Reports displayed zero despite multiple cards visible in the Board's Done stage, and (3) Velocity appeared broken again. No actual tenant report screenshot or latest snapshots were supplied with these observations; the fixes below address confirmed source-level inconsistencies and need live verification.

**Root cause A — Board/report classification mismatch:** The Board persists a sprint-specific `doneDisplayIds` override to represent validation-pending Done when an ADO process only provides a native terminal `Completed` state. Reports v1.0.46 used `workflowNativeTerminal` and ignored the Board override; the identical work item could appear in the Board's Done lane and be counted by Reports as Accepted/Closed. v1.0.47 uses the same `boardColumn` stage for live Done/Accepted/Active counts, team workload, project delivery and Sprint Health. Native ADO state remains authoritative for source records and is never silently changed to adjust report totals. The explicit override is sprint-specific; a shared ADO work item may have a different validation disposition in each Global Sprint. Unsupported/context-only items still follow existing executable-work filtering rules.

**Root cause B — historical Velocity scope:** Velocity v1.0.46 calculated each sprint's completed points against its very first observation. Any work subsequently added to the sprint was excluded from its completed-velocity figure despite appearing in later captures. v1.0.47 computes the delivered estimate against the **latest stored observation's recorded scope** per sprint, without rewriting the original baseline, inventing missing days, assuming a final result, or double-counting parent/child estimates. Apply the eight-sprint window **after filtering for usable observations** so recent unobserved sprints do not suppress older useful records. The data table includes each observation's as-of date, and the chart discloses that its bars are latest observations, not final certification. Original snapshots still support baseline and burndown comparison.

**Root cause C — snapshot omissions and ordering:** Automatic captures were suppressed whenever a caller passed `reportWork()` (which excludes some Feature/Epic context) and its length was less than assigned `itemIds` count. Auto-capture now resolves *all current assigned IDs*, requires complete availability and records each new snapshot's `deliveryCategory` (Board stage) alongside existing `completionCategory` (native mapped stage). Snapshot fingerprint includes both, making Board-only Done/Closed decisions observable even if native state does not change. In-flight observations coalesce one later capture so two-phase Board/native updates cannot strand the history at an intermediate state. Legacy historical snapshots lacking `deliveryCategory` still use their saved `completionCategory`; no retroactive backfill. Never store an incomplete observation.

**UI:** Refresh Board uses existing brand green (`#237b42`), hover/focus accessibility, and retains its non-disruptive on-demand behavior. A manual refresh also detects sprint-scoped registry-only Done/Closed/lane/blocked-item changes, and re-renders Board and Reports even when native ADO work-item revisions are unchanged. No new permissions, ADO mutation, Outlook operations, license changes or post-launch feature scope added.

**Regression/acceptance:** `gs47-reporting.test.cjs` runs real Board/report classification and actual delivery dashboard rendering, a mixed-process synthetic case, observation serialization, immutable history, latest-scope Velocity and eight-observed-sprint filtering, plus green control styling. `gs47-observation.test.cjs` tests Feature-context completeness, concurrent save sequencing and registry-only Board/Reports refresh. Existing 20 test files continue to run. In live ADO verify: (1) a native `Completed` card held in Board Done appears in Done/Awaiting validation, (2) moving it to Board Closed increments Accepted and decrements Awaiting without unrelated ADO changes, (3) project and team subdivisions reconcile with the overview, (4) Velocity reflects latest recorded completed scope including newly added work, (5) old baseline and historic figures are unchanged, (6) a Feature/Story/Task hierarchy does not double-count Story Points/Effort, and (7) manual Refresh Board is green and preserves an open editor. If live Velocity still differs, export current Support diagnostics and show the expected/actual totals with snapshot dates; do not alter history to conceal the mismatch.

**Release status:** v1.0.45 remains last user-confirmed baseline. v1.0.47 is locally tested candidate and NOT published/tenant-accepted. Existing Outlook cancellation/attendee notification, workspace restoration, Product Command authoritative denial and clean Windows build gates stay open.


## 2026-11-03 — v1.0.48 Burndown, Velocity, Reports order and acceptance meaning

**Product-owner live v1.0.47 feedback:** Burndown appeared as a single horizontal bar rather than a dated burndown. Velocity displayed only the current sprint, which is not meaningful historical velocity. The large Work Packages section appeared too early in Reports. Sprint 2 displayed Accepted / Closed **0**, Done / Awaiting validation **23**, and Active or New **18** (41 reportable units). The owner asked what Accepted/Closed means and questioned the interpretation.

**Definition to preserve for now:** `Accepted / Closed` refers to work in Global Sprints Board **Closed** after reviewer/PM acceptance; `Done / Awaiting validation` is finished work intentionally held in Board Done, potentially native ADO Completed in a process with no intermediate native Done state; `Active or New` is unfinished. In the reported numbers, 0+23+18=41, and the zero Accepted count is *not itself proof of a calculation defect* if none of those 23 items was moved to Board Closed. Do not automatically count a native ADO Completed ticket as accepted while it is held in sprint-specific Done. Different processes may call their final state something else; verify user intent and actual Board placement before changing the accepted/validated distinction. Reports now explains the intended acceptance requirement inline.

**Identified v1.0.47 chart defects and local v1.0.48 correction:**
- Burndown previously fell back to a horizontal completed-vs-remaining bar if fewer than two distinct observation days existed; that bar was not a burndown. v1.0.48 replaces it with an explicit insufficient-history state, retaining current progress in text. With two or more dated observations, show the saved actual remaining-effort line versus a dashed ideal line. No past daily states are invented.
- Automatic observation capture previously skipped all subsequent identical-state observations, preventing daily trends during no-change periods. It now avoids duplicates **within the same local calendar date** but may capture unchanged state on a new day when that sprint is loaded; the registry's original snapshot is preserved. No background service or synthetic historical backfill added.
- Velocity previously filtered exclusively to sprints that already had snapshots and rendered a current-sprint live-completion bar when history was absent. v1.0.48 explicitly compares up to eight **previous ended sprints in the currently selected workspace**, including visible unknown-history gaps; missing observations are not zero, and the current sprint is described separately rather than plotted as historical velocity. Values remain as-of the last saved observation and must not be represented as certified final outcomes. If there are no previous sprints/observations, say so instead of inventing comparisons. Do not mix workspaces silently or double-count parent/child estimates. Cross-sprint reuse attribution remains an open reporting-design concern.
- The Work Packages drilldown (searchable hierarchy and estimates) now renders in a dedicated section **after** the final Gantt delivery overview at the very bottom of the Reports tab. It is not removed, and underlying item links are unchanged.

**Local validation:** New `gs48-reporting.test.cjs` exercises actual chart renderer states, current-vs-previous sprint selection, unknown history, two-day SVG and duplicate-free daily observations. Existing v1.0.47 chart regression updated to reflect the new historical-only contract. The release is an **acceptance candidate, not live accepted**; verify counts against the actual Board Closed/Done lanes and examine saved observation dates on the tenant. If prior sprints lack snapshots, historical velocity remains unavailable. TF400813 `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` extension startup authorization remains a separately identified intermittent defect; startup registry-read recovery has not been changed in v1.0.48. Outlook cancellation, workspace restore, authoritative licensing denial and clean Windows build also remain open.


## 2026-11-03 — v1.0.49 delivery-first Sprint Health and cross-sprint meeting continuity

**Product-owner direction (supersedes the interpretation in the prior v1.0.48 section):** Sprint Health and delivery progress must count **Global Sprints Board Done + Closed as delivered**, compared with **Active/New**. **Accepted/Closed must NOT define sprint execution progress or completion.** Final PM/QA validation often happens at the end; a Done item can still contain bugs. Keep acceptance clearance and quality-risk reporting **separate**, with no implication that a native ADO `Completed` state establishes PM sign-off. Preserve work-item process-agnostic Board placement and existing native ADO workflow rules.

**Implemented locally in v1.0.49 (live acceptance pending):**
- Reports delivery headline is **Done / Closed** vs **Active or New**. Sprint Health displays a single development-delivered percentage (item-count basis; the user-observed example 23 Done and 18 active is 23/41 = about 56%). QA has its own **Awaiting validation** and **Accepted / Closed** totals. A Board Done item counts as delivered even when PM validation has not occurred.
- QA area also displays **Open defects** for current active Bug/Defect work-item types and **Reopened work** when immutable historical observations previously recorded an item Done/Closed but it is currently active. This is evidence-based; external test results and bugs not tracked as ADO work items cannot be inferred. Reopening work makes its uncompleted estimated effort count toward burndown remaining.
- The compact Planning Sprint Health calculation now uses actual Global Sprints Board Done/Closed placement, not native string matching or acceptance-only completion. Blocked, overdue, near-end unfinished and incomplete-data warnings remain separate. Historic snapshots and prior baseline are not rewritten.
- Burndown and Velocity continue to use **Done OR Closed** for completed effort, counted once through `GS40Core.progress`; no fake missing observation history. Work Packages remains last in Reports.

**Cross-sprint meetings: source and contract:** A Global Sprint is a short-lived planning/execution unit. Saved meeting schedules are **workspace-level** records that may span multiple sprints or defined project periods. A recurring Outlook series booked during Sprint 2, with a verified date range into later sprints, **must remain booked** and be recognized by later sprint ceremony guidance without requiring a fresh booking. Closing, switching, or completing a sprint must NOT end or rewrite the workspace meeting schedule. An individual schedule's `sprintId` identifies provenance, not the exclusive ownership of a continuing series. The existing `GS43Schedules.planning` recognizes a future sprint only when a recorded, non-cancelled/non-excluded occurrence actually overlaps that sprint; no coverage is claimed past recurrence end. The active schedule panel shows the stored coverage and recorded recurrence end, but this is **recorded coverage, not a fresh Microsoft Graph read**.

**Replacement/stop workflow (safe, partial implementation):** `Plan replacement…` on a committed active schedule opens the project-period meeting planner with a chosen start date and a suitable future end, prefilling the old schedule end or at least one full sprint cadence. Repeating consecutive-sprint ceremonies is preselected when the selected sprint has a valid whole-week cadence and the requested period spans multiple cycles. Defined-period cycles are derived from their NEW start date, not the selected old sprint's end date. It **does not mutate or cancel existing Outlook events**, publish a replacement, or automatically double-book meetings. Preview continues respecting occupied recurring dates. The existing **Clear All Meetings** operation cancels known active Outlook invitations with attendee notification and stops on uncertain results. **End schedule…** requires active/future Outlook bookings or unresolved requests to be explicitly cancelled/reconciled first, but permits archival of verified *past* Outlook bookings without altering their original event status. A new plan may be prepared independently; the old schedule is not implicitly retired. This is not yet an atomic cutover transaction or a partial-series stop-at-date feature. A genuinely project-scoped schedule model (within a multi-project workspace), edit-effective-date/partial Outlook recurrence cancellation, and calendar collision preview need separate design/Graph acceptance before commercial claims. No live Outlook cancellation was performed in this build.

**Regression tests and pending acceptance:** `gs49-delivery.test.cjs` exercises actual Report/Health handlers with 23 Done, 18 Active, 0 Closed, 2 open defects, 1 reopened; effort returns to burndown remaining on reopen. `gs49-meetings.test.cjs` checks previous-sprint recurring coverage, exceptions, end-of-year boundary, non-mutating replacement planning, safe retirement of past bookings and refusal to retire future booked series. Existing 23 test files must continue passing. Live checks: on actual Sprint 2 verify the 56% item-count completion; compare QA subcounts, active Bugs/reopened evidence and true history; create/view next sprint and confirm existing booked series is recognized through year-end and independent of sprint closure; review replacement plan without Outlook writes. Separately validate Clear All Meetings, Outlook attendee cancellation, unconfirmed meeting operations and workspace restoration before release. Startup TF400813/placeholder identity recovery and authoritative licensing rejection are still unresolved release-readiness gates.
