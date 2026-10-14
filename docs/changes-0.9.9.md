# v0.9.9: Product Command v0.5.16 entitlement simulation compatibility

- Preserves a previously verified organization-scoped entitlement in browser localStorage across page restarts when Product Command is unreachable. Cache key binds stable Azure DevOps host ID and organization name; no bearer token or license key stored.
- A successful authoritative `200` revocation replaces cached status and closes commercial work areas. A successful active status restores access.
- Network errors, `503`, malformed responses, and 12-second request timeouts preserve the previous verified decision. New/never-verified organizations remain restricted.
- Failed checks retry with backoff from 60 seconds to 15 minutes; connectivity and page focus can trigger faster retries. Explicit denied statuses are also periodically rechecked for recovery.
- Entitlement checks remain asynchronous relative to board/project initialization.
- Trial entitlements with a known expiry are not prolonged beyond their verified expiry solely by an outage.

## Boundaries

- Local browser storage is best-effort, browser-profile-specific, and user-modifiable. It is not a cryptographically signed entitlement, and may be unavailable in restricted third-party iframe storage contexts. Product Command has not yet implemented signed assertions.
- This release does not change Product Command, Outlook scheduling, interactive demo, or other extension workflows.
- Offline recovery requires an initial successful verification and a browser profile retaining its local cache.
