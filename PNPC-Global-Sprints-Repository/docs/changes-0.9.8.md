# Global Sprints v0.9.8: launch hardening

- Fail-closed UI while the initial Product Command entitlement is unknown or unavailable; preserve only last verified in-memory entitlement during transient errors.
- Restrict Board, Planning, Reports and Demo until verified entitlement is active. Configuration and Support remain available.
- Correct audit and diagnostic version to v0.9.8.
- Reject invalid local meeting times including daylight-saving spring-forward gaps. Browser timezone remains the meeting timezone; ambiguity in fall-back hour is not resolved.
- Extend build checks to verify the actual VSIX identity, contribution and diagnostic version.
- No changes to Graph event create, PATCH, cancellation or recipient suggestions.

## Remaining commercial limitation

This is a fail-closed browser UI gate, **not tamper-resistant licensing enforcement**. Azure DevOps extension code executes in the client's browser. Server-side Product Command verifies trial/license entitlements, but determined clients can alter local UI code. Do not claim client-side commercial enforcement is unbypassable.

## Testing

Check licensed reload, no-entitlement startup, offline startup, recovery after service restoration, expired/revoked status, and the new invalid-time rejection. Test these in Azure DevOps before publishing to customers.
