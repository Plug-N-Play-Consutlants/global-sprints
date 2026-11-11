# v1.0.47 — Validation record

- Source-first build (`python build.py`) with explicit UTF-8 reads; 22 test files, Node syntax and VSIX asset integrity validated.
- New dashboard/velocity/snapshot tests: real Board and Reports classification functions and live dashboard output; first vs latest immutable snapshot differences; mixed ADO Completed/Resolved/Done; eight-observed-sprint window; Board CSS.
- Snapshot concurrency test: a Feature in an assigned sprint cannot silently prevent observation; post-save Board override changes produce an ordered second capture rather than rewriting the first. It also exercises cross-user registry-only Done/Closed changes after soft Board refresh.
- Existing regression files remain unchanged except documented baseline fingerprint exemption for reportCompletedState and build list. No live Azure DevOps or Graph service writes performed by these tests.
- **Not validated live:** tenant-state accuracy, Outlook cancellation, archived workspace restore, authoritative Product Command denial/expiry, local Windows build, final Marketplace update.
