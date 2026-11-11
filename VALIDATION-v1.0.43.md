# v1.0.43 Local Validation (not live acceptance)

- Canonical build: `python build.py --out Global-Sprints-v1.0.43.vsix`.
- **Local result: 13/13 automated test files passed; 9 VSIX assets verified; no syntax errors.**
- Automated tests: original assignment, process-aware transitions, identity, comments, package selection, accounting, licensing, lifecycle and the new read-only schedule lifecycle + renderer tests.
- Added cases: completed historical Draft with Outlook event IDs; current active schedule unaffected; pending/uncertain Outlook states remain visible; future/indefinite recurrence remains active; legacy unbooked Draft stays actionable; selected-sprint coverage (including recurring series) and unrelated sprint exclusion; old booked meeting excluded from future cancellation candidates.
- No Outlook Graph event creation/cancellation, invitation notification or live ADO mutation was performed in this environment.
- Release is pending testing in the user's Azure DevOps organization and Microsoft 365 calendar. Check PROJECT.md for acceptance status.
