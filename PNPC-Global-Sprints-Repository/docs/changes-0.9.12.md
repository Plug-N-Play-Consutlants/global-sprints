# Global Sprints v0.9.12 — Pre-v1.0 integration test build

This build consolidates development changes since v0.9.11 for live Azure DevOps and Microsoft 365 testing.

## Source changes
- Persist active tab and workspace/sprint navigation state across refresh.
- Board work-item detail dialog with explicit native Azure DevOps link.
- Meeting preview minute-level time input and local-time validation.
- Outlook native weekly recurrence with selected weekdays in one series, multiweek recurrence and end date.
- Outlook-compatible timezone mapping for supported locales and wall-clock times for recurring events.
- Workspace schedule proposal supports a single standup series and regular sprint-cadence ceremony proposals.
- Per-meeting Outlook booking preflight errors, series update/cancellation warnings, inline removal guidance, and red cancellation button.
- Refresh shared sprint registry when switching sprints and before swimlane saves.

## Acceptance still required
- Wendy and Jesse must each verify scheduling under their own Microsoft 365 accounts.
- Verify Microsoft Graph event recurrence and timezone across DST, series update and cancellation.
- Verify shared sprint membership and swimlane movement under both users.
- Confirm irregular sprint cadence handling and existing legacy individual-meeting migration before production launch.
- Subscription management remains Product Command-owned and is not exposed here.

Static checks are not substitutes for live Graph/ADO tests. This is an installable **test build**, not v1.0 certification.
