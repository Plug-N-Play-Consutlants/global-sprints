# Global Sprints v1.0.29 reconstructed package

This directory is a reconstruction of the **deployable contents** of the supplied v1.0.27 VSIX, patched to v1.0.29. It is **not** the original complete Git development repository. Original build scripts, tests, package metadata and source history were not present in the supplied VSIX and cannot be faithfully recovered from it.

## Changes
- Workflow classification prioritizes project/work-item-type state metadata. Native `completed` category is terminal; Completed no longer universally counts as awaiting validation. Done and resolved remain validation-pending where a terminal state is configured.
- Board drag/drop determines destination states from actual available states and delegates final transition enforcement to Azure DevOps. Rejected updates do not change local work item state.
- Search and backlog share a queued multi-selection, which survives a new backlog browse and changing the search query. Supports individual queued assignment, all queued assignment and removal.
- The work item refresh control is named Refresh Available Items.

## Validation scope
JavaScript syntax, VSIX ZIP integrity, XML/JSON parse, manifest alignment and isolated static checks are possible here. Actual Azure DevOps and Microsoft 365 behavior must be acceptance-tested in the connected organization. No attempt has been made to assert live acceptance.

## Provenance
Original package: `Global-Sprints-v1.0.27(1).vsix` supplied in this conversation. `app.js` and `index.html` are the application's **packaged JavaScript/HTML**, not recovered TypeScript sources. `patch.py` used during reconstruction is not the original project's build system.

## v1.0.29 acceptance refinements
- Clicking a suggested search result now adds the ticket to the queue immediately; there is no second Queue action. Search context and nearby ticket results remain in place.
- A native Done state classified as terminal in Azure DevOps remains in the Done Board column across reloads unless explicitly moved, while Sprint Health still treats it as terminal.
- Moving a terminal native Done card to Completed attempts a distinct native Closed state if available; otherwise it stores a Board-only display choice and leaves Azure DevOps unchanged.
- Queued item and bulk buttons use Add to board terminology.

Automated checks validate packaging and static functional invariants, not live Azure DevOps transitions.
