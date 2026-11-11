# Global Sprints v1.0.42 — Validation boundary

**Local validation:** Source-first build; no active legacy `extension/` tree; explicit UTF-8; JavaScript syntax check; 11 test files including prior 18 process-aware workflow scenarios; byte-for-byte VSIX JS vs built source; 9 expected VSIX members; runtime/HTML/manifests all v1.0.42. Hash-based regression checks prove the 11 defined v1.0.39 accepted function slices are unchanged.

**Source integration checks:** Direct isolated tests cover opt-in inline save/error feedback and unchanged default notification behaviour, closeout status accessibility and placement, collapsible schedule markup, red End schedule button retaining retirement callback, active-trial expiry requirements, malformed date rejection and normal denied statuses. These are not browser/ADO/Outlook integration tests.

**Live Azure DevOps tenant:** NOT TESTED for v1.0.42.

**Live Microsoft 365:** NOT TESTED for v1.0.42. No live cancellation or attendee notification performed. Preserve v1.0.41 rollback.

**Windows PowerShell build:** NOT TESTED in this environment; build script uses explicit UTF-8, but a clean native Windows checkout must be checked.

**Commercial licensing enforcement:** NOT CERTIFIED. Product Command backend contract, organization trust boundary, token validation and denial/revocation semantics require authoritative live/server-side acceptance. Browser-based UI restrictions are not a tamper-resistant license mechanism.
