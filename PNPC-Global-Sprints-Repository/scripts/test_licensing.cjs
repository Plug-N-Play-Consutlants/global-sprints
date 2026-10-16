const assert = require('node:assert/strict');
const L = require('../extension/licensing-contract.js');
const org='12345678-1234-4234-8234-123456789abc';
const now=Date.parse('2026-10-12T12:00:00Z');
const base={product:'global-sprints',organizationId:org,status:'trial',validatedAt:'2026-10-12T11:59:00Z',expiresAt:'2026-10-26T12:00:00Z'};
const valid=L.parseServerEntitlement(base,org,now);
assert.equal(valid.status,'trial'); assert.equal(valid.displayOnly,true);
assert.match(L.describeEntitlement(valid,now),/Trial/);
assert.match(L.describeEntitlement(valid,Date.parse('2026-10-27T12:00:00Z')),/expired/);
for (const altered of [
 {...base,organizationId:'87654321-1234-4234-8234-123456789abc'},
 {...base,product:'other'}, {...base,status:'admin'},
 {...base,validatedAt:'2026-10-10T11:59:00Z'},
 {...base,validatedAt:'2026-10-13T11:59:00Z'},
 {...base,expiresAt:'invalid'}, {...base,expiresAt:null},
]) assert.throws(()=>L.parseServerEntitlement(altered,org,now));
assert.throws(()=>L.requireOrganizationId('my-organization'));
assert.match(L.describeEntitlement(null),/not connected/);
assert.match(L.describeEntitlement({...valid,status:'suspended'}),/suspended/);
assert.match(L.describeEntitlement({...valid,status:'expired'}),/expired/);
console.log('Licensing contract validation PASS (untrusted display-only responses; enforcement not implemented)');
