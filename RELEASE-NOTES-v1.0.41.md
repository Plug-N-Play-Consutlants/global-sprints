# Global Sprints v1.0.41 — Hierarchy selection acceptance correction

## User-reported defect in v1.0.40
Selecting a User Story could discover child links and prompt for inclusion without showing the actual children. The standard Search > Queue now and Add to board routes still added only the parent ID, and the Kanban Board largely resembled the old flat presentation.

## Corrected behavior
- Search suggestions, Planning search table, Browse Backlog parent selection and work-package actions open a visible, hierarchical preview before modifying sprint membership.
- Every accessible linked child is listed with ID, title, work-item type, native state, assignee and nesting. The parent and eligible children from the same native iteration are selected by default.
- A child on a different native iteration is visible but unchecked. Users can explicitly choose to include it without modifying the native iteration.
- A child in another active Global Sprint cannot be silently duplicated; already assigned items show their status.
- Adding selected members writes the IDs in one registry persistence operation, reloads the assigned ADO items and refreshes Planning, Board and search interfaces.
- An already-added parent remains previewable, so missing child tasks can be included later without adding the parent again.
- Kanban parent cards display an expanded list of direct children and their states/assignees, while task cards retain independent states and visible parent references. The existing Board Hierarchy view remains available.
- Independent child-task queueing and explicitly selected bulk IDs remain available. The latter is a flat-ID bulk operation, not a hierarchical package operation.

## Scope and compatibility
This is a *focused correction* atop v1.0.40, not another implementation of the full pre-release plan. The v1.0.40 retrospectives, reporting, Outlook bulk cancellation, workspace archiving and licensing paths remain unchanged. Parent/child ADO links, native iterations and source work-item states are never rewritten by the package-selection operation. No new extension scopes.

## Validation and remaining live checks
- 10 Node regression test files passed, including 18 process-state cases and focused package-preview UI simulation tests.
- Work package tests cover native relation traversal, preview-before-write, default selections, same/cross-iteration children, duplicate prevention, conflicts with active sprints, and reopening a parent after partial assignment.
- All 11 preserved v1.0.39 implementation fingerprints (identity, ADO workflow, Outlook, Gantt, etc.) still match.
- Source-first VSIX build verifies version alignment, file content and archive integrity.
- Live ADO acceptance remains necessary. Test a Story with two children that are NOT in the latest 200 returned backlog items. Confirm the preview lists both, the Board displays the nested summary after saving, and native ADO iteration/state do not change.
