/* PNPC Global Sprints licensing contract v1. No client-side entitlement authority. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PNPCGlobalSprintsLicensing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PRODUCT = 'global-sprints';
  const STATES = Object.freeze(['trial','active','expired','suspended','unlicensed']);
  const MAX_RESPONSE_AGE_MS = 24 * 60 * 60 * 1000;
  function requireOrganizationId(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error('A stable Azure DevOps organization identifier is required.');
    return id.toLowerCase();
  }
  function parseServerEntitlement(payload, organizationId, now = Date.now()) {
    const org = requireOrganizationId(organizationId);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid entitlement response.');
    if (payload.product !== PRODUCT || requireOrganizationId(payload.organizationId) !== org)
      throw new Error('Entitlement does not match this Azure DevOps organization.');
    if (!STATES.includes(payload.status)) throw new Error('Unknown entitlement state.');
    if (!Number.isFinite(now)) throw new Error('Invalid validation time.');
    const issued = Date.parse(payload.validatedAt), expiry = payload.expiresAt == null ? null : Date.parse(payload.expiresAt);
    if (!Number.isFinite(issued) || issued > now + 300000 || now - issued > MAX_RESPONSE_AGE_MS)
      throw new Error('Entitlement validation is stale or invalid.');
    if (expiry !== null && !Number.isFinite(expiry)) throw new Error('Invalid entitlement expiry.');
    if ((payload.status === 'trial' || payload.status === 'active') && expiry === null)
      throw new Error('Entitlement expiry is required.');
    // Status from Product Command is advisory until verified through a trusted transport.
    return Object.freeze({product:PRODUCT,organizationId:org,status:payload.status,
      expiresAt:expiry === null ? null : new Date(expiry).toISOString(),
      validatedAt:new Date(issued).toISOString(),
      displayOnly:true});
  }
  function describeEntitlement(state, now=Date.now()) {
    if (!state) return 'License status unavailable. Global Sprints licensing is not connected.';
    if (state.status === 'suspended') return 'License suspended. Contact PNPC support.';
    if (state.status === 'unlicensed') return 'No license is associated with this organization.';
    if (state.status === 'expired' || (state.expiresAt && Date.parse(state.expiresAt) <= now))
      return 'License or trial expired. Existing sprint data is preserved.';
    return state.status === 'trial' ? 'Trial entitlement reported by the licensing service.' : 'Active entitlement reported by the licensing service.';
  }
  // Deliberately no local trial creation, activation, or entitlement enforcement.
  // The eventual Product Command adapter must authenticate and verify server responses.
  return Object.freeze({PRODUCT,STATES,requireOrganizationId,parseServerEntitlement,describeEntitlement});
});
