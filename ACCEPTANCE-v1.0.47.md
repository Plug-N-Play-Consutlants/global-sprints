# v1.0.47 — Live acceptance checklist

1. Install VSIX and verify app/Marketplace header v1.0.47. Confirm **Refresh Board** is green and an open Board card is not disrupted by automatic refresh.
2. Pick a sprint containing a native ADO `Completed`-category item shown under Global Sprints **Done** (awaiting validation). Verify Reports **Done / Awaiting validation** reflects it; **Accepted / Closed** must not also include it.
3. Move the card to the Global Sprints Closed column (without changing a legitimately terminal ADO state). Verify Done count decreases by one, Accepted rises by one, and project/team bars reconcile. No other sprint membership or native iteration is affected.
4. For a process with native `Resolved`, verify Done and Closed remain correct; verify ADO Done under Completed category is distinguished from accepted Closed where appropriate.
5. Confirm Sprint Health and selected sprint live completion include both Done and Closed as delivered effort but separately identify outstanding validation. Parent and child estimates must not be double-counted.
6. Inspect Velocity's last-observation dates and completed points against the History Record. Add/complete work after the initial baseline and capture a later observation; only that later observation contributes the added scope. Initial baseline remains unchanged. Unobserved recent sprints must not suppress previously observed sprints from the eight-sprint window.
7. Verify background captures work for a sprint containing Feature, Story and Task records. An accepted Board-only Done→Closed change should save a new observation without a native ADO state change. No duplicate or incomplete observations. Check a second PM changing a Board-only validation placement: clicking Refresh Board in the first session must redraw both Board and Reports even if the native ADO revision is unchanged.
8. If historical data lacks a new deliveryCategory, expect original native-category interpretation; old captures are not retroactively reconstructed. Do not claim a final historical result unless a valid closeout observation exists.

**Pending outside this change:** real Outlook cancellation/notifications, workspace restore, authoritative licensing denial, clean Windows rebuild, multi-user ADO testing. These tests do not create or cancel Outlook invitations.
