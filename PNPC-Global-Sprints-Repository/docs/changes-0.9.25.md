# Global Sprints v0.9.25 — Production hardening candidate

Baseline: validated v0.9.24 source ZIP. This is an offline-validated candidate requiring live Azure DevOps and Microsoft Graph acceptance before promotion.

## Implemented
- Outlook: after a successful Graph create, persist the exact event ID, calendar ID, account ID, operation ID and meeting ID in a bounded browser recovery journal *before* attempting the shared registry save. Pending booking reconciliation can query the original event ID and link it after Graph confirms its existence. No blind retry or subject/time guessing. The pending shared registry marker remains the duplicate-prevention authority. Browser storage may be unavailable or cleared; in that case the existing manual-review safeguard remains. This is not a cross-device durable service journal.
- Reporting: retain every manual History Record and the first observation/baseline; cap only subsequent automatic observations at 150. Existing older records cannot be recovered if already trimmed in previous releases.
- Hierarchy: bounded concurrency (six concurrent requests) per level, deduplicated ancestor loading and stale-response cancellation checks.
- Calendars: expand weekly and sprint-cadence recurrence within the displayed month for saved/proposed meeting calendars. This does not replace Graph's recurrence rules or implement full multi-timezone support.
- Diagnostics: allow strict enums for safe operation and error codes, numeric retry/record metadata. Continue excluding arbitrary exception messages, account IDs, meeting names and tokens.
- Keyboard: arrow/Home/End navigation between available tabs.
- Release gate: `python -X utf8 scripts/test_release_0925.py` and package verification.

## Live acceptance required
1. Graph create succeeds, registry save fails, then reconcile from same browser/account. Confirm no duplicate event and that links recover. Repeat after browser storage is cleared to verify safe manual fallback.
2. Two users simultaneously modify distinct and overlapping workspaces; confirm ETag conflict rejection and no lost writes. No shared registry sharding has been attempted without this evidence.
3. Inspect weekly/sprint recurring meeting previews, month navigation, DST boundary, and the resulting actual Outlook series.
4. Compare Board hierarchy load times and request counts with v0.9.24 for realistically sized sprints.
5. Verify tab keyboard behavior and focus in actual Azure DevOps iframe.
6. Re-test licensing, refresh restoration, Outlook cancellation/removal, work-item edits, and reporting.

## Explicit deferrals
- Cross-device/server-side Outlook operation journal; would require shared contract and storage design.
- Major shared-registry schema migration, full timezone mapping, and wholesale application modularization.
- Full WCAG dialog focus-trap audit and broad mobile redesign.
