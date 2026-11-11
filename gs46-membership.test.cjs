'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const script=fs.readFileSync('src/gs41-runtime.js','utf8');
const existing={id:'test',name:'Test sprint',status:'Active',workspaceId:'test-space',itemIds:[910]};
const target={id:'sprint2',name:'Sprint 2',status:'Active',workspaceId:'production',itemIds:[]};
const records={workspaces:[],sprints:[existing,target]};
let writes=0;const log=[];
const ctx={registry:records,projects:[{id:'project',name:'Alpha'}],workspaceProjectIds:()=>['project'],currentSprint:()=>target,
 browserItems:[],browserSelection:new Set(),Map,Set,Number,Promise,Date,JSON,Error,String,
 persist:async change=>{writes++;change(records);return true;},
 loadAssignedItems:async()=>{},renderBrowser:()=>{},renderBacklog:()=>{},renderSuggestions:()=>{},renderBoard:()=>{},updateBulkToolbar:()=>{},diagnostic:(...x)=>log.push(x)};
vm.createContext(ctx);vm.runInContext(script,ctx);
const pkg={items:[{id:910,project:'Alpha',title:'Example',state:'New',type:'User Story',iterationPath:'Alpha\\Sprint2'}]};
(async()=>{
 let plan=vm.runInContext('gs41SelectionPlan',ctx)(pkg,target);
 assert.equal(plan[0].selectable,true,'test sprint reference must never disable Sprint 2 inclusion');
 assert.equal(plan[0].selected,true);assert.equal(plan[0].conflict,'Test sprint','other sprint reference can remain informational');
 const n=await vm.runInContext('gs41CommitWorkPackage',ctx)(pkg,[910],'sprint2');
 assert.equal(n,1);assert.deepEqual(existing.itemIds,[910]);assert.deepEqual(Array.from(target.itemIds),[910]);
 assert.equal(log.at(-1)[0],'sprint.membership.package_added');assert.equal(log.at(-1)[1].otherSprintCount,1);
 const again=await vm.runInContext('gs41CommitWorkPackage',ctx)(pkg,[910],'sprint2');
 assert.equal(again,0);assert.deepEqual(Array.from(target.itemIds),[910]);assert.equal(writes,1);
 console.log('PASS: #910 may exist in Test sprint AND Sprint 2; duplicate prevented only within Sprint 2');
})().catch(error=>{console.error(error);process.exitCode=1;});
