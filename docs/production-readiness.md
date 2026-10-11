# Production readiness review (initial)

## Verified so far
- v0.3.48 package extracted as source baseline.
- Product owner confirmed startup, existing sprint display and Microsoft 365 NAA sign-in.
- The extension manifest registers the bundled MSAL browser script as addressable.

## Outstanding release gates
1. Establish GitHub canonical repo, branches, version tags, ownership and code review.
2. Introduce deterministic dependency acquisition, integrity and license review for vendored SDK and MSAL.
3. Add tests for Azure DevOps data concurrency, conflict handling, save recovery, and migration.
4. Review security: scopes, HTML rendering, permissions, MSAL cache, errors and Graph consent.
5. Review UI dead code, CSS overrides, missing DOM references, and remove outdated NAA diagnostic copy.
6. Add test matrix for hierarchy, Kanban, drag-and-drop, demo isolation, workspaces, sprint persistence and cross-project assignments.
7. Confirm Marketplace publisher assets, license, privacy statement, support, pricing/trial policy, and release automation.
8. Confirm package version, manifest asset registration and rollback before every publish.

Do not remove functions or migrate stored data based solely on static reference searches; runtime-created controls and stored schemas must be tested.
