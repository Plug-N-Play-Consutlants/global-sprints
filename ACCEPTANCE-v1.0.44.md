# v1.0.44 — Live Board & Stale-Tab Acceptance (pending)

1. Confirm installed VSIX, extension header, Support Diagnostics and manifest show **1.0.44**.
2. On a card comment, type `@` plus the name of a team member (preferably not the current assignee), select the offered Azure DevOps user, post, and confirm the comment has an actual mention in native ADO, with normal notification behavior.
3. Try a user whose host people picker supplies only a directory identity. The app must resolve a true ADO identity or show an explicit error; it must not claim success with a plaintext @name.
4. Leave an ADO Global Sprints tab out of focus/background for at least 5 minutes. Reopen the tab: confirm the extension iframe reloads, restores the selected tab and working Board controls, without a full host-page refresh.
5. Open a Board card, type an unsaved title/description/comment and select an @mention. Leave the browser tab for at least 5 minutes; return, reopen the card, and verify the unsaved draft and selected identity were recovered without posting or saving anything automatically.
6. Verify short focus changes (less than 5 minutes) do not gratuitously reload. Verify a pending save is not cut off and no duplicate POST/PATCH writes occur.
7. Run a Board state/assignee/comment regression, and verify previously accepted Sprint Backlog hierarchy and Sprint Health remain correct.
8. If tests fail, export fresh `global-sprints-support-diagnostics-1.0.44.json` and record the exact Board action and time. In particular check `ado.mentions.*`, `ado.api_*` and `session.*`.
9. Do **not** interpret local tests as certification of Outlook cancel, workspace closeout/restore, licensing denial or other remaining release gates.
