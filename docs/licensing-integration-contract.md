# Global Sprints — Product Command integration contract (design, not implemented)

Product Command is the authority for trial timestamps, organization-bound entitlements, payment-linked licensing, renewal and revocation. The VSIX is not a trusted authority.

Lifecycle: Marketplace installation -> organization-level 14-day full trial -> purchase at PNPC website -> Product Command entitlement -> authorized administrator activation -> server validation -> renewal/expiry. No per-seat activation.

Required service operations: idempotent trial lookup/start by stable Azure DevOps organization ID; entitlement validation; authorized activation; signed or server-validated status and expiry; revoke/rebind with ownership checks and audit; rate limiting.

Never trust browser storage, organization display names or client clocks for license decisions. Never embed service secrets or signing keys in the VSIX. Use HTTPS and least privilege. Define bounded offline grace for previously validated paid entitlements. Expiry must never delete sprint data or mutate source Azure DevOps work items.

Release gate: trusted Product Command service plus verified purchase, activation, expiry, renewal and revocation flows. Extension-only mock licensing is not sufficient.
