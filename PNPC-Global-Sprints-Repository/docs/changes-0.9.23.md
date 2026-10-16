# v0.9.23 corrective candidate

Base: the supplied v0.9.22 installable VSIX's application files, supplemented by the supplied `global-sprints-main.zip` repository's scripts and documentation (which identify themselves as v0.9.16). The two archives do not represent matching source/build snapshots.

Changes: contextual error feedback at action components; remove control in expanded workspace schedule meeting rows, enabled only when Outlook is not linked or confirmed cancelled; explicit cancellation/removal messaging; tab preference recorded alongside user/workspace/sprint context; initialization hides tabs until context restore.

Validation: `node --check` passed; package identity and diagnostic version checks passed; room recovery simulation passed; legacy v0.9.16 validation and acceptance scripts do not pass against the v0.9.22 code (their assertions refer to prior entitlement/navigation implementations). No live ADO or Microsoft Graph booking, cancellation, or refresh lifecycle tests performed.

Status: corrective build candidate for live acceptance, not production-accepted. The original canonical v0.9.22 development repository is still required to rebaseline old automated tests and establish reproducible build provenance.
