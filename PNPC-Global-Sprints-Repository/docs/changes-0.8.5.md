# v0.8.5 — Licensing contract foundation

- Added an independently testable licensing contract module to the VSIX.
- Added organization-ID, product, entitlement-state, response-age, and expiry validation.
- Explicitly marks parsed responses as **display-only**, not authorization decisions.
- Added negative tests for organization mismatch, wrong product, unknown status, stale/future response, invalid expiry, and missing organization identity.
- Packaged module as an addressable extension asset and updated manifests and version references.

**Not implemented:** Product Command service, server-verified trial issuance, secure license activation, trusted authorization and enforcement, purchase integration, and renewal/revocation. The module intentionally cannot unlock or lock functionality. Existing work remains accessible during development. Do not ship as commercial licensing.
