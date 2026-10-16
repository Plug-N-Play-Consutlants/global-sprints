# Global Sprints 0.8.1 — Production Hardening Checkpoint

**Status:** Test build. Not a production release or commercial license implementation.

## Implemented
- Hardened diagnostic export: revalidates historical local records with the current safe-field allowlist, drops session identifiers from exported payload, and renames the file as a support diagnostic export.
- Removed the customer-facing development-session start button and clarified the support export label. Engineering audit remains available pending the production health refactor.
- Expanded History Record in its Global Sprint card instead of scrolling to a distant section.
- Added narrow-screen layout and light, legible PNPC palette overrides for phone-sized viewports; Kanban stays horizontally scrollable rather than compressing lanes.
- Clarified existing scenario-based Demo introduction; no guided Demo implementation.
- Bumped VSIX and manifest versions to 0.8.1; retained the 0.7.2 historical release documentation.

## Not yet implemented or verified
- Trusted Product Command licensing, trial enforcement, purchase integration, and BYOL Marketplace configuration.
- Full production diagnostic refactor, code architecture cleanup, concurrency/load tests, and security assessment.
- Lightweight Getting Started guidance and mobile device/browser acceptance.
- Azure DevOps live installation, upgrades, Graph attendee cancellation delivery, and end-to-end functional regression.

**Testing:** Repository static checks, source-path checks, JavaScript syntax and archive integrity. Live ADO and Outlook testing required. Preserve existing customer data; do not use this as a production release.
