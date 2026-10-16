# v0.8.8 Startup isolation repair

- Removes the new Product Command licensing module from the critical application startup import graph.
- Loads licensing only on explicit Check Entitlement / Start Trial / Activate action.
- Failed licensing-module loading now reports an error within Configuration instead of blocking the Azure DevOps SDK handshake.
- Retains the v0.8.7 draft deletion UI update.
- Licensing enforcement remains disabled pending end-to-end validation.
