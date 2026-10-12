# v0.8.9

- Remove the fragile runtime dynamic import from the VSIX asset host. License client runs within the already-loaded application module, with no additional network-loaded JavaScript dependency.
- After successful organization storage writes, draft save and delete immediately repaint the dropdown from updated registry; server read-back then verifies persisted state.
- No automatic trial, license enforcement or key storage. Live Product Command endpoint, CORS, and ADO token compatibility still require deployment tests.
