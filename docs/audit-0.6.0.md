# v0.6.0 Functional and Pathway Audit — initial pass

## Verified in source / corrected
- Work-item state updates PATCH `System.State` with revision test; corrected success diagnostics to preserve pre-write revision.
- State choices come from the actual Azure DevOps work-item-type states endpoint, not invented labels.
- Known Agile/Scrum state names retain their explicit presentation categories; inherited custom states may fall back to ADO state category when metadata is available.
- Corrected destination-state preference sorting when custom names are not in the preference list.
- Work-item refresh now logs requested/received/changed/missing and errors.
- Once-per-day automatic snapshots now log when an observation already exists, rather than appearing untested.
- Board state update PATCH does not touch parent relations or hierarchy.

## Open runtime acceptance / further audit
- Validate customized inherited Agile/Scrum workflows against real project process metadata and available transitions. Current state-category fallback does not establish process ancestry.
- Verify inbound refresh on an external source-ticket edit; quiet refresh is periodic and may be suppressed while editing.
- Verify persisted automatic observations over separate days and storage reloads.
- Review Outlook event creation and delayed invite notifications with Graph event IDs and delivery evidence if anomaly recurs.
- Verify ancestor hierarchy retrieval and missing/permission-restricted parent cases.

This is the first audit build, not a declaration that all v0.6 pathways have passed.
