'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app-main.js','utf8'),html=fs.readFileSync('index.html','utf8');
const core=require('./src/gs40-core.js');
function pick(a,b){const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i,`Missing ${a}`);return source.slice(i,j);}
const work=Array.from({length:41},(_,i)=>({id:i+1,project:'Portfolio',type:i>=23&&i<25?'Bug':'User Story',state:i<23?'Completed':'Active',effort:1,assignee:'PM'}));
const sprint={id:'s2',name:'Sprint 2',start:'2026-10-27',end:'2026-11-09',workspaceId:'ws',itemIds:work.map(w=>w.id),doneDisplayIds:Object.fromEntries(work.slice(0,23).map(w=>[w.id,true])),snapshots:[{at:'2026-11-01T12:00:00Z',items:[{id:25,type:'User Story',effort:1,completionCategory:'Done',deliveryCategory:'Done'}]}],blockedItems:{}};
class Node{constructor(tag,cl='',value=''){this.tag=tag;this.className=cl;this.textContent=String(value);this.children=[];this.style={};this.attrs={};this.innerHTML='';}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(k,v){this.attrs[k]=String(v);}}
const dashboard=new Node('div'),metrics=[];
const ctx={currentSprint:()=>sprint,GS40Core:core,workflowColumn:w=>w.state==='Completed'?'Closed':'In Progress',
 $:id=>id==='reportDashboard'?dashboard:null,
 reportNode:(tag,cl,val)=>new Node(tag,cl,val),reportMetric:(_p,label,value)=>{metrics.push([label,value]);},
 reportWork:()=>work,reportFiltered:()=>work,reportCoverage:()=>({assigned:41,executable:work,context:[],missing:[]}),
 reportWorkItemList:()=>{},reportVisualBars:()=>{},reportWorkItemLink:()=>new Node('button'),gs40RenderReportDrilldown:()=>{},renderVelocityBurndown:()=>{},
 isPlanningContextType:()=>false,items:work,assignedItems:[],reportToday:()=> '2026-11-03',
 reportSafeDate:v=>/^\d{4}-\d\d-\d\d$/.test(v),reportDate:v=>String(v||'').slice(0,10),planDate:v=>new Date(v+'T12:00:00Z'),
 Number,Array,Map,Set,Math,Date,String,JSON,Error,document:{createElement(){return new Node('div');}}};
vm.createContext(ctx);
vm.runInContext(pick('function boardColumn(w){','async function setDoneDisplay('),ctx);
vm.runInContext(pick('const reportIsClosed=w=>','const reportWork='),ctx);
vm.runInContext(pick('function sprintHealthData(){','function renderSprintHealth(){'),ctx);
vm.runInContext(pick('function reportCompletedState(w){','function reportEstimate(w){'),ctx);
vm.runInContext(pick('function renderReportDashboard(){','function reportCompletedState(w){'),ctx);
vm.runInContext('renderReportDashboard()',ctx);
const actual=Object.fromEntries(metrics);
assert.equal(actual['Done / Closed'],23);assert.equal(actual['Active or New'],18);
assert.equal(actual['Awaiting validation'],23);assert.equal(actual['Accepted / Closed'],0);
assert.equal(actual['Open defects'],2);assert.equal(actual['Reopened work'],1);
const health=dashboard.children.find(x=>x.className==='gs-report-block');
assert(health,'Sprint Health report rendered');
const progress=health.children.find(x=>x.className==='gs-progress');
assert.equal(progress.attrs['aria-valuenow'],'56');
assert.match(progress.attrs['aria-label'],/Development delivered/);
assert.match(health.children.find(x=>x.className==='gs-health-score').children[0].textContent,/56%/);
const h=vm.runInContext('sprintHealthData()',ctx);
assert.equal(Object.fromEntries(h.metrics)['Development delivered'],23);
assert.equal(Object.fromEntries(h.metrics)['Active or New'],18);
assert.notEqual(h.reason,'0% accepted','QA acceptance cannot define delivery health');
assert.match(source,/const stage=w\?\.deliveryCategory\|\|w\?\.completionCategory\|\|boardColumn\(w\)/);
const before=[{id:25,type:'User Story',effort:1,deliveryCategory:'Done'},{id:26,type:'User Story',effort:1,deliveryCategory:'Done'}];
const after=[{...before[0],deliveryCategory:'In Progress'},before[1]];
const progressCalc=vm.runInContext('reportCompletedState',ctx);
const outcome=core.progress(before,after,progressCalc);
assert.equal(outcome.remaining,1,'Reopening Done restores its estimated effort to remaining');
assert.equal(outcome.completed,1,'Other completed work remains done');
assert.match(html,/\.gs49-delivery-fill\{background:#268457/);
console.log('PASS: Sprint 2 delivery=23/41 (56%), active=18; QA=23 awaiting/0 accepted, 2 active defects and 1 reopened; reopened effort returns to burndown remaining');
