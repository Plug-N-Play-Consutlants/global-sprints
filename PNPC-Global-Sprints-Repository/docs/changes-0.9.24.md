# Global Sprints v0.9.24 — correctness and data-integrity candidate

Baseline: user-supplied `PNPC-Global-Sprints-Source-0.9.23.zip`, whose application and manifest were byte-identical to the user-supplied `PlugNPlayConsultants.global-sprints-0.9.23.vsix`. The audit's locally inspected Windows nested tree was not accessible in this build environment. This package has one `PNPC-Global-Sprints-Repository` source root and one packaging script.

## Changes

- Removed premature tab rendering during module evaluation. After SDK/registry/workspace/sprint initialization, apply the selected tab to the DOM once, with a user-navigation generation guard. Removed silent Board fallback and split session/local preference handling into independently diagnosed reads/writes. Suspended context persistence during initial hydration.
- Preserve normalized licensing cache `startedAt` and `expiresAt` on restoration; reject malformed and expiry-less active-trial records. Product Command endpoint and contract unchanged.
- Preserve native Closed lane when ADO metadata reports category Completed; fetch scoped state metadata for assigned work-item types. Share completion classification across health and historical reports; capture the normalized category in new observations.
- Return explicit complete/partial/failed/superseded outcomes from assigned work-item loads. Report refresh no longer announces success after a failed load.
- Allow retired/discarded schedules after confirmed Outlook cancellation; reject active or unresolved events. Block sprint deletion if linked ceremonies still have active/unresolved Outlook operations, including inside the shared registry mutation.
- Surface cancellation and removal errors beside meeting records where available. Preserve existing direct removal of cancelled records.
- Replace stale source-string assertions in existing acceptance checks and add executable regression checks and one validation command.

## Validation boundaries

`python -X utf8 scripts/test_release_0924.py` runs the offline suite. It does **not** establish live Azure DevOps iframe behavior, Outlook Graph cancellation, two-user registry concurrency, or Product Command trial issuance. Those require real service acceptance. No live Azure DevOps or Microsoft 365 credentials were available in this environment.

## Known follow-up

- Host navigation and browser storage behavior in the installed Azure DevOps hub must be verified live. This supplied v0.9.23 baseline does not contain the host-hash helpers described in the later independent audit; no unverified host-navigation integration was invented for this build.
- Outlook orphaned-event recovery, baseline retention beyond 150 observations, shared-registry concurrency and broad accessibility/performance improvements remain v0.9.25 scope.
