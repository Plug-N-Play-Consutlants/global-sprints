# v0.9.15 consolidated acceptance build

- Completes popup planning fields (Description and Acceptance Criteria) from v0.9.15 checkpoint; native ADO state, assignee, estimate and comments retained. Editing rich text currently converts changed fields to escaped text with line breaks; unchanged fields preserve original HTML formatting.
- Distinguishes fresh Board launch from page reload tab restoration.
- Refreshes assigned ADO items for reports; snapshots include type, Effort and Story Points.
- Records automatic observations on meaningful changes, including multiple changes within a day; deduplicates unchanged work item states. Dated burndown trend still requires at least two different observation days. Existing historical records remain immutable.
- Shows selected sprint's live completed/remaining points separately from historical cross-sprint velocity; preserves comparison semantics.
- Meeting editor includes navigable reference calendar, highlighted saved meetings, proposed recurrence preview, clear weekly standup guidance and conditional recurrence controls. Graph native series remains authoritative; existing Outlook occurrences are not retrieved by this reference calendar.
- Preserves Done/Completed board category mapping, shared swimlane behaviour, entitlement enforcement, and workspace Outlook integration.

## Verification
- scripts/validate.py, scripts/audit_paths.py, scripts/test_licensing.cjs, scripts/test_room_recovery.cjs, scripts/test_acceptance_0915.cjs, node --check, and VSIX integrity/version checks.
- Live Graph series creation/updates/cancellations and simultaneous Jesse/Wendy sessions require acceptance tests in the actual organization.
