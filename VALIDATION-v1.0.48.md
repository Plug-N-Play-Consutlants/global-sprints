# v1.0.48 — Local validation and limitations

Run `python build.py --out <path>` from the source-first repository root; the build performs JS syntax verification and every registered Node regression file. New tests execute the actual Reports renderer, verify one/two-date Burndown distinctions and previous-sprint Velocity history, check Work Packages placement and exercise daily observation persistence. Source and VSIX integrity can be verified by comparing `app.js` and manifest versions.

**Scope limitation:** Synthetic records and local browser stubs do not prove historical data exists in the user's ADO tenant, that 23 cards actually await validation, or that real cross-process acceptance transitions behave identically. No native ADO, Outlook or licensing-service writes are performed by the local suite.

**Recorded v1.0.48 run:** 23/23 automated test files passed with `node --check app.js` and 9 verified VSIX entries. Source archive and aggregate package are created and checked separately.
