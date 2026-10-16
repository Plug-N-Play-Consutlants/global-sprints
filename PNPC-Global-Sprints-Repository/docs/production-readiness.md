# Production readiness — v0.8.0 workstream (in progress)

**Accepted functional baseline:** v0.7.2. **Target:** v0.8.0. **Status:** engineering work in progress, not production-approved.

The original v0.3.48 readiness checklist is superseded by this current workstream. Historical change logs and audits retain their original version identifiers.

## Pass A — architecture, reliability, security

- [x] Inventory source package and reproduce existing static validation against v0.7.2.
- [x] Replace raw Azure DevOps and Graph HTTP response text with categorized, non-sensitive errors.
- [x] Restrict new diagnostic event details to allowlisted, typed metadata; correct diagnostic version reporting.
- [ ] Validate redaction of **previously stored** diagnostic events before export; add safe migration/clearing.
- [ ] Inspect all error boundaries, DOM sinks, links, storage keys and authentication/session flows.
- [ ] Add automated behavior tests for registry migrations, concurrent writes, work-item state mapping and exports.
- [ ] Verify ETag conflict behavior with two live clients; do not assume a source comment establishes atomicity.
- [ ] Verify vendor SDK/MSAL provenance, versions, licenses and integrity; review least-privilege scopes.
- [ ] Review performance and accessibility with real-sized workspaces.

## Pass B — commercial and support

- [ ] Implement organization-based licensing, trial and expiry enforcement with offline/error policy.
- [ ] Define WooCommerce/Product Command purchase, issuance, renewal, cancellation and support journey. Checkout integration is a separate dependency.
- [ ] Convert Support into production Extension Health; retain safe diagnostic export, remove development-only UI/test runners from shipping assets.
- [ ] Establish Pocket Service Desk intake, triage, escalation, data retention and response process.

## Pass C — release and verification

- [ ] Finish approved bounded UX refinements, including inline History Record.
- [ ] Validate clean installation, upgrade, rollback and preserved customer data.
- [ ] Run live regression across Board, Planning, Reports, Outlook, Demo and permissions.
- [ ] Produce final v0.8.0 VSIX and evidence pack only after release gates pass.

## Current source snapshot

The first Pass A snapshot retains **manifest v0.7.2 intentionally**. It is an engineering checkpoint and must not be distributed as a v0.8.0 release. Existing static checks do not prove runtime behavior.
