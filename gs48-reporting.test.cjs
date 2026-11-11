'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app-main.js','utf8'),html=fs.readFileSync('index.html','utf8');
function excerpt(a,b){const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i,'Missing extraction anchors '+a);return source.slice(i,j);}
// Work Packages must follow the Gantt delivery summary, not interrupt the dashboard.
const reports=html.slice(html.indexOf('id="tab-reports"'),html.indexOf('id="tab-gantt"'));
assert(reports.indexOf('id="gs48ReportWorkPackages"')>reports.indexOf('id="ganttHealthPanel"'));
assert(reports.indexOf('id="gs48ReportWorkPackages"')>reports.indexOf('id="reportVelocity"'));
assert(source.includes("const packages=$('gs48ReportWorkPackages');if(packages)packages.replaceChildren();"));
assert(source.includes('if(packages)gs40RenderReportDrilldown(packages,work);'));
assert.match(source,/reportMetric\(qaCards,'Accepted \/ Closed',closed.length,'Explicitly accepted/);
console.log('PASS: Work Packages render after all primary reports; Accepted/Closed is explained rather than inferred');
class Node{constructor(tag='div',name='',value=''){this.tag=tag;this.className=name;this.textContent=String(value);this.children=[];this.attrs={};this.style={};this.innerHTML='';this.classList={add() {}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(k,v){this.attrs[k]=v;}}
const make=(tag,cl,v)=>new Node(tag,cl,v),now='2026-11-03';
const current={id:'current',name:'Sprint 2',start:'2026-10-27',end:'2026-11-09',workspaceId:'workspace',itemIds:[10],snapshots:[{at:'2026-11-03T14:00:00Z',items:[{id:10,state:'Active',type:'User Story',effort:3}]}]};
let sprints=[current],velocityRows=[],empty=[],burndownBars=0;
const velocityHost=new Node(),burndownHost=new Node();
const ctx={currentSprint:()=>current,workspaceSprints:()=>sprints,
 $:key=>key==='reportVelocity'?velocityHost:key==='reportBurndown'?burndownHost:null,
 reportNode:make,reportVelocityChart:(_host,rows)=>velocityRows.push(...rows),reportEmptyChart:(_host,label)=>empty.push(label),
 reportBurndownProgress:()=>burndownBars++,reportSnapshotTimestamp:v=>String(v),reportObservationDay:v=>String(v).slice(0,10),reportToday:()=>now,
 reportSafeDate:v=>/^\d{4}-\d\d-\d\d$/.test(v),reportCoverage:()=>({missing:[],assigned:1}),reportWork:()=>[{id:10,state:'Active',type:'User Story',effort:3}],
 reportCommittedProgress:(base,observed)=>({total:3,remaining:2,completed:1,totalItems:1,completedItems:0}),
 reportDay:v=>Date.parse(v+'T12:00:00Z')/86400000,
 document:{createElementNS(){throw Error('No SVG with only a single day of history');}},Number,Array,Map,Set,Math,Date,String,JSON,Error};
vm.createContext(ctx);vm.runInContext(excerpt('function renderVelocityBurndown(){','async function captureReportObservation('),ctx);
vm.runInContext('renderVelocityBurndown()',ctx);
assert(velocityRows.length===0,'No current-only velocity bar');
assert(empty.includes('No previous sprints available'));
assert(empty.includes('Burndown requires more history'));
assert.equal(burndownBars,0,'A horizontal progress bar is not burndown');
console.log('PASS: first active sprint and one observation day show honest missing-history states, not a one-bar velocity or fake burndown');
// Prior sprint observations are rendered, past sprints with no history are gaps,
// and current sprint remains a separate textual status.
const old={id:'old',name:'Sprint 1',start:'2026-10-13',end:'2026-10-26',itemIds:[101],snapshots:[{at:'2026-10-26T12:00:00Z',items:[{id:101,effort:5,state:'Closed',type:'User Story'}]}]};
const noHistory={id:'empty',name:'Prior Sprint No Snapshot',start:'2026-09-01',end:'2026-09-14',snapshots:[]};
sprints=[noHistory,old,current];empty=[];velocityRows=[];
ctx.document={createElementNS(){throw Error('No SVG with one observation day');}};
vm.runInContext('renderVelocityBurndown()',ctx);
assert.deepEqual(velocityRows.map(r=>r.name),['Prior Sprint No Snapshot','Sprint 1']);
assert.equal(velocityRows[0].value,null);assert.equal(velocityRows[1].value,1);
assert(!velocityRows.some(r=>r.name==='Sprint 2'));
console.log('PASS: eight-sprint window includes previous ended sprints and unknown-history gaps; current sprint is never a velocity bar');
// Two distinct dated observations actually emit an SVG path (not a bar).
current.snapshots.push({at:'2026-11-04T12:00:00Z',items:[{id:10,effort:3,state:'Done',type:'User Story'}]});
ctx.document={createElementNS(_ns,tag){return new Node(tag)}};
burndownHost.replaceChildren();velocityHost.replaceChildren();
vm.runInContext('renderVelocityBurndown()',ctx);
assert(burndownHost.children.some(n=>n.tag==='svg'));
assert(!burndownHost.children.some(n=>n.className==='gs-burndown-progress'));
console.log('PASS: two dated observations render a real burndown SVG with actual and ideal paths');
// Automatic observations capture once each new calendar day even when no
// work-item state or effort changes; earlier history is not backfilled.
(async()=>{
 let day='2026-11-03',writes=0;
 class ClockDate extends Date {constructor(...args){super(...(args.length?args:[`${day}T12:00:00Z`]));}static now(){return Date.parse(`${day}T12:00:00Z`);}}
 const sp={id:'s',itemIds:[42],snapshots:[]},store={sprints:[sp]},work={id:42,title:'Story',project:'P',type:'User Story',state:'Active',effort:3};
 const c={registry:store,items:[work],assignedItems:[],currentSprint:()=>sp,sprintDirty:()=>false,projectsDirty:()=>false,
  observationFingerprint:null,workflowColumn:()=> 'In Progress',boardColumn:()=> 'In Progress',retainReportHistory:a=>a,
  reportToday:()=>day,reportObservationDay:at=>String(at).slice(0,10),diagnostic:()=>{},renderSprintHealth:()=>{},renderTimeline:()=>{},
  persist:async fn=>{writes++;fn(store);return true;},Date:ClockDate,Number,Array,Map,Set,JSON,Math,String,Promise,Error};
 vm.createContext(c);vm.runInContext(excerpt('let observationInFlight=false,observationQueuedSprintId=null;','function reportFiltered(){'),c);
 const auto=vm.runInContext('autoReportObservation',c);
 await auto(sp,[work]);await auto(sp,[work]);assert.equal(writes,1,'No duplicate same-day identical snapshot');
 day='2026-11-04';await auto(sp,[work]);assert.equal(writes,2,'One new day captures unchanged progress');
 assert.deepEqual(sp.snapshots.map(s=>s.at.slice(0,10)),['2026-11-03','2026-11-04']);
 console.log('PASS: daily same-state observations are stored without duplicate same-day writes or synthetic backfill');
})().catch(e=>{console.error(e);process.exitCode=1;});
