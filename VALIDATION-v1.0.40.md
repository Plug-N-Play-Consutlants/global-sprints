# Validation Report — Global Sprints v1.0.40

Generated: October 28, 2026 (local build environment: Linux).

**Result: Local build/test candidate PASS; live Azure DevOps/Outlook acceptance NOT PERFORMED.**

- Input: verified v1.0.39 source ZIP and VSIX.
- Source-first build: `python build.py --out Global-Sprints-v1.0.40.vsix`; VSIX 263,857 bytes.
- Nine automated test files PASS: assignment, 18 process-aware scenarios, workflow/mentions, identity resolution, hierarchy/accounting/lifecycle core, source hooks, mocked ADO + cancellation, licensing cache, 11 preserved-function fingerprints.
- Packaged JavaScript matches generated/tested JavaScript exactly; nine VSIX entries and ZIP integrity checked.
- ADO permission scopes unchanged from v1.0.39; manifest/header/runtime versions agree.
- Canonical root source; no obsolete extension/ tree or alternate package pipeline.
- Explicit UTF-8 reads avoid the previous CP1252 failure in source, but **Windows was not used for this actual build**.
- Eleven important v1.0.39 workflow, identity, Outlook, Gantt and Board implementation functions match baseline fingerprints.

## Not validated with live services
- Custom Azure DevOps process authorization and external state transitions.
- Hierarchy traversal with real project permissions, cross-project link behavior and concurrent registry writes.
- Microsoft Graph event cancellation and actual attendee notification delivery, including recurring series.
- Browser layout/accessibility and long-running operation recovery in the ADO host.
- Product Command server authority, outage cases, cross-user archive and restoration behavior.

## Known constraints
- Reconstructed legacy application source remains partly single-line; new functions are in separately maintained canonical source modules.
- Feature estimates shared across multiple Global Sprints are not allocated automatically or credited twice.
- Sprint-only cancellation refuses recurring series extending into other sprints; cancel those deliberately at the full-schedule level or via manual reconciliation.

See `ACCEPTANCE-v1.0.40.md` for required live release gates.
