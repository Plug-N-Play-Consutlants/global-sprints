'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('src/app-main.js','utf8');
const extract=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return app.slice(i,j);};
const ctx={Date,Map,Set,Number,Array,Math,String};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/gs43-schedules.js','utf8'),ctx);
const schedule=vm.runInContext('GS43Schedules',ctx);
const sprint2={id:'s2',start:'2026-10-27',end:'2026-11-09'},sprint3={id:'s3',start:'2026-11-10',end:'2026-11-23'};
const oldBooked={id:'repeat',date:'2026-10-28',sprintId:'s2',repeat:'weekly',repeatDays:['Wednesday'],repeatEnd:'2026-12-31',type:'Standup',status:'Scheduled externally',outlook:{state:'booked',eventId:'event',calendarId:'calendar'}};
const ws={id:'ws',meetingSchedules:[{id:'schedule-2',start:'2026-10-27',end:'2026-12-31',lifecycle:'Committed',scope:'sprint',sprintId:'s2',meetings:[oldBooked]}]};
const covering=schedule.planning(sprint3,ws,'2026-11-03');
assert.equal(covering.done,true,'Prior sprint weekly series covers next sprint');
assert.equal(covering.label,'Booked in Outlook');assert.equal(covering.count,1);assert.equal(covering.through,'2026-12-31');
assert.equal(schedule.planning(sprint2,ws,'2026-11-03').done,true,'Original sprint remains covered');
assert.equal(schedule.inSprint({...oldBooked,excludedDates:['2026-11-11','2026-11-18']},sprint3),false,'No coverage when all future sprint occurrences excluded');
assert.equal(schedule.planning(sprint3,{meetingSchedules:[{...ws.meetingSchedules[0],meetings:[{...oldBooked,excludedDates:['2026-11-11','2026-11-18']}]}]},'2026-11-03').done,false);
assert.equal(schedule.view(ws.meetingSchedules[0],'2026-11-03').history,false,'Future recurring meeting remains active across sprint turnover');
assert.equal(schedule.planning({id:'s4',start:'2027-01-01',end:'2027-01-14'},ws,'2026-11-03').done,false,'Coverage does not extend past series end');
console.log('PASS: Previous sprint/project-period Outlook recurrence carries into new sprint only for real, unexcluded dates; no fictitious post-year-end coverage');
// The UI's continuation summary must never touch registry/Outlook, and
// planning a replacement must only prefill the wizard, not stop the old series.
class Node{constructor(tag,cls='',text=''){this.tag=tag;this.className=cls;this.textContent=text;this.children=[];this.attrs={};}append(...items){this.children.push(...items);}setAttribute(k,v){this.attrs[k]=v;}}
const continuity=[];const replacement={scope:{value:'sprint'},start:{value:''},end:{value:''},repeat:{checked:false},repeatEnd:{value:''},assistant:{scrollIntoView(){}}};let updates=0,message='';
const c2={GS43Schedules:schedule,reportNode:(tag,cls,text)=>new Node(tag,cls,text),
 $:key=>({'planScope':replacement.scope,'planStart':replacement.start,'planEnd':replacement.end,'planRepeatSprints':replacement.repeat,'planRepeatEnd':replacement.repeatEnd,'ceremonyAssistant':replacement.assistant})[key],
 prompt:()=> '2026-11-17',currentSprint:()=>sprint3,gs43Today:()=> '2026-11-03',
 syncPlanScope(){updates++;},syncRepeatSprints(){updates++;},showWizardStep(n){assert.equal(n,1);updates++;},
 notify:text=>{message=text},planDate:date=>new Date(date+'T00:00:00Z'),planISO:date=>date.toISOString().slice(0,10),Date,Number,Math,Set,Map,String,Array};
