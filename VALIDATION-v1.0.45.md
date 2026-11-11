# Global Sprints v1.0.45 — Local Build Validation

**Status: automated/local tests passed; live ADO mention acceptance NOT established.**

- Built from the preserved v1.0.44 source using the canonical UTF-8 `build.py`; `python build.py --out Global-Sprints-v1.0.45.vsix` succeeded.
- **18/18 test files passed**, plus `node --check` and source-to-VSIX parity, manifest/version and VSIX archive integrity. See `RELEASE-TEST-OUTPUT-v1.0.45.txt`.
- New tests cover pure composer behaviour and **the actual extracted card editor event handlers**: select identity, continue typing, select a second identity, serialize two valid WIT mention anchors, prevent stale async candidate results and reject unresolved `@name`.
- No new permission scopes; `gs40-core.js`, SDK libraries, MSAL library and the application icon are byte-identical to v1.0.44. Existing 10 protected v1.0.39 implementation fingerprints passed.
- `PROJECT.md` and `AGENTS.md` are included in the source. The source folder remains `PNPC-Global-Sprints-Repository`.
- **Not independently tested:** live tenant comment posting/notifications, Windows clean checkout, stale-tab refresh in the real ADO host, Outlook cancellation/archiving and commercial-license revocation.

**Release decision:** v1.0.45 is a focused live-acceptance candidate. v1.0.44 remains a rollback until the product owner confirms.
