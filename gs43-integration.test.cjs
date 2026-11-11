'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('src/app-main.js','utf8');
const read=(a,b)=>{const from=src.indexOf(a),to=src.indexOf(b,from+a.length);assert.ok(from>=0&&to>from,`extract ${a}`);return src.slice(from,to)};
const elements={};
function el(tag='div'){
 return {tagName:tag,id:'',className:'',textContent:'',children:[],open:false,disabled:false,dataset:{},style:{},
  classList:{toggle(){},add(){},remove(){}},replaceChildren(...nodes){this.children=nodes},append(...nodes){this.children.push(...nodes)},addEventListener(){},setAttribute(){},scrollIntoView(){},focus(){}};
}
const schedulePanel=el(),count=el(),steps=el(),guide=el(),content=el(),dismiss=el(),restore=el();
content.classList=guide.classList;dismiss.classList=guide.classList;restore.classList=guide.classList;
Object.assign(elements,{workspaceSchedules:schedulePanel,gs42SavedSchedulesSummary:count,planningSteps:steps,guidancePanel:guide,guidanceContent:content,guidanceDismiss:dismiss,guidanceRestore:restore,goal:{value:'Goal'},start:{value:'2026-10-27'},end:{value:'2026-11-09'},capture:el(),ceremonyAssistant:el(),gs42SavedSchedulesDisclosure:el()});
const pastMeetings=Array.from({length:10},(_,i)=>({id:'old'+i,date:'2026-10-'+String(13+i).padStart(2,'0'),time:'09:00',title:'Standup',status:'Proposed',outlook:{state:'booked',eventId:'ev'+i,calendarId:'cal'}}));
const upcomingMeetings=Array.from({length:4},(_,i)=>({id:'up'+i,date:'2026-10-'+String(29+i).padStart(2,'0'),time:'09:00',title:'Planning',status:'Proposed',sprintId:'current',outlook:{state:'booked',eventId:'cur'+i,calendarId:'cal'}}));
const registry={workspaces:[{id:'workspace',meetingSchedules:[{id:'old',name:'Old schedule',lifecycle:'Draft',start:'2026-10-13',end:'2026-10-26',meetings:pastMeetings},{id:'current',name:'Current schedule',lifecycle:'Committed',start:'2026-10-27',end:'2026-11-09',meetings:upcomingMeetings}]}]};
const sprint={id:'current',name:'Current sprint',start:'2026-10-27',end:'2026-11-09',itemIds:[1],snapshots:[{date:'2026-10-27'}],ceremonies:[]};
const context={Date,Set,Map,Number,String,JSON,window:{gs43HistoryExpanded:false},document:{createElement:el,createTextNode:text=>({textContent:text}),querySelector(){return null}},$:(id)=>elements[id]||null,registry,expandedScheduleId:null,calendarScheduleId:null,bulkOutlookBooking:false,gs40BulkCancelBusy:false,activeScheduleWorkspace:()=>registry.workspaces[0],currentSprint:()=>sprint,gs43Today:()=> '2026-10-28',renderFinalSprintScheduleWarning:()=>{},gs49RenderScheduleContinuity:()=>{},localStorage:{getItem:()=>null},guidancePreferenceKey:()=> 'test',renderMeetingCalendar:()=>{},reportNode:(tag,cls)=>el(tag),notify:()=>{},bookScheduleMeetings:()=>{},changeScheduleLifecycle:()=>{},extendWorkspaceSchedule:()=>{},editCeremony:()=>{},deleteCeremony:()=>{},scheduleCeremonyInOutlook:()=>{},outlookCancelCeremony:()=>{},outlookReconcile:()=>{},gs40ClearSchedule:()=>{},renderPlanningSteps:()=>{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/gs43-schedules.js','utf8'),context);
// Instantiate actual renderer; no ADO or Graph mutations are allowed by this harness.
vm.runInContext(read('function renderWorkspaceSchedules(){','async function changeScheduleLifecycle('),context);
vm.runInContext('renderWorkspaceSchedules()',context);
assert.match(count.textContent,/1 active · 1 committed · 1 historical · 4 active Outlook bookings/);
const currentCard=schedulePanel.children.find(x=>x.children?.some(y=>y.textContent==='Current schedule'));
assert.ok(currentCard,'current schedule remains in active list');
assert.ok(currentCard.children.some(x=>x.children?.some(y=>y.textContent==='End schedule…')),'committed schedule has End action');
const archived=schedulePanel.children.find(x=>x.id==='gs43ScheduleHistory');assert.ok(archived,'History grouping exists');
assert.equal(archived.open,false,'History collapsed by default');
const historicCard=archived.children.find(x=>x.tagName==='div')?.children[0];assert.ok(historicCard,'past schedule preserved in history');
assert.ok(historicCard.children.some(x=>String(x.textContent).includes('Completed')),'past booked draft is presented as Completed');
assert.equal(historicCard.children.some(x=>x.children?.some(y=>y.textContent==='Discard draft')),false,'no historical discard');
assert.equal(historicCard.children.some(x=>x.children?.some(y=>y.textContent==='Book all in Outlook')),false,'no historical booking control');
// The planning guidance uses the same workspace schedule store as the renderer.
const C={...context,renderPlanningSteps:undefined};vm.createContext(C);vm.runInContext(fs.readFileSync('src/gs43-schedules.js','utf8'),C);
vm.runInContext(read('function renderPlanningSteps(){',"$('guidanceDismiss').addEventListener"),C);
vm.runInContext('renderPlanningSteps()',C);
const ceremony=steps.children.find(x=>x.children?.some(y=>String(y.textContent).includes('Plan sprint ceremonies')));
assert.ok(ceremony,'ceremony checklist entry exists');
assert.match(ceremony.children[0].textContent,/✓ Done: Plan sprint ceremonies/);
assert.ok(ceremony.children.some(x=>x.textContent==='View schedule'),'link opens saved schedule instead of returning to wizard');
console.log('PASS: v1.0.43 real schedule renderer, active/history counts, completed historical booked draft, actions and planning guidance');
