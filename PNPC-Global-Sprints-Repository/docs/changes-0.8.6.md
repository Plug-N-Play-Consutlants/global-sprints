# v0.8.6 — Board draft persistence correction

- Capture selected workspace and draft IDs before mutation; require exact one-record deletion.
- After the shared-registry write, re-fetch organization-scoped extension storage and verify the selected draft ID is absent.
- Reconcile the picker against persisted data and clear its selection only after verification.
- Do not report deletion success when read-back fails or the draft remains.
- Verify saved draft creation by read-back as well.
- No changes to Azure DevOps work item state, sprint membership, or Outlook.
- Product Command entitlement integration remains pending.
