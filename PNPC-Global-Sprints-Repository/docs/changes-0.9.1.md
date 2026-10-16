# v0.9.1 — Azure DevOps Graph authorization scope

Added the minimum Graph read scope `vso.graph` to the extension manifest for server-verified organization administrator membership. No Graph write/manage permission requested. No automatic trial initiation. Installation/update may require organization administrator approval for the added scope. Server v0.5.9 provides more precise authorization diagnostics.

Live verification required: publish/install the updated VSIX, approve revised permissions, reload the extension, and check trial authorization. Successful trial initiation immediately starts the non-resettable 14-day period.
