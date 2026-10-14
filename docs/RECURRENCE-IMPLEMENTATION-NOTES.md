# v0.9.12 recurrence implementation checkpoint

Current v0.9.11 stores a separate occurrence for each weekday and books each via an independent Graph POST. This cannot satisfy the required single Outlook standup series.

This checkpoint **does not claim** series support. It explicitly labels preview rows as occurrences while retaining the existing per-occurrence Outlook booking pathway. That pathway must be replaced before acceptance because it can create duplicate series. Existing booked events are not changed.

Required next implementation: persist one workspace-owned recurrence definition per ceremony, implement Graph recurrence payload for multi-weekday standups with explicit timezone and range, preserve series master ID and calendar/account identity, support occurrence/series cancellation with authorization and reconciliation, and migrate existing individual bookings only after explicit approval. Sprint-based ceremonies must use actual sprint boundaries, with exception reconciliation when dates are irregular.

The Wendy-specific authorization failure still needs an action-specific diagnostic from her Microsoft session; her read-only audit did not execute Graph writes.
