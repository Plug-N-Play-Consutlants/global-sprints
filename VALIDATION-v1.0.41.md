# v1.0.41 validation

**Automated:** PASS — 10 test files including new preview/child-selection acceptance simulation; node --check; VSIX content/version assertions; file fingerprint comparisons.

**Live Azure DevOps:** NOT TESTED here. User acceptance remains required for the specific project and host.

**Live Microsoft 365:** NOT RETESTED; no changes to existing Outlook implementations in this correction.

**Important product behaviour:** Bulk "Select loaded / Add all to Board" continues to add explicitly queued IDs only. The Story/PBI work-package action now previews its full descendant set before assignment. Task-level cards remain independent and appear in their own Kanban columns; parent cards show their linked children in an expanded summary.

**Rollback:** Retain accepted v1.0.40 until v1.0.41 passes live acceptance.
