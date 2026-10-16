# Global Sprints v1.0.0 release candidate — acceptance record

## Baseline

Source: supplied v0.9.25 full repository. No claim of live Azure DevOps, Outlook, or Product Command certification is made by offline checks.

## Change in this candidate

The initial navigation shell (tabs, workspace/sprint selectors, and tab panels) stays visually hidden until the selected tab has been applied. The loading message remains visible. Startup hydration can render data in the background without flashing the default Board selection. No new navigation persistence mechanism is introduced.

## Required live release acceptance (NOT TESTED by offline suite)

- [ ] Refresh on each of Board, Planning, Reports, Configuration, Support and Demo. First visible tab must be the saved tab, without an intermediate Board or Configuration flash.
- [ ] Refresh after switching workspaces and sprints. Confirm context and work-item membership.
- [ ] Edit Description and Acceptance Criteria, assignee, state and comments with appropriate ADO permissions.
- [ ] Verify selected Sprint 1 totals: five executable items, 10 points, one completed point, nine remaining when all five are committed.
- [ ] Capture and download History Records, then verify read-only integrity.
- [ ] Verify Outlook creation, updates, cancellation, removal, and recurrence with real calendars. Do not deliberately force a production Graph/registry failure.
- [ ] Verify two-user concurrent registry operations in a controlled test environment.
- [ ] Verify trial issuance and Product Command admin binding; resolve the previously observed 403 graph_token_scope_or_access if still present.
- [ ] Verify licensed, revoked, expired, and temporarily unavailable entitlement scenarios using a controlled test service.
- [ ] Verify clean installation, upgrade from v0.9.25, publisher/extension identity, and Marketplace readiness.
- [ ] Verify keyboard navigation, Support diagnostics export and no secret disclosure.

## Release gate

This candidate must not be described as production-certified until the live checklist passes. If a blocker is found, correct it and rerun the affected offline and live tests before promoting to launch.
