# PNPC Global Sprints

Azure DevOps extension source baseline reconstructed from the **runtime-verified v0.3.48 VSIX**.

## Repository structure

- `extension/`: deployable source assets and manifests extracted unchanged from v0.3.48.
- `scripts/validate.py`: local static and packaging checks.
- `scripts/package.py`: reproducible VSIX packaging from the `extension/` directory.
- `docs/build-history.md`: artifact-level changes across available historical VSIX builds.
- `docs/production-readiness.md`: current limitations and next stabilization work.

## Important

This is the first source-control baseline, **not** evidence of a prior Git history or a complete production-ready codebase. Do not upload `.vsix` packages as the only source code. The checked-in `extension/` directory is the editable application; VSIX packages are generated releases.

The packaged vendor libraries are preserved as supplied by the verified build; their versions, licenses, and future update strategy should be documented before public release.

## Local workflow

From the repository root:

```powershell
python scripts/validate.py
python scripts/package.py
```

This uses Python's standard library. It does not require npm, tfx, or an internet connection. For production, add a pinned dependency pipeline, automated tests and Marketplace release controls.

## Baseline

v0.3.48: Azure DevOps extension loads and Microsoft 365 NAA sign-in was verified by the product owner. Calendar operations have not yet been implemented. Keep this as a rollback checkpoint while stabilization changes are tested.

## v0.3.50

- Removed obsolete Microsoft 365 migration UI and identifiers.
- Added on-demand Microsoft Graph calendar discovery after successful sign-in.
- Calendar preference is browser-local and scoped to Microsoft account and Azure DevOps organization; it is not written to the shared sprint registry.
- No Outlook event writes are performed.
- Preserve existing workspace and sprint data.


### v0.3.51 session recovery repair
On startup, after the Azure DevOps load handshake, the extension attempts to restore an MSAL account and validate it with a silent User.Read token request. No interactive prompt is triggered automatically. If the browser has discarded MSAL's cache, Connect remains available. Calendar preferences are unchanged and no events are written.
