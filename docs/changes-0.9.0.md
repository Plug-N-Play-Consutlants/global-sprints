# v0.9.0 — Licensing state and evaluation gates

- Automatic entitlement check after Azure DevOps access token is obtained; it does not block SDK readiness or normal data restoration.
- Explicit organization trial and activation; no automatic trial issuance.
- Friendly licensed, active-trial, unlicensed, expired, suspended and revoked labels and expiry timestamp.
- On a verified denied entitlement, work-area tabs and workspace controls become inert; Configuration and Support remain available; no data is removed.
- Trial/activation success immediately updates work-area access.
- On service failure, retain a previously verified entitlement and distinguish transport failure from denial. With no verified decision, existing features remain usable in this **integration test build**.

## Important production gate
This is UI-level evaluation only, **not commercial enforcement**. JavaScript running in a customer's browser can be modified; fail-open on initial service outage is deliberately limited to this integration build. Production release requires an explicit fail-closed policy, reliable offline/error UX, server-side authorization for protected operations, plus trial/activation, purchase, revocation, expiry, and recovery acceptance tests.
