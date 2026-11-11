'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/app-main.js','utf8');
const board=fs.readFileSync('src/gs46-board.js','utf8');
const session=fs.readFileSync('src/gs44-session.js','utf8');
function harness(){
 const children={},listeners={};let refreshes=0,reloads=0,now=100000000;
 for(const id of ['gs46BoardRefresh','gs46BoardFreshness'])children[id]={id,textContent:'',disabled:false,classList:{toggle(){}},addEventListener:(event,cb)=>{listeners[id+'-'+event]=cb;}};
 const document={hidden:false,activeElement:null,querySelectorAll:()=>[],getElementById:id=>children[id]||null,addEventListener:(name,cb)=>listeners[name]=cb};
 let registry={sprints:[{id:'s2',name:'Sprint 2',itemIds:[910],workspaceId:'prod'}]};
 const C={document,token:'test',registry,busy:false,timelineBusy:false,bulkBusy:false,switchingSprint:false,
 gs40BulkCancelBusy:false,outlookBookingBusy:false,Date:class extends Date{static now(){return now;}},
 currentSprint:()=>C.registry.sprints[0],sprintDirty:()=>false,projectsDirty:()=>false,
 refreshSharedRegistryForExecution:async()=>{refreshes++;return C.registry;},
 refreshTrackedWorkItemsQuietly:async()=>({status:'complete',changed:false}),loadAssignedItems:async()=>({status:'complete'}),
 assignedItems:[{id:910}],renderBoard(){},renderSprintHealth(){},diagnostic(){},queueMicrotask,
 setTimeout:fn=>{fn();},Promise,Number,Set,String,Error};
 vm.createContext(C);vm.runInContext(board,C);return {C,listeners,get refreshes(){return refreshes;},clock:delta=>now+=delta};
}
(async()=>{
 const x=harness();let soft=vm.runInContext('GS46Board',x.C);
 const first=await soft.refresh();assert.equal(first.status,'complete');assert.equal(x.refreshes,1);assert.match(x.C.document.getElementById('gs46BoardFreshness').textContent,/Updated/);
 x.C.document.querySelectorAll=()=>[{id:'gs-board-item-dialog'}];
 const blocked=await soft.refresh();assert.equal(blocked.status,'deferred');assert.equal(x.refreshes,1);
 x.C.document.querySelectorAll=()=>[];await soft.refresh();assert.equal(x.refreshes,2);
 console.log('PASS: soft Board refresh and edit-safe deferral without full-frame reload');
 // Run real v1.0.44 session listener with v1.0.46 Board refresh provider.
 let focus={},time=10000000,count=0;const data=new Map();const sessionStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const win={sessionStorage,addEventListener:(name,cb)=>{focus[name]=cb;},location:{reload:()=>{count++;}}};
 const doc={visibilityState:'visible',addEventListener:(name,cb)=>{focus['doc-'+name]=cb;},getElementById:()=>null};
 const C={Date:class extends Date{static now(){return time;}},window:win,document:doc,sessionStorage,JSON,Number,Math,Error,
 setTimeout:fn=>fn(),token:'t',registry:{sprints:[{id:'s'}]},busy:false,diagnostic:()=>{},GS46Board:{refresh:()=>{soft=1;}}};
 vm.createContext(C);vm.runInContext(session,C);focus.blur();time+=301000;focus.focus();assert.equal(count,0);assert.equal(soft,1);
 vm.runInContext('GS44Session.markAuthenticationFailure(401)',C);assert.equal(count,1,'auth recovery still reloads safely');
 console.log('PASS: idle tab uses soft update; authentication failures still use guarded reload');
 // Revision conflict detection through actual transition validator, no automatic write retries.
 const start=app.indexOf('async function validateStateTransition('),end=app.indexOf('async function destinationState(',start);
 assert(start>0&&end>start);const validator=app.slice(start,end);
 const calls=[];const httpError=new Error('HTTP 412');httpError.status=412;
 const V={Number,JSON,Error,diagnostic:(...args)=>calls.push(['diagnostic',...args]),api:async url=>{
  calls.push(['api',url]);if(url.includes('validateOnly'))throw httpError;return {rev:8,fields:{'System.State':'Active'}};
 }};
 vm.createContext(V);vm.runInContext(validator,V);
 const target={id:910,rev:7,state:'Active'};
 await assert.rejects(()=>vm.runInContext('validateStateTransition',V)(target,'Resolved'),/changed in Azure DevOps/);
 assert.equal(calls.filter(x=>x[0]==='api'&&!x[1].includes('validateOnly')).length,1,'412 triggers exactly one read-only revision fetch');
 assert.equal(calls.filter(x=>x[0]==='api'&&x[1].includes('validateOnly')).length,1,'failed transition is never replayed');
 assert.equal(calls.find(x=>x[0]==='diagnostic')[1],'ado.workflow.revision_conflict');
 console.log('PASS: HTTP 412 revision conflict gives precise diagnosis without replaying PATCH');
 const h=fs.readFileSync('index.html','utf8');assert(h.includes('id="gs46BoardRefresh"'));assert(h.includes('id="gs46BoardFreshness"'));assert(h.indexOf('id="gs46BoardRefresh"')<h.indexOf('class="row lane-toolbar"'),'Board refresh must remain visible in Hierarchy and Kanban');
 assert(app.includes("diagnostic('licensing.transport_denied'"));
 assert(app.includes("const readOnly=method==='GET'"));
 console.log('PASS: refresh controls, read-only POST classification, licensing 403 distinction');
})().catch(error=>{console.error(error);process.exitCode=1;});
