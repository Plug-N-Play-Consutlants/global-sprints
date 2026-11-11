'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app-main.js','utf8');
function excerpt(begin,end){const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);assert(a>=0&&b>a);return source.slice(a,b);}
(async()=>{
 const sprint={id:'s',itemIds:[10,11],snapshots:[],doneDisplayIds:{11:true}};
 const context={sprints:[sprint]};
 const feature={id:10,project:'P',title:'Feature only',type:'Feature',state:'Active',effort:0};
 const story={id:11,project:'P',title:'Story',type:'User Story',state:'Completed',effort:5,parentId:10};
 let releases=[],writes=0,rendered=0;
 const ctx={registry:context,items:[],assignedItems:[feature,story],currentSprint:()=>sprint,
  sprintDirty:()=>false,projectsDirty:()=>false,Map,Set,Number,JSON,Date,Error,Promise,String,
  workflowColumn:w=>w.id===11?'Closed':'In Progress',
  retainReportHistory:a=>a,
  renderSprintHealth:()=>{rendered++;},renderTimeline:()=>{},diagnostic:()=>{},
  persist:async callback=>{writes++;callback(context);await new Promise(resolve=>releases.push(resolve));return true;},
 };
 vm.createContext(ctx);
 vm.runInContext(excerpt('function boardColumn(w){','async function setDoneDisplay('),ctx);
 vm.runInContext(excerpt('let observationInFlight=false,observationQueuedSprintId=null;','function reportFiltered(){'),ctx);
 const capture=vm.runInContext('autoReportObservation',ctx);
 // Intentional partial caller `found` (Feature filtered out by reportWork())
 // still captures the complete assigned sprint from assignedItems.
 const first=capture(sprint,[story]);
 assert.equal(writes,1);
 assert.equal(sprint.snapshots[0].items.length,2,'Feature should not disable capture of the two assigned items');
 assert.equal(sprint.snapshots[0].items[1].deliveryCategory,'Done');
 sprint.doneDisplayIds[11]=false;await capture(sprint,[story]);
 assert.equal(writes,1,'in-flight capture must not initiate concurrent extension storage writes');
 assert.equal(releases.length,1);
 releases.shift()();await first;
 // The queued change should be captured after the first save.
 for(let i=0;i<8&&writes<2;i++)await Promise.resolve();
 assert.equal(writes,2);
 assert.equal(sprint.snapshots.length,2);
 assert.equal(sprint.snapshots[0].items[1].deliveryCategory,'Done');
 assert.equal(sprint.snapshots[1].items[1].deliveryCategory,'Closed');
 releases.shift()();for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(rendered,2);
 assert.equal(writes,2);
 console.log('PASS: partial executable-only list no longer blocks full observation; concurrent native/Board edits coalesce to final stage without rewriting history');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Ado revision can be identical while a teammate changed Board-only
// validation placement in the shared Global Sprints registry.
(async()=>{
 const board=fs.readFileSync('src/gs46-board.js','utf8');
 const store={sprints:[{id:'s',itemIds:[21],doneDisplayIds:{21:true},workspaceId:'w'}]};
 const button={disabled:false,addEventListener(){}},label={textContent:'',classList:{toggle(){}}};
 let rendered=0,reports=0,fetches=0;
 const ctx={registry:store,token:'test',busy:false,bulkBusy:false,timelineBusy:false,switchingSprint:false,gs40BulkCancelBusy:false,outlookBookingBusy:false,
  sprintDirty:()=>false,projectsDirty:()=>false,diagnostic:()=>{},
  currentSprint:()=>store.sprints[0],assignedItems:[{id:21}],
  document:{hidden:false,querySelectorAll:()=>[],activeElement:null,getElementById:id=>id==='gs46BoardRefresh'?button:id==='gs46BoardFreshness'?label:null,addEventListener:()=>{}},
  refreshSharedRegistryForExecution:async()=>{store.sprints[0]={...store.sprints[0],doneDisplayIds:{21:false}};return store;},
  refreshTrackedWorkItemsQuietly:async()=>{fetches++;return {status:'complete',changed:false};},
  loadAssignedItems:async()=>{throw Error('Membership unchanged')},
  renderBoard:()=>{rendered++;},renderSprintHealth:()=>{reports++;},
  Date,JSON,Number,Set,Map,String,Promise,Error};
 vm.createContext(ctx);vm.runInContext(board,ctx);
 const result=await vm.runInContext('GS46Board.refresh()',ctx);
 assert.equal(result.status,'complete');assert.equal(fetches,1);
 assert.equal(rendered,1,'Board presentation must update when registry changes but ADO revisions do not');
 assert.equal(reports,1,'Report Done/Closed must refresh on Board-only registry changes');
 console.log('PASS: Refresh Board reflects another user’s Done/Closed changes even without native ADO revision changes');
})().catch(e=>{console.error(e);process.exitCode=1;});
