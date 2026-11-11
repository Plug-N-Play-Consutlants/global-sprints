# Global Sprints v1.0.42 — Consolidated UI and audit hardening

**Release state:** Locally validated VSIX acceptance candidate, **not** commercially released and **not** yet verified in the Azure DevOps host.

## Changes

1. **Sprint Closeout Notes** (existing note editor, *not* the planned collaborative Retrospective Board): rename user-facing heading and Finalize button. Save/Finalize/Reopen success, validation and persistence-error feedback now displays beside the buttons in an accessible live region; the heading retains selected-sprint/finalized context. The storage schema and historical versions are unchanged. Only this caller opts into local persistence feedback; other actions keep their original messaging.
2. **Saved Workspace Meeting Schedules:** wrap the existing schedule renderer in a collapsible, initially closed native details region with saved/committed/booked counts. The existing scheduling buttons, individual meeting controls, Outlook operations, and stored records are unchanged.
3. **End schedule…** uses the red `danger` action style. Its existing retirement callback and confirmation remain unchanged. Clear All Meetings was already red and is not modified.
4. **Product Command response hardening:** reject malformed dates and any server `trial_active` entitlement without a valid expiry, while retaining intentional outage tolerance for previously verified, unexpired licenses. No new ADO permissions or licensing endpoints.
5. **Test/release maintenance:** replace four stale hardcoded version assertions with manifest-derived checks; add direct tests for opt-in local save feedback, disclosure structure, schedule styling, and licensing response normalization. Build script now validates v1.0.42 runtime, HTML and manifests.

## Intentionally not changed

- Agile/Scrum/Basic/CMMI/custom workflow transitions, Board placement, assignee selection, @mentions, child hierarchy and effort accounting.
- Outlook meeting creation/cancellation, schedule retirement, workspace closeout/restore, Gantt, reports and general licensing cache policy.
- The **post-launch** collaborative Retrospective Board and richer Interactive Reports remain design requirements in the living `PROJECT.md`.

## Validation and open release gates

- `python build.py` generates/test-validates the installable VSIX with no secondary source tree and explicit UTF-8.
- `node --check` plus 11 automated test files, including immutable v1.0.39 pathway fingerprints and current process-aware scenarios, pass locally.
- **NOT TESTED HERE:** rendering in an actual Azure DevOps tenant; Windows clean build; live Product Command denial/revocation and server-side enforcement; Outlook bulk cancellation, attendee notices and schedule ending; workspace closeout/restore.

Do not mark those open gates as accepted without actual live evidence. Keep v1.0.41 as the previously accepted rollback candidate.
