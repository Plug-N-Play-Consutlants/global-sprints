'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const GS40Core=require('./src/gs40-core.js');
const src=fs.readFileSync('src/gs40-runtime.js','utf8');
const src41=fs.readFileSync('src/gs41-runtime.js','utf8');
const executable=src.slice(0,src.lastIndexOf("$('gs40RetroSave')?.addEventListener"));
const notices=[],persistCalls=[],requests=[];
let confirmResult=true;
const registry={workspaces:[{id:'w',name:'Demo',projectIds:['pa'],meetingSchedules:[]}],sprints:[{id:'s1',workspaceId:'w',name:'Sprint 1',start:'2026-10-26',end:'2026-11-06',status:'Active',itemIds:[]},{id:'s2',workspaceId:'w',name:'Sprint 2',start:'2026-11-09',end:'2026-11-20',status:'Active',itemIds:[]}]};
const records={
 100:{id:100,fields:{'System.TeamProject':'Project A','System.Title':'Story','System.WorkItemType':'User Story','System.State':'Active','System.IterationPath':'A\\Sprint 1'},relations:[{rel:'System.LinkTypes.Hierarchy-Forward',url:'https://example/wit/101'},{rel:'System.LinkTypes.Hierarchy-Forward',url:'https://example/wit/102'}]},
 101:{id:101,fields:{'System.TeamProject':'Project A','System.Title':'Task','System.WorkItemType':'Task','System.State':'Active','System.IterationPath':'A\\Sprint 1'},relations:[{rel:'System.LinkTypes.Hierarchy-Reverse',url:'https://example/wit/100'}]},
 102:{id:102,fields:{'System.TeamProject':'Project A','System.Title':'Elsewhere','System.WorkItemType':'Task','System.State':'Active','System.IterationPath':'A\\Sprint 2'},relations:[{rel:'System.LinkTypes.Hierarchy-Reverse',url:'https://example/wit/100'}]},
};
const C={console,Date,Map,Set,JSON,Promise,Error,Number,String,Math,RegExp,crypto:{randomUUID:()=> 'uuid'},GS40Core,
 registry,projects:[{id:'pa',name:'Project A'}],bulkBusy:false,workspaceProjectIds:()=>['pa'],
 api:async(url)=>{requests.push(url);const id=Number(url.match(/workitems\/(\d+)/)?.[1]);if(!records[id])throw Error('Missing test WIT');return records[id];},
 normalizeItem:x=>({id:x.id,parentId:null,title:x.fields['System.Title'],type:x.fields['System.WorkItemType'],project:x.fields['System.TeamProject'],state:x.fields['System.State'],iterationPath:x.fields['System.IterationPath']}),
 currentSprint:()=>registry.sprints[0],guardSprint:async()=>true,updateBulkToolbar:()=>{},
 persist:async(fn)=>{persistCalls.push(true);fn(registry);return true;},
 browserItems:[],browserSelection:new Set(),loadAssignedItems:async()=>({status:'complete'}),renderBrowser:()=>{},renderBacklog:()=>{},renderSuggestions:()=>{},renderBoard:()=>{},
 notify:(msg,error)=>notices.push({msg,error}),confirm:()=>confirmResult,
 activeScheduleWorkspace:()=>registry.workspaces[0],activeWorkspace:()=>registry.workspaces[0],
 renderWorkspaceSchedules:()=>{},renderCeremonies:()=>{},diagnostic:()=>{},
 outlookCancelCeremony:async(id,scheduleId,options)=>{const m=registry.workspaces[0].meetingSchedules.find(s=>s.id===scheduleId).meetings.find(m=>m.id===id);if(!options.bulk)throw Error('not bulk');m.outlook.state='cancelled';m.status='Cancelled';return true;},
 outlookTarget:(r,id,sid,wid)=>r.workspaces.find(w=>w.id===wid).meetingSchedules.find(s=>s.id===sid).meetings.find(m=>m.id===id),
 currentSprint:()=>registry.sprints[0],
 DEFAULT_WORKSPACE_ID:'default',activeWorkspaceId:'w',renderWorkspacePicker:()=>{},syncWorkspaceProjects:()=>{},renderSprintPicker:()=>{},clearWorkspaceViews:()=>{},rememberContext:()=>{},
 $:id=>({addEventListener(){},value:''}),
};
vm.createContext(C);vm.runInContext(fs.readFileSync('src/gs43-schedules.js','utf8'),C);vm.runInContext('const gs43Today=()=>"2026-10-27";',C);vm.runInContext(executable,C);vm.runInContext(src41,C);
(async()=>{
  const fetch=vm.runInContext('gs40FetchPackage',C);
  const pack=await fetch(100);
  const plan=vm.runInContext('gs41SelectionPlan',C)(pack,registry.sprints[0]);
  assert.deepEqual(Array.from(plan.map(x=>x.selected)),[true,true,false],'cross-iteration task is shown but unchecked');
  const add=vm.runInContext('gs41CommitWorkPackage',C);
  await add(pack,new Set([100,101]),'s1');
  assert.deepEqual(Array.from(registry.sprints[0].itemIds),[100,101],'include story and same-iteration child');
  assert.deepEqual(requests.map(x=>Number(x.match(/workitems\/(\d+)/)[1])),[100,101,102]);
  assert.equal(notices.at(-1)?.error,undefined);
  await add(pack,new Set([101]),'s1');assert.deepEqual(Array.from(registry.sprints[0].itemIds),[100,101],'idempotent group add');
  console.log('PASS: REST hierarchy traversal, cross-iteration exclusion, atomic add, idempotency');
  registry.workspaces[0].meetingSchedules=[{id:'sched',lifecycle:'Committed',name:'Scheduled',meetings:[
    {id:'a',date:'2026-10-28',sprintId:'s1',title:'Standup',outlook:{state:'booked'}},
    {id:'b',date:'2026-11-12',sprintId:'s2',title:'Second sprint',outlook:{state:'booked'}},
    {id:'c',date:'2026-10-29',sprintId:'s1',title:'Unbooked',status:'Proposed'}
  ]}];
  const clear=vm.runInContext('gs40ClearSprintMeetings',C);
  await clear();
  const meetings=registry.workspaces[0].meetingSchedules[0].meetings;
  assert.equal(meetings[0].outlook.state,'cancelled');assert.equal(meetings[1].outlook.state,'booked');assert.equal(meetings[2].status,'Cancelled');
  console.log('PASS: sprint-level cancellation does not touch another sprint in the same schedule');
  registry.workspaces[0].meetingSchedules[0].meetings.push({id:'series',date:'2026-10-30',sprintId:'s1',repeatEnd:'2026-11-18',title:'Cross-sprint recurring',outlook:{state:'booked'}});
  const length=persistCalls.length;await clear();assert.equal(persistCalls.length,length);assert.equal(meetings.at(-1).outlook.state,'booked');
  console.log('PASS: cross-sprint recurrence blocks unsafe mass cancellation');
  registry.workspaces[0].meetingSchedules[0].meetings.pop();
  const close=vm.runInContext('gs40CloseWorkspace',C);
  meetings[1].outlook.state='cancel-pending';
  await close();assert.notEqual(registry.workspaces[0].archived,true,'unresolved meeting must prevent closeout');
  console.log('PASS: closeout remains active on unresolved meeting');
  meetings[1].outlook.state='booked';await close();
  assert.equal(registry.workspaces[0].archived,true);assert.equal(meetings[1].outlook.state,'cancelled');
  console.log('PASS: successful closeout cancels remaining Outlook meetings and archives history');
})().catch(e=>{console.error(e);process.exitCode=1});
