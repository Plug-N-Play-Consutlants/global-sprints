# Global Sprints v1.0.38 — Board card assignment maintenance

## Scope

This build changes only the work-item detail popup's **Assigned to** editor and the shared identity normalization that supplies it and @mentions. Based on the accepted v1.0.37 deployable-source reconstruction.

## Defect

The prior editor was an unrestricted text box. It sent typed display names or partial values directly to `System.AssignedTo`, without checking identity resolution. This can fail on duplicate names or work-item-type identity validation. There was no discoverable picker for an actual Azure DevOps user.

## Correction

- Use the existing Azure DevOps identity lookup logic to search for people while typing in the card's Assigned to field.
- Clicking a suggestion selects a resolved identity. Where an email is present, submit the verified email to WIT; otherwise submit the resolved IdentityRef rather than a guessed display name.
- Full valid email addresses remain a supported manual fallback. Reject ambiguous unmatched name strings locally with a clear message.
- Clearing the field unassigns the ticket (WIT `System.AssignedTo` set to empty string).
- Keep suggestion buttons outside the input's label to avoid accidental focus/click interference.
- Correct shared identity normalization so already-resolved `email` values survive.
- Refresh the displayed assignment from the ADO PATCH response and retain the work-item revision check.

## Preserved areas

Board Done/Completed mapping, sprint assignments, queued work items, @mention markup/posting, Outlook scheduling, reports, Gantt, licensing and extension scopes unchanged. Visible header, runtime diagnostic version, package manifests now identify v1.0.38.

## Validation

`node --check app.js`, `node assignment.test.cjs`, `node workflow-and-mentions.test.cjs`, `node identity-resolution.test.cjs`, VSIX/ZIP integrity checks, and archive/manifest-version checks. These are offline tests: **assignment must still be exercised in a live Azure DevOps project** with a member selection, direct email fallback and clearing an assignment.

## Source limitation

The source ZIP is a reconstructed *deployable* application, not the original TypeScript/history/pipeline source. The top-level directory is `PNPC-Global-Sprints-Repository`.
