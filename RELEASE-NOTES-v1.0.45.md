# PNPC Global Sprints v1.0.45 — Board @mention Composer Repair

**Status:** Locally validated maintenance candidate; user live ADO acceptance required. Not approved for commercial publication.

## User-reported failure

In v1.0.44, a Board card comment could find a user and allow selection, but continuing to type after the selected `@Name` triggered a second search for that name **plus the following words**, displaying “No matching Azure DevOps users found.” The existing textarea also had no visible indication that selection retained an actual identity link.

## Correction

1. Maintain a resolved `@Full Name` token independently of editable text. Once selected, subsequent words do not extend an identity query. Selecting a suggestion adds a safe word boundary and leaves the caret ready for the rest of the sentence.
2. Invalidate outstanding lookups and guard asynchronously returned results against changed/cancelled search context. Preserve caret position while clicking a suggestion.
3. Show a small blue **linked to Azure DevOps** chip under the comment editor for each selected mention; the textarea itself remains plain text. A removed or edited-away token loses its identity association.
4. Support multiple selected mentions. Encode text safely; convert each verified VSID to the existing Azure DevOps WIT HTML mention anchor and reject any unresolved `@name` before POST. No failed writes are automatically replayed.
5. Retain v1.0.44 identity resolution, stale-tab recovery and all existing Board/Outlook/licensing functionality. No new ADO scopes.

## Validation

- Canonical UTF-8 build and tested VSIX archive; new pure composer unit tests and executed Board UI-handler regression scenarios for selection, continued typing, second mention, unresolved rejection and search concurrency.
- Existing assignment, workflow, identity resolution, scheduling/history, hierarchy, reporting, licensing and session-recovery tests continue in the same source-first build.
- **Not certified:** Actual Azure DevOps comment/notification delivery, live stale-tab recovery, Outlook cancellation, workspace restoration and final licensing-denial cases.

## Rollback

Retain v1.0.44 until the live tenant verifies that a selected identity stays linked when typing and actually posts as a mention. The only functional changes are Board mention composing/confirmation and the generated runtime helper; unrelated business flows are unchanged.
