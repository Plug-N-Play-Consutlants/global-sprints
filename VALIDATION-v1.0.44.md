# Global Sprints v1.0.44 — Local Validation

**Not a live Azure DevOps/Outlook acceptance certification.**

- Built from the v1.0.43 canonical source ZIP with `python build.py --out Global-Sprints-v1.0.44.vsix`.
- 16 automated test files passed, plus JavaScript syntax check. All 9 required VSIX assets matched the tested files; the VSIX archive was verified.
- New scenarios cover host directory identity GUID versus verified ADO VSID; IMS enrichment; empty failed lookup retry; real HTML comment-anchor emission; failure UI; stale-tab focus, visibility and inactivity triggers; unsaved card-draft recovery and selected mentions; failed-write non-replay; pending-operation protections; HTTP 401 GET renewal and HTTP 203 HTML recovery; reload-loop guard.
- Ten previously accepted v1.0.39 implementation fingerprints were unchanged. `searchMentionIdentities` was deliberately changed and tested separately; API/session integration and card editor were deliberately changed, while Outlook booking, Gantt and reporting cores were not modified.
- All tests are mocks, static inspection or local unit execution, **not** actual ADO host/Graph interactions.
- Remaining gates: live @mention notifications, stale-tab recovery, regression of Board actions, Outlook cancellation/archival, licensing denial and Windows clean-build verification.
