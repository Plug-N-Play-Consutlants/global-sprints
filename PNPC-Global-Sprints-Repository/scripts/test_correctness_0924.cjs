const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('extension/app.js','utf8');
function take(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`Missing ${start}`);return source.slice(a,b);}
function run(code,context){vm.createContext(context);vm.runInContext(code,context);return context;}
(async()=>{
 // Cache round trip uses normalized field names and rejects unbounded trial fallback.
 const c={ALLOWED:new Set(['licensed','trial_active','trial_expired','unlicensed','expired','suspended','revoked']),Date};
 run(take('function normalizeRoomResponse(','async function roomRequest(')+take('function normalizeCachedRoomDecision(','function roomRestoreVerified('),c);
 const decision=c.normalizeRoomResponse({status:'trial_active',allowed:true,expires_at:'2026-10-17T00:00:00Z'});
 assert.equal(c.normalizeCachedRoomDecision(JSON.parse(JSON.stringify(decision))).expiresAt,decision.expiresAt);
 assert.throws(()=>c.normalizeCachedRoomDecision({status:'trial_active',allowed:true,expiresAt:null}));
 console.log('PASS: verified licensing expiry survives cache round-trip');
 // Scoped ADO state metadata cannot move Closed into Done.
 const w={project:'P',type:'Task',state:'Closed'};
 const wf={workflowCategories:new Map(),workflowStates:new Map(),WORKFLOW_MAP:{closed:'Closed',done:'Done',completed:'Done',new:'To Do'},diagnostic(){},api:async()=>({value:[{name:'Closed',category:'Completed'},{name:'Ready for Acceptance',category:'Resolved'}]})};
 run(take('function workflowKey(','function assignedSelection('),wf);
 assert.equal(wf.workflowCategory(w),'Closed');await wf.getStates(w);assert.equal(wf.workflowCategory(w),'Closed');
 assert.equal(wf.workflowCategory({...w,state:'Ready for Acceptance'}),'Done');
 console.log('PASS: workflow metadata preserves Closed lane and recognizes custom Done');
 // Historical reports and sprint health share completion policy.
 const rep={workflowColumn:x=>wf.workflowCategory(x),isPlanningContextType:x=>x.type==='Feature',isRemoved:x=>x.state==='Removed'};
 run(take('function reportCompletedState(','function renderVelocityBurndown('),rep);
 const sample=[{id:1,...w,effort:1},{id:2,project:'P',type:'Task',state:'New',effort:1},{id:3,project:'P',type:'Task',state:'New',storyPoints:1},{id:4,project:'P',type:'Task',state:'New',effort:2},{id:5,project:'P',type:'Task',state:'New',effort:5}];
 const result=rep.reportCommittedProgress(sample,sample);assert.deepEqual(JSON.parse(JSON.stringify(result)),{total:10,completed:1,remaining:9,completedItems:1,totalItems:5});
 assert.equal(rep.reportCompletedState({project:'P',type:'Task',state:'Ready for Acceptance',effort:5}),true);
 console.log('PASS: custom Done and 10-point sprint completion calculations');
 // Reports must never announce success after a failed work item load.
 const messages=[];const r={registry:{sprints:[{id:'s',itemIds:[1]}]},assignedLoadSequence:0,assignedItems:[],ancestorItems:[],Set,Map,console,JSON,$:()=>({value:'s'}),currentSprint:()=>({id:'s',itemIds:[1]}),sprintDirty:()=>false,projectsDirty:()=>false,refreshSharedRegistryForExecution:async()=>{},api:async()=>{throw Error('HTTP 503')},diagnostic(){},notify:(m)=>messages.push(m),renderGuidance(){},renderBoard(){},renderSprintHealth(){},renderTimeline(){},renderPmAssistance(){}};
 run(take('async function loadAssignedItems(){','// Parent-child relations')+take('async function reportRefresh(){',"$('reportRefresh')"),r);
 await r.reportRefresh();assert(messages.some(m=>m.includes('Report refresh failed')));assert(!messages.some(m=>m.startsWith('Reports refreshed')));
 console.log('PASS: failed report refresh is never announced as successful');
 // Cancelled Outlook events do not block retirement; booked events do.
 const sc={id:'schedule',lifecycle:'Committed',meetings:[{id:'m',status:'Cancelled',outlook:{state:'cancelled'}}]};
 const t={activeScheduleWorkspace:()=>({id:'w',meetingSchedules:[sc]}),notify:(m)=>messages.push(m),prompt:()=>null,confirm:()=>false};
 run(take('async function changeScheduleLifecycle(','function renderMeetingCalendar('),t);
 const before=messages.length;await t.changeScheduleLifecycle('schedule','retire');assert.equal(messages.length,before);
 sc.meetings[0].outlook.state='booked';await t.changeScheduleLifecycle('schedule','retire');assert(messages.at(-1).includes('Cancel or reconcile'));
 console.log('PASS: cancelled meetings permit retirement; booked meetings block it');
 // Startup never renders tabs during module evaluation; all declarations precede init invocation.
 assert(source.indexOf('let referenceCalendarMonth=')<source.lastIndexOf('\ninit();'));
 assert(source.indexOf('const reportWork=')<source.lastIndexOf('\ninit();'));
 const early=source.slice(source.indexOf('function activateTab('),source.indexOf('let referenceCalendarMonth='));
 assert(!/\nshowTab\(/.test(early),'Premature startup showTab call remains');
 assert(source.includes('const startupNavigationGeneration=navigationGeneration;'));
 assert(source.includes('navigationGeneration!==startupNavigationGeneration?requestedTab'));
 console.log('PASS: startup rendering deferred and user-navigation generation guarded');
 // Source guard and mutation-time guard must both protect linked Outlook events.
 assert(source.includes("const linked=(s.ceremonies||[]).filter(m=>m.outlook?.state&&m.outlook.state!=='cancelled')"));
 assert(source.includes("if((latest.ceremonies||[]).some(m=>m.outlook?.state&&m.outlook.state!=='cancelled'))"));
 console.log('PASS: sprint deletion includes preflight and transactional Outlook safeguards');
})().catch(e=>{console.error(e);process.exitCode=1});
