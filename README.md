# PNPC Global Sprints — reconstructed deployable source (v1.0.39)

This folder is the **reconstructed deployable JavaScript/HTML and VSIX contents** of the Azure DevOps extension, based on the v1.0.38 reconstructed deployable source (original recovery began from the user-supplied v1.0.35 VSIX). It is **not** a faithful recovery of the original Git repository, TypeScript source, build pipelines, or historical commit graph; those were absent from the VSIX.

## Files
- `app.js` — bundled, readable application JavaScript; source for v1.0.39 maintenance changes.
- `index.html` — application UI and visible release header.
- `extension.vsomanifest`, `extension.vsixmanifest`, `[Content_Types].xml` — extension package metadata.
- `vendor/`, `images/`, `licensing-contract.js` — retained unchanged from v1.0.37.
- `workflow-and-mentions.test.cjs` — executable isolated regression checks of production functions.
- `process-agnostic.test.cjs` — process-aware synthetic transition tests across Agile, Scrum, Basic, CMMI, custom, validation and rollback scenarios.
- `AUDIT-v1.0.37.md` — historical audit of the recovered v1.0.37 baseline.
- `RELEASE-NOTES-v1.0.39.md` — process-aware state-transition changes, regression coverage and limitations.
- `RELEASE-NOTES-v1.0.38.md` — historical assignment maintenance changes.
- `assignment.test.cjs`, `workflow-and-mentions.test.cjs`, `identity-resolution.test.cjs` — automated focused regression tests.
- `build.py` — reconstructs an installable VSIX from this directory, with version and archive checks.

## Build and tests

```sh
node --check app.js
node assignment.test.cjs
node process-agnostic.test.cjs
node workflow-and-mentions.test.cjs
node identity-resolution.test.cjs
python build.py --out Global-Sprints-v1.0.39.vsix
```

Azure DevOps organizational data is **not bundled**. The extension stores sprint-wide Board placement in its existing organization-scoped extension-data registry. Production acceptance tests must be performed inside the intended ADO organization; no ADO mutations or Outlook calls were performed during this reconstruction.
