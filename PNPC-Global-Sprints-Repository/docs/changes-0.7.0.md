# v0.7.0 usability and health refinement

- Investigated meeting wizard reset: it previously cleared only the transient proposal and navigated to step 1, leaving form selections intact. Saved schedules were intentionally unaffected. The revised action resets unsaved proposal AND form inputs, provides an explicit message, and never deletes saved meetings.
- Distinguishes saved schedules from unsaved proposal, explains four-step workflow and Outlook booking boundary.
- Renames commitment snapshots to commitment history and explains historical baseline versus live summary.
- Adds contextual tooltips to Board, Planning and Reports actions, with specific guidance for high-impact actions.
- Clarifies prerequisites for burndown, velocity and timeline.
- Health audit now checks tooltip coverage, wizard guidance, saved schedule record shape, and baseline help. Corrects diagnostic export version to 0.7.0.

## Validation boundaries
Static syntax/packaging checks cannot prove live ADO, Outlook, browser rendering or runtime behaviors. Health audit does not mutate source tickets or bookings. Generic fallback tooltips are a first pass; follow-on UI refinement should replace these with action-specific descriptions.
