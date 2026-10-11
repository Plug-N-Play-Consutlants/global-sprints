# v0.6.2 Automated Functional Audit

## Run
Support > Diagnostics > Run Automated Diagnostic. Review PASS / FAIL / WARNING / NOT TESTED; Export Audit Report JSON.

## What it actually verifies
- Local work-item coverage, identity fields, duplicate assignments, snapshot structure and number of distinct observation dates.
- GET-only Azure DevOps state metadata per source project and work-item type.
- Pure isolated synthetic state, blocker, membership and historical observation assertions.

## What it cannot establish
- Azure DevOps Agile/Scrum process ancestry (state metadata alone does not prove inheritance).
- Parent-child relation preservation by comparing source relation links.
- Inbound synchronization without a deliberate external change.
- Outlook attendee invitation delivery without creating an event.
- Production mutation and UI event handlers from isolated synthetic calculations.

## Safety
No source ticket PATCH, organization persistence or Graph mutation is performed by the runner. Existing user-triggered application behavior is unaffected. Live checks use current loaded sprint data and GET requests only. No token or email is included in audit exports.

## Findings are evidence, not a universal PASS
The report includes explicit NOT TESTED results for pathways requiring external mutations or provider-side actions. Synthetic assertions do not imply real Azure DevOps writes have been tested.
