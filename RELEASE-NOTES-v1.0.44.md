# PNPC Global Sprints v1.0.44 — Board Reliability Maintenance

**Status:** Local build and automated tests passed; awaiting live Azure DevOps acceptance. Not approved for commercial publication.

## Scope

1. Fix @mention identity trust boundary: directory `entityId` values are no longer treated as verified Azure DevOps VSIDs. Host users without a verified VSID are enriched using the IMS/Graph identity path before constructing a WIT comment anchor. Empty/transient failed lookups are not cached. Keep existing authenticated assignee and HTML comment paths.
2. Make identity selection and comment failures visible and diagnosable. Selected identities use ADO mention-anchor markup. An unresolved `@name` is not silently posted as though it were a valid notification.
3. Recover stale Azure DevOps extension tabs: reload after five minutes in background or prolonged inactivity, or on detected 401/203 HTML authentication response. Guard against repeated reloads and protect in-flight writes; no POST/PATCH replay. Retain the selected tab and save unsaved Board card edits/selected identities in tab session storage for reopening the same card. If draft preservation fails, show a warning instead of forcibly discarding edits.
4. Maintain the v1.0.43 read-only schedule-history and ceremony-guide corrections; no changes to Outlook meeting creation, cancellation or archive/restore, licensing or reporting.
5. Update `PROJECT.md` in this source ZIP, README and live acceptance checklist.

## Regression protection

`python build.py --out Global-Sprints-v1.0.44.vsix` runs 16 automated test files plus syntax, archive/member and source parity checks. Existing 10 protected v1.0.39 function fingerprints are unchanged; the intentionally updated mention search has dedicated tests. No new permission scopes.

## Still requires live testing

- Use an actual Board card comment, type @ + a person who has not recently been assigned, choose the result, post and confirm mention rendering/notification in native ADO.
- Leave ADO tab inactive for >5 minutes; return and confirm reload and resumed editing. Verify stale draft recovery, tab persistence, and no duplicate writes.
- Verify known existing Board actions (assignment, comment, state transition) work both before and after resumed use.
- Commercial licensing rejection and actual Outlook bulk cancellation, attendee delivery, workspace closeout/restore, plus clean Windows build remain separate release gates.

## Risk and rollback

Keep v1.0.43 VSIX and source as rollback. The stale-session recovery is browser/runtime behaviour tested locally but not yet in the live ADO iframe. If a persistent host authentication issue prevents successful reload, the UI should surface a warning rather than loop. Do not claim real-tenant acceptance based on these local tests.
