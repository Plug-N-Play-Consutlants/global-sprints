# v0.8.7 — Product Command room integration preview

- Integrates the v0.5.5 Product Command `/ado/entitlement`, `/ado/trial`, `/ado/activate` contract through a dedicated JavaScript module.
- Adds a Configuration licensing panel with explicit Check, Trial and Activate actions, sanitized status reporting and a customer dashboard link.
- No license key or token is persisted; no automatic trial start.
- Server/network/authorization errors are differentiated from commercial denial.
- No access enforcement until server deployment, browser CORS and ADO bearer-token verification are completed.
- Repairs draft picker UI: removes the confirmed-deleted option immediately and rebuilds the list from saved workspace data.

## Release blockers
Server live deployment, ADO identity token verification, Graph administrator check, CORS policy, purchase-to-license provisioning, customer ownership checks, full end-to-end trial/paid entitlement tests, and actual access enforcement.
