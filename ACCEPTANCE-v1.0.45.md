# v1.0.45 — Focused Live @mention Acceptance

1. Confirm installed extension, visible header and diagnostics identify **1.0.45**.
2. Open a Board work-item card and type `Thanks @Wen`; select Wendy from the ADO suggestions. Verify **“✓ @Wendy … linked to Azure DevOps”** appears beneath the textarea.
3. Without posting, type `please review this when you can`. The identity should remain linked, and **“No matching Azure DevOps users found” must not appear** because of the extra words.
4. Add a second `@` mention in the same comment, select a different person, and verify two linked chips.
5. Click **Add Comment**. Verify both names become actual mentions on the native Azure DevOps work item (and notifications work where the organization's notification policy allows). Check that ordinary text was preserved.
6. Remove an @name from a new unsent comment; the linked chip must disappear. Try typing an unselected `@Someone`: posting must be rejected without an ADO write and must explain that the person needs to be selected.
7. Verify ordinary card operations: assignment, state change, subsequent comment, Board refresh. Check stale-tab reload after returning from >5 minutes away when practical.
8. If any step fails, record exactly whether the false search appears **before or after clicking Add Comment**, and export fresh Support Diagnostics for v1.0.45. Do not share tokens.

This is a focused maintenance test; existing Outlook cancellation/closeout, commercial licensing rejection and Windows clean-build checks remain separate pre-launch gates.
