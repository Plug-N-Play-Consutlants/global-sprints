'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('src/app-main.js','utf8');
const core=require('./src/gs40-core.js');
const pick=(start,end)=>{const i=app.indexOf(start),j=app.indexOf(end,i+start.length);assert(i>=0&&j>i,`${start} extraction anchor`);return app.slice(i,j);};
const native=new Map([[1,'Closed'],[2,'Closed'],[3,'Done'],[4,'Closed'],[5,'Done'],[6,'In Progress']]);
const sprint={id:'s2',name:'Sprint 2',start:'2026-10-27',end:'2026-11-09',workspaceId:'ws',itemIds:[1,2,3,4,5,6],doneDisplayIds:{1:true,5:false}};
const ctx={
 currentSprint:()=>sprint,workflowColumn:w=>native.get(w.id)||'Other',
 GS40Core:core,Map,Set,Number,JSON,Date,String,Math,Error,Array,
 isRemoved:()=>false,
};
vm.createContext(ctx);
vm.runInContext(pick('function boardColumn(w){','async function setDoneDisplay('),ctx);
vm.runInContext(pick('const reportIsClosed=w=>','const reportWork='),ctx);
const work=[
 {id:1,project:'P',type:'User Story',state:'Completed',effort:5}, // native terminal, held in Board Done
 {id:2,project:'P',type:'User Story',state:'Completed',effort:3}, // actually accepted
 {id:3,project:'P',type:'User Story',state:'Resolved',effort:2}, // category resolved
 {id:4,project:'P',type:'User Story',state:'Done',effort:1}, // ADO Done configured as Completed, Board Done
 {id:5,project:'P',type:'User Story',state:'Resolved',effort:1}, // explicitly accepted on Board
 {id:6,project:'P',type:'Task',state:'Active',effort:null},
];
const reportIsClosed=vm.runInContext('reportIsClosed',ctx),reportIsDone=vm.runInContext('reportIsDone',ctx);
assert.deepEqual(work.filter(reportIsDone).map(w=>w.id),[1,3,4],'Board Done maps into awaiting validation despite native ADO completed');
assert.deepEqual(work.filter(reportIsClosed).map(w=>w.id),[2,5],'only accepted Board Closed counts as accepted');
assert.equal(work.filter(w=>!reportIsClosed(w)&&!reportIsDone(w)).length,1);
console.log('PASS: native Completed held in GS Done appears in Awaiting validation, not Accepted; explicit acceptance and cross-process Resolved remain accurate');

vm.runInContext(pick('function reportCompletedState(w){','function reportEstimate(w){'),ctx);
vm.runInContext(pick('function observationItems(s,found){','async function autoReportObservation('),ctx);
const observationItems=vm.runInContext('observationItems',ctx),fingerprint=vm.runInContext('observationFingerprint',ctx);
const recorded=observationItems(sprint,work);
assert.equal(recorded.length,6);
assert.equal(recorded[0].completionCategory,'Closed');assert.equal(recorded[0].deliveryCategory,'Done');
assert.equal(recorded[1].deliveryCategory,'Closed');
assert.equal(recorded[3].deliveryCategory,'Done');
assert.equal(recorded[4].deliveryCategory,'Closed');
const oldFingerprint=fingerprint(recorded);
sprint.doneDisplayIds[1]=false;
const after=observationItems(sprint,work);
assert.notEqual(fingerprint(after),oldFingerprint,'Board-only acceptance must trigger a new report observation without an ADO state change');
assert.equal(recorded[0].deliveryCategory,'Done','older saved snapshot immutable');
const completed=vm.runInContext('reportCompletedState',ctx);
assert.equal(completed(recorded[0]),true);
assert.equal(completed({id:1,state:'Completed',completionCategory:'Closed',deliveryCategory:'In Progress'}),false,'new snapshots use recorded Board delivery stage');
assert.equal(completed({id:1,state:'Completed',completionCategory:'Closed'}),true,'legacy snapshots preserve their recorded native category');
assert.equal(core.progress(recorded,recorded,completed).total,12);
assert.equal(core.progress(recorded,recorded,completed).completed,12,'Done and Closed both deliver effort once without mutating records');
sprint.doneDisplayIds[1]=true;
console.log('PASS: observation includes Board stage, category-only changes are captured, historical snapshots remain immutable and legacy state fallback works');

// Use actual report dashboard to establish that the metric, team and project
// classifications are sourced from the same Board-aware predicates.
class Node{constructor(tag,cl='',text=''){this.tag=tag;this.className=cl;this.textContent=String(text);this.children=[];this.style={};this.attrs={};this.innerHTML='';}
 append(...c){this.children.push(...c);return this;}replaceChildren(...c){this.children=c;}setAttribute(k,v){this.attrs[k]=v;}}