vm.createContext(c2);
vm.runInContext(extract('function gs49RenderScheduleContinuity(', 'function renderWorkspaceSchedules(){'),c2);
vm.runInContext('gs49RenderScheduleContinuity',c2)( {append:x=>continuity.push(x)}, sprint3, ws,'2026-11-03');
assert.equal(continuity.length,1);assert.match(continuity[0].children[1].textContent,/2026-12-31/);
vm.runInContext('gs49PlanReplacement',c2)(ws.meetingSchedules[0]);
assert.equal(replacement.scope.value,'period');assert.equal(replacement.start.value,'2026-11-17');
assert.equal(replacement.end.value,'2026-12-31');assert.equal(replacement.repeat.checked,true);assert.equal(replacement.repeatEnd.value,'2026-12-31');
assert.equal(updates,3);assert.match(message,/Outlook meetings are unchanged/);
assert.equal(ws.meetingSchedules[0].lifecycle,'Committed');assert.equal(oldBooked.outlook.state,'booked');
const scheduling={Date,Math,Number,String,Array};vm.createContext(scheduling);
vm.runInContext(extract('const planDate=(date)=>', 'function gsTimeAfter('),scheduling);
const cycle=vm.runInContext('gsCeremonyCycle',scheduling)('2026-11-17','2026-11-30','2026-12-31',true);
assert(cycle.length>=2&&cycle[0].end>='2026-11-17','Period recurrence derives from new start and cadence, not old sprint end');
console.log('PASS: New sprint sees continuing bookings; replacement planner prefills dates without modifying existing Outlook or registry');
(async()=>{
 const past={id:'past',date:'2026-10-20',status:'Scheduled externally',outlook:{state:'booked',eventId:'historic',calendarId:'calendar'}};
 const futureInternal={id:'new',date:'2026-11-13',status:'Proposed'};
 const old={id:'retire',lifecycle:'Committed',start:'2026-10-13',end:'2026-11-15',meetings:[past,futureInternal]};
 const state={workspaces:[{id:'ws',meetingSchedules:[old]}]};let writes=0,notified='';
 const c={activeScheduleWorkspace:()=>state.workspaces[0],GS43Schedules:schedule,gs43Today:()=> '2026-11-03',Date,
  prompt:()=> 'Project pivot',confirm:()=>true,persist:async fn=>{writes++;fn(state);return true;},
  registry:state,renderWorkspaceSchedules(){},renderCeremonies(){},renderCeremonyInsights(){},renderPlanningSteps(){},
  notify:msg=>{notified=msg},expandedScheduleId:null,Number,String,Array,Set,Map};vm.createContext(c);
 vm.runInContext(extract('async function changeScheduleLifecycle(id,action){','function meetingOccurrencesInMonth('),c);
 await vm.runInContext("changeScheduleLifecycle('retire','retire')",c);
 assert.equal(writes,1);assert.equal(old.lifecycle,'Retired');
 assert.equal(past.status,'Scheduled externally','Never falsely cancel an already-finished Outlook booking');
 assert.equal(past.outlook.state,'booked','Historical Outlook record retained unchanged');
 assert.equal(futureInternal.status,'Cancelled','Unbooked future draft is closed internally');
 const stillBooked={...oldBooked,date:'2026-10-27',repeatDays:['Tuesday'],repeatEnd:'2026-12-31'};
 const protectedSchedule={id:'protect',lifecycle:'Committed',meetings:[stillBooked]};state.workspaces[0].meetingSchedules.push(protectedSchedule);
 await vm.runInContext("changeScheduleLifecycle('protect','retire')",c);
 assert.equal(writes,1,'An active recurring Outlook series must never be retired without explicit cancellation');
 assert.equal(protectedSchedule.lifecycle,'Committed');assert.match(notified,/Cancel or reconcile/);
 console.log('PASS: historical bookings survive schedule retirement; future internal proposals are cancelled; active recurring Outlook series blocks destructive retirement');
})().catch(e=>{console.error(e);process.exitCode=1;});
