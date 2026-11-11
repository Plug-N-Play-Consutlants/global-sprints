'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const base=JSON.parse(fs.readFileSync('docs/baseline-fingerprints-v1.0.39.json','utf8'));
const src=fs.readFileSync('app.js','utf8');
// v1.0.44 intentionally updates mention lookup to reject unverified host entity IDs.
// v1.0.46 changed destinationState to identify stale revisions; v1.0.47 changes
// reportCompletedState to use sprint-scoped stage in new observations.
// Original workflow and Outlook implementations are still protected.
const approvedChanges=new Set(['searchMentionIdentities','destinationState','reportCompletedState']);
for(const [name,expected] of Object.entries(base)){
 if(approvedChanges.has(name))continue;
 const begin=src.search(new RegExp('\\b(?:async\\s+)?function\\s+'+name+'\\('));assert(begin>=0,'missing '+name);
 const rest=src.slice(begin+12),next=rest.search(/\n(?:async\s+)?function\s+[\w$]+\(/);
 const end=next<0?src.length:begin+12+next;
 const hash=crypto.createHash('sha256').update(src.slice(begin,end)).digest('hex');
 assert.equal(hash,expected,name+' changed outside agreed v1.0.41 scope');
}
console.log('PASS: '+(Object.keys(base).length-approvedChanges.size)+' accepted v1.0.39 workflow, identity, Outlook, Gantt and Board implementations unchanged; mention, revision validation and report classification changes are covered by focused v1.0.44/v1.0.46/v1.0.47 tests');