const metricCalls=[];
Object.assign(ctx,{
 $:name=>name==='reportDashboard'?ctx.dashboard:null,
 dashboard:new Node('div'),reportNode:(t,c,v)=>new Node(t,c,v),reportMetric:(p,l,v)=>{metricCalls.push([l,v]);},
 reportWork:()=>work,reportFiltered:()=>work,reportCoverage:()=>({assigned:6,executable:[1,2,3,4,5,6],context:[],missing:[]}),
 reportToday:()=> '2026-11-03',reportSafeDate:()=>false,
 sprintHealthData:()=>({label:'On track',reason:'synthetic regression'}),
 reportWorkItemList:()=>{},reportVisualBars:()=>{},reportWorkItemLink:()=>new Node('a'),
 gs40RenderReportDrilldown:()=>{},renderVelocityBurndown:()=>{},
});
vm.runInContext(pick('function renderReportDashboard(){','function reportCompletedState(w){'),ctx);
vm.runInContext('renderReportDashboard()',ctx);
const metrics=Object.fromEntries(metricCalls);
assert.equal(metrics['Done / Closed'],5);
assert.equal(metrics['Awaiting validation'],3);
assert.equal(metrics['Accepted / Closed'],2);
assert.equal(metrics['Active or New'],1);
assert.equal(metrics['Not loaded'],0);
console.log('PASS: actual Reports dashboard counts 3 awaiting validation, 2 accepted and 1 active; no UI display of zero for held Completed work');

// Integration of historical velocity: latest recorded membership must contribute
// without rewriting the initial baseline or falsely presenting a last capture
// as a final result. Filter for snapshots BEFORE applying the eight-sprint cap.
const old={at:'2026-10-29T00:00:00Z',items:[{id:2,type:'User Story',state:'Active',effort:3,completionCategory:'In Progress'}]};
const latest={at:'2026-10-29T09:00:00Z',items:[
 {id:2,type:'User Story',state:'Completed',effort:3,completionCategory:'Closed'},
 {id:1,type:'User Story',state:'Completed',effort:5,completionCategory:'Closed',deliveryCategory:'Done'},
]};
const first={id:'old',name:'Older sprint with data',start:'2026-09-01',end:'2026-09-14',snapshots:[old,latest]};
const emptySprints=Array.from({length:10},(_,i)=>({id:'empty'+i,name:'empty '+i,start:`2026-08-${String(i+1).padStart(2,'0')}`,end:'2026-08-27',snapshots:[]}));
const observedSprint={...sprint,snapshots:[old,latest]};
const resultVelocity=[];
const velocityHost=new Node('div'),burndownHost=new Node('div');
Object.assign(ctx,{
 $:name=>name==='reportVelocity'?velocityHost:name==='reportBurndown'?burndownHost:ctx.dashboard,
 currentSprint:()=>observedSprint,workspaceSprints:()=>[first,...emptySprints,observedSprint],
 reportSnapshotTimestamp:v=>typeof v==='string'&&!Number.isNaN(Date.parse(v))?new Date(v).toISOString():'',
 reportVelocityChart:(_host,rows)=>resultVelocity.push(...rows),
 reportBurndownProgress:()=>{},reportEmptyChart:()=>{},
 reportWork:()=>work,reportCoverage:()=>({assigned:6,missing:[]}),
 reportToday:()=> '2026-11-03',reportSafeDate:v=>/^2026-0[89]-\d{2}$/.test(v),reportObservationDay:at=>String(at).slice(0,10),
 document:{createElementNS(){throw Error('No SVG needed with one dated observation day');}},
});
vm.runInContext(pick('function reportEstimate(w){','async function captureReportObservation('),ctx);
vm.runInContext('renderVelocityBurndown()',ctx);
assert.equal(resultVelocity.length,8,'historical domain has eight past sprints, including explicit missing-data gaps');
assert.equal(resultVelocity.filter(row=>row.value===8).length,1,'latest saved scope includes a 5-point item added after earliest baseline');
assert.equal(resultVelocity.filter(row=>row.value===null).length,7,'missing sprints are not misrepresented as zero velocity');
assert.equal(first.snapshots[0].items.length,1,'first historical baseline not modified');
assert.equal(first.snapshots[1].items.length,2,'latest observation remains intact');
console.log('PASS: Velocity charts past sprints only, preserves explicit historical gaps and latest scope without modifying history');

const html=fs.readFileSync('index.html','utf8');
assert.match(html,/class="gs-green-cta" id="gs46BoardRefresh"/);
assert.match(html,/#gs46BoardRefresh\.gs-green-cta\{background:#237b42/);
assert.equal(html.match(/id="gs46BoardRefresh"/g).length,1);
console.log('PASS: Refresh Board has visible, single green action with existing hover/focus controls');
