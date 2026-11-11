# Global Sprints v1.0.46 — Live acceptance checklist

1. Verify installed extension, header, diagnostics and manifests show **1.0.46**; approve any Marketplace scope changes only if expected (this build requests none).
2. Open **Sprint 2**; select #910 from the User Story / child work-package preview. If it exists in Test sprint, the note may mention that sprint, **but the checkbox must remain enabled**. Add it. Confirm #910 appears in Sprint 2 while remaining in Test sprint; nothing changes in native ADO iteration or parent links.
3. Attempt to add #910 to Sprint 2 again. Confirm **no same-sprint duplicate**. Remove from Sprint 2 and verify its Test sprint membership remains untouched.
4. In Board's swimlane toolbar use **Refresh Board**; verify last-updated status, latest ticket state and membership without an extension-frame reload. Preserve horizontal/vertical Board scroll, current sprint and filters.
5. Open a card and begin typing unsaved comment or change assignee. Background synchronization and manual refresh must not replace the editor or discard its contents. Finish/close it, then try Refresh Board again.
6. Leave the Global Sprints browser tab inactive for more than five minutes, return, and confirm unobtrusive soft refresh. An actual 401/203 authentication issue may require guarded iframe reload with draft recovery; it must not replay a write.
7. Test with a second PM changing a source ticket or adding/removing a sprint member; use Refresh Board and confirm data is visible without silently overwriting the other PM's changes.
8. Where safe, exercise a stale ADO revision: the UI must identify the changed ticket and ask for a refresh rather than attempt repeated transitions. Genuine workflow validation failures must remain blocked.
9. When licensing rejection testing is scheduled, verify Product Command 403 transport responses and authoritative suspended/revoked entitlements are differentiated; no denial bypasses are accepted.
10. Regression spot-check assignment, selected @mention followed by ordinary text, hierarchy, native Done/Resolved transitions, Sprint Health, reporting and Outlook invitation creation. **Do not cancel production meetings just to test this build.**

**Deferred prelaunch:** live Outlook bulk cancellation and attendee notification, workspace archive/restore, clean Windows build and final health audit.
