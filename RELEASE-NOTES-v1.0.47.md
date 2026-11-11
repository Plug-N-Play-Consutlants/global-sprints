# Global Sprints v1.0.47 — Reports and Velocity consistency

**Baseline:** v1.0.46. **Acceptance:** local candidate; no tenant modifications or live Outlook operations performed.

- Refresh Board is now green with consistent hover, keyboard-focus and disabled behaviour. It also refreshes Board/Reports after another PM changes sprint-specific Done/Closed placement without a native ADO revision change.
- The Board Done validation hold is now reflected in `Done / Awaiting validation`, team workload, project breakdown and Sprint Health. ADO `Completed` with a sprint-scoped Done hold no longer erroneously counts as Accepted; only a Global Sprints Closed board stage does. Native workflow records are unchanged by reporting.
- New observations store both mapped native state (`completionCategory`) and effective sprint Board state (`deliveryCategory`), preventing misleading classification in new historical reporting. Older snapshots are preserved as-is.
- Historical Velocity uses each sprint's most recent valid saved observation and all work recorded in that observation, including scope added after the first baseline. Eight-sprint window applies to observed sprints, not empty sprints. Each line in the data table includes the observation date; bars are not asserted final.
- Automatic observations no longer vanish when Feature/Epic planning context is present. A queued after-save observation records the final Board decision when an ADO state update and Board placement are saved separately. New observations still require fully loaded assigned work and use parent/child single-count accounting.
- No Outlook, Graph, licensing logic, ADO permissions or native iterations changed.

**Verification:** Tests exercise real Board and Reports functions with process-specific Done/Closed states, source snapshot serialization and revision-less Board-only changes, the historical Velocity renderer, an edit/save race and the green style. Live host acceptance remains required.
