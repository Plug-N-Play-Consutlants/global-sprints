# v1.0.49 — Local validation and limitations

- Rebuild from canonical source: `python build.py --out Global-Sprints-v1.0.49.vsix` (runs Node syntax and all 25 registered tests, verifies 9 VSIX members and bundled JS equality).
- `gs49-delivery.test.cjs`: executes actual Sprint Health/Reports handlers with the reported 23/41 Board distribution, QA/bug/reopened indicators, and reopen-to-burndown effect.
- `gs49-meetings.test.cjs`: validates recurring series created in Sprint 2 surviving future sprint boundaries, excluded dates and year-end expiry, non-mutating replacement prefill, historical booking preservation on retirement and future booking cancellation safeguards.
- All v1.0.40–v1.0.48 regression suites retained; generated sources, versions and ZIPs independently checked.

**Not demonstrated by local tests:** Real ADO tenant history and status distribution; live Outlook booking/cancellation, attendee notifications, cross-organizer permissions; genuine license rejection; Windows build or startup TF400813 recovery. Nothing in the build changes or tests actual tenant records or Outlook meetings.
