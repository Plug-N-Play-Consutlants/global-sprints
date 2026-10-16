# v0.8 Pass A engineering checkpoint

Source baseline: v0.7.2. Target release: v0.8.0. This is a partial source checkpoint, **not** an installable production release.

## Implemented

1. Shared `serviceHttpError()` categorizes HTTP failures without incorporating untrusted response bodies into errors for the primary ADO API and Graph operations.
2. New diagnostic event details are allowlisted to typed numeric/boolean fields, approved method/state enums and strict version strings. Arbitrary free text is discarded.
3. Corrected stale `DIAG_VERSION` from 0.7.1 to 0.7.2.
4. Refreshed README and readiness document, preserving historical versioned records.

## Validated

Existing `scripts/validate.py` and `scripts/audit_paths.py` passed. These are source/static checks only.

## Outstanding concerns

- Historical diagnostic events loaded from localStorage may predate the new allowlist. Export must sanitize or clear them before production.
- Catch blocks and other error surfaces need a broader audit.
- No live concurrency, Graph, permissions or ADO regression testing has been completed in this checkpoint.
- Licensing, production diagnostics UI, support/purchase procedures, code modularity and v0.8 packaging remain unfinished.
