# Global Sprints v1.0.46 — Pre-release reliability maintenance

**Baseline:** v1.0.45. **Scope:** cross-sprint membership, Board refresh, ADO conflict diagnostics, Product Command authorization observability. No new Azure DevOps scopes.

- Work-package preview no longer forbids adding a ticket already present in a different sprint/workspace; informational notice replaces the blocking warning. Same-sprint duplication remains prevented. Regression case includes work item #910 with pre-existing Test sprint membership.
- Add **Refresh Board** above swimlanes with last-updated status. Soft refresh checks shared registry and ADO data; edit/save protection defers updates, and the existing 2-minute poll skips active card editors. Stale tab return after 5 minutes now soft-refreshes rather than normally reloading the extension; actual authentication failure still triggers guarded reload with draft preservation.
- Correctly classify Azure DevOps batch/ WIQL POST reads instead of logging them as writes; safe read-only token renewal is separate from non-replayable ADO mutations.
- For HTTP 412 transition validation, read latest WIT revision before deciding whether the rejection is a stale-revision conflict or workflow-rule failure; never blindly replay writes.
- Distinguish Product Command transport HTTP 403 from a verified licensing decision and preserve outage tolerance without granting access after authoritative suspension/revocation.
- Improve structured sanitized diagnostics for membership, UI failures, revision conflicts, status and operation context. No names, comment content, tokens or entitlement keys logged.
- `PROJECT.md` remains the evolving source of truth for agent background, accepted state, requirements and future (post-launch) Retrospective Board/Interactive Reports.

### Validation boundaries

Automated tests exercise code paths and simulated ADO/identity/session behaviour, including 18 process-aware workflow cases. The VSIX is a pre-release acceptance candidate; native multi-user ADO membership, live Product Command HTTP 403 semantics, Outlook cancellation/notifications and workspace restoration still require testing in their respective environments.
