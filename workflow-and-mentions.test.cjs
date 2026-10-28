const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
function part(begin,end){const from=source.indexOf(begin);assert(from>=0,begin);const to=source.indexOf(end,from);assert(to>=0,end);return source.slice(from,to);}
const workflow=part('function workflowKey(w){','function assignedSelection(){')+part('const WORKFLOW_COLUMNS=', 'function compactMode(){')+part('function stateCandidates(w,column,states){','const isPlanningContextType=');
const drop=part('async function dropOnCell(id,column,lane,cell){','function updateKanbanScrollControls(){');
const mention=part('const MENTION_ID_RE=', '// Local UI preferences');
const TYPES=[
 {name:'Scrum terminal Completed',states:[{name:'New',category:'proposed'},{name:'In Progress',category:'inProgress'},{name:'Completed',category:'completed'}]},
 {name:'Resolved and Completed',states:[{name:'New',category:'proposed'},{name:'Active',category:'inProgress'},{name:'Resolved',category:'resolved'},{name:'Completed',category:'completed'}]},
 {name:'Done and Closed',states:[{name:'New',category:'proposed'},{name:'Active',category:'inProgress'},{name:'Done',category:'completed'},{name:'Closed',category:'completed'}]},
 {name:'Terminal Closed only',states:[{name:'New',category:'proposed'},{name:'Active',category:'inProgress'},{name:'Closed',category:'completed'}]}
];
const C={assert,console,Map,Set,Error,Promise,encodeURIComponent,diagnostic:()=>{},workflowStates:new Map(),workflowCategories:new Map(),workflowNativeTerminal:new Map(),workflowStateDetails:new Map(),WORKFLOW_MAP:{},renderBacklog:()=>{},renderBoard:()=>{},notify:()=>{},saveLanes:async()=>true};
vm.createContext(C);vm.runInContext(workflow,C);vm.runInContext(drop,C);
const get=vm.runInContext('getStates',C),destination=vm.runInContext('destinationState',C),board=vm.runInContext('boardColumn',C),dropOn=vm.runInContext('dropOnCell',C);
const log=[];let item,display,states;
C.api=async()=>({value:states});
C.currentSprint=()=>({id:'sprint',doneDisplayIds:display});
C.assignedSelection=()=>[item];
C.laneFor=()=> 'Default';
C.setDoneDisplay=async(w,flag)=>{log.push('board:'+flag);if(flag===null)delete display[w.id];else display[w.id]=flag;return true;};
C.updateWorkItemState=async(w,next)=>{log.push('ado:'+next);w.state=next;return true;};
const cell={classList:{add:()=>{},remove:()=>{}}};
(async()=>{
 for(const type of TYPES){
  item={id:825,project:'Project',type:type.name,state:type.states[1].name};display={};states=type.states;
  await get(item);log.length=0;
  const end=await destination(item,'Done');
  await dropOn(825,'Done','Default',cell);
  assert.strictEqual(item.state,end,type.name+' ADO update');
  assert.strictEqual(board(item),'Done',type.name+' Board Done');
  if(type.name==='Scrum terminal Completed'){
   assert.deepEqual(log,['board:true','ado:Completed'],'Board override MUST be saved first');
   assert.strictEqual(C.workflowNativeTerminal.get('Project::'+type.name).has('completed'),true);
   assert.strictEqual(vm.runInContext('workflowColumn',C)(item),'Closed','Native Completed still terminal');
   // Simulate reloading work item and sprint from ADO + extension-data storage.
   const reloaded={...item}; assert.strictEqual(board(reloaded),'Done','refresh retains Done override');
   await dropOn(825,'Closed','Default',cell);
   assert.strictEqual(board(item),'Closed','explicit final placement');
   assert.strictEqual(item.state,'Completed','no artificial second ADO state');
   await dropOn(825,'Done','Default',cell);
   assert.strictEqual(board(item),'Done','can move final work back to Done');
   await dropOn(825,'In Progress','Default',cell);
   assert.strictEqual(item.state,'In Progress');
   assert.strictEqual(board(item),'In Progress');
   assert.strictEqual(display[825],undefined,'override cleared on reopening');
  }
  console.log('PASS: '+type.name);
 }
 // ADO failure after persisted display override must restore prior Board display.
 item={id:827,project:'Project',type:'Scrum terminal Completed',state:'In Progress'};
 display={};states=TYPES[0].states;log.length=0;
 C.updateWorkItemState=async()=>false;
 await dropOn(827,'Done','Default',cell);
 assert.strictEqual(item.state,'In Progress');assert.strictEqual(board(item),'In Progress');
 assert.deepEqual(log,['board:true','board:null']);
 console.log('PASS: failed ADO state change rolls back Board placement');
 // Mention lookups must reach the host SDK service without a network call.
 let networkCalls=0;
 const sdk={getService:async(id)=>{assert.strictEqual(id,'ms.vss-features.identity-service');return{searchIdentitiesAsync:async(q,types,scopes)=>{assert.deepEqual(Array.from(types),['user']);return [{entityId:'81fa6389-0872-6fdd-a451-7ba7880f566a',displayName:'Wendy Potter',mailAddress:'wendy@example.com'}];}};}};
 const M={console,Map,Set,Error,Promise,encodeURIComponent,URL,Date,sdk,items:[],assignedItems:[],ancestorItems:[],browserItems:[],nearbyResults:[],diagnostic:()=>{},api:async()=>{networkCalls++;throw Error('Failed to fetch');}};
 vm.createContext(M);vm.runInContext(mention,M);
 const users=await vm.runInContext('searchMentionIdentities',M)('Wendy');
 assert.strictEqual(users.length,1);assert.strictEqual(users[0].name,'Wendy Potter');assert.strictEqual(networkCalls,0);
 assert.strictEqual(users[0].id,'81fa6389-0872-6fdd-a451-7ba7880f566a');
 console.log('PASS: host identity service works even when browser fetch fails');
 assert(source.includes('data-vss-mention="version:2.0,${identity.id}"'),'Mention HTML markup preserved');
 assert(source.includes("const DIAG_VERSION='1.0.39'"));
 assert(!source.includes('has no native Done / Resolved state. Move it'));
 console.log('PASS: markup, removed warning and runtime version');
})().catch(e=>{console.error(e);process.exitCode=1;});
