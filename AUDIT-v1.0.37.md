# PNPC Global Sprints — v1.0.35 forensic audit and v1.0.37 correction

## Inspected artifact
- User uploaded v1.0.35 VSIX, package integrity pass, nine packaged entries.
- Identical SHA-256 to the earlier locally generated v1.0.35 VSIX.
- Version declarations inside that artifact: HTML header, runtime `DIAG_VERSION`, and both manifest versions = 1.0.35.
- v1.0.35 does **not** contain the quoted `has no native Done / Resolved state` warning; older v1.0.33 and v1.0.34 builds do. If that exact warning is still visible, the running code is not the v1.0.35 application bundled here.

## High-priority root causes
1. The v1.0.35 `getStates` function reclassified the native Completed state into Done for any work-item type lacking an intermediate resolved stage. This mapped *all* previously Completed tickets of that type to Done, not just tickets deliberately moved to Done by the user. It conflated workflow metadata with per-sprint presentation intent.
2. The drag/drop handler in v1.0.35 did not persist an explicit Done placement when its target ADO state was Completed. A state PATCH succeeded, but Board placement could subsequently resolve back to Completed/Closed. This failure was not covered by its earlier isolated mapping tests.
3. @mention search in v1.0.35 used several direct REST/fetch routes, including identity hosts outside the Marketplace iframe origin. A network/CORS failure prevented resolving people. The Azure DevOps extension SDK exposes an authenticated host identity service (`ms.vss-features.identity-service`) that avoids cross-origin lookup in the primary path. The old implementation did not use it.
4. The old regression tests checked classification helpers and presence of fallback strings, not the actual asynchronous drop handler, persistence order, rollback, or successful identity lookup when browser fetch is blocked.

## v1.0.37 changes
- Preserve native Completed as a terminal ADO state. A work item explicitly dragged to Global Sprints Done can be stored in Done via `doneDisplayIds[id] === true`, without reclassifying all other Completed tickets.
- For project/work-item types with no Done/Resolved state, target a real supported terminal ADO state. Store the explicit Board Done placement before the ADO PATCH and roll it back if ADO rejects the change.
- Moving from Done into the final Board column sets an explicit final presentation override; moving back to In Progress updates ADO and clears that override.
- Manual state changes through the Board select or card details clear stale presentation overrides.
- @mentions first query the host SDK identity service, normalize and validate actual identity GUIDs, then use existing API fallbacks if necessary. HTML mention anchors remain identity-based; typed @Name is never emitted as a fake mention.
- Header is explicitly updated to v1.0.37, with an SDK manifest-version check to highlight stale/mismatched application assets.

## Regression results (isolated, not live)
- Production `dropOnCell` exercised against four ADO process configurations.
- Scrum New → In Progress → Completed: ADO transitions to Completed; Board persists Done, including reload; explicit final placement and reopening work.
- Resolved → Completed and Done → Closed workflows retain separate stages.
- ADO PATCH failure rolls back a stored Board override.
- Host SDK identity service finds a GUID-bearing user even if REST browser fetch throws `Failed to fetch`.
- JavaScript syntax, HTML IDs/scripts, VSIX content/versions and archive integrity checked.

## Wider code inspection
- Search Work Items still defaults to unfinished work with its explicit All states option and shared queue; no changes made.
- Sprint Health derives terminal acceptance from native state metadata independently from the Board placement; preserved.
- Existing Outlook, Graph/MSAL, Product Command licensing, work item editing, backlog, Gantt, report and ceremony logic are retained from the user-supplied v1.0.35 package.
- Structural risk: the extension is a single large JavaScript bundle recovered from a VSIX rather than the original modular source tree. Unit tests cover corrected logic but cannot replicate all host SDK flows.
- A few legacy HTML/CSS constructs and old version references in comments remain; unrelated UX changes were deliberately deferred.

## Live acceptance still required
1. Verify visible header is **v1.0.37** and does not show a version-mismatch error. If it is not v1.0.37, the actual installed/served build is stale.
2. In a source project whose work-item type only supports New → In Progress → Completed, drag a fresh Active card into Done. It should update the source ADO ticket to Completed and remain in Global Sprints Done after a full reload.
3. Move that same card to final Completed/Closed Board column, then back to Done and then In Progress; verify actual ADO state and Board position each time.
4. Open a card, type `@` plus two letters, choose a colleague. Confirm that the suggestion appears, the saved comment contains a real mention and that an Azure DevOps notification follows organization notification rules.
5. If any test fails, export Support Diagnostics and Extension Health Check results before changing code again. Actual live API permissions / identities cannot be observed in an offline package audit.

## v1.0.37 mention identity correction
- v1.0.36 live acceptance confirmed Done state/Board placement; unchanged in v1.0.37.
- v1.0.36 host people picker returned entries without a usable *combination* of name and storage-key ID. The service interface permits slim identities containing only entityId/originId.
- v1.0.36 incorrectly queried IMS and Graph endpoints through dev.azure.com (404). v1.0.37 uses documented vssps.dev.azure.com routes.
- Host user GUIDs can be resolved via IMS, IMS name search resolves names to VSIDs, Graph subjectQuery resolves descriptors into storage key GUIDs, and locally loaded WIT assignees provide a trusted alternative.
- No additional extension scopes. API/network behavior and actual notification emission still require live acceptance.
