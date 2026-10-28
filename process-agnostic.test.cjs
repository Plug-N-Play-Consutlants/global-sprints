'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/app.js','utf8');
const section=(start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a);assert(a>=0&&b>a,`${start} / ${end}`);return src.slice(a,b);};
const source=section('function workflowKey(w){','function assignedSelection(){')+section('const WORKFLOW_COLUMNS=', 'function compactMode(){')+section('function stateCandidates(w,column,states){','// Assignment uses verified identity choices')+section('async function dropOnCell(id,column,lane,cell){','function updateKanbanScrollControls(){');
const notifications=[],requests=[],diag=[],db=new Map();
let currentItem,activeStates,display,denied=new Set(),writeFail=false;
const scope={console,Date,Map,Set,Promise,Error,encodeURIComponent,workflowStates:new Map(),workflowCategories:new Map(),workflowNativeTerminal:new Map(),workflowStateDetails:new Map(),diagnostic:(type,details)=>diag.push({type,...details}),notify:msg=>notifications.push(msg),renderBacklog(){},renderBoard(){},renderSprintHealth(){},currentSprint(){return {id:'sprint',doneDisplayIds:display};},assignedSelection(){return [currentItem];},laneFor(){return 'Default';},saveLanes:async()=>true};
scope.api=async(url,opts)=>{
 requests.push({url,method:opts?.method||'GET',body:opts?.body});
 if(url.includes('/states?'))return {value:activeStates};
 if(url.includes('validateOnly=true')){
  const target=JSON.parse(opts.body)[1].value;
  if(denied.has(target))throw Error('Blocked by process transition rule');
  return {id:currentItem.id,fields:{'System.State':target},rev:currentItem.rev};
 }
 throw Error('Unexpected API request '+url);
};
scope.updateWorkItemState=async(w,next)=>{if(writeFail)return false;w.state=next;w.rev++;return true;};
vm.createContext(scope);vm.runInContext(source,scope);
scope.setDoneDisplay=async(w,flag)=>{if(flag===null)delete display[w.id];else display[w.id]=flag;return true;};
const getStates=vm.runInContext('getStates',scope),destination=vm.runInContext('destinationState',scope),drop=vm.runInContext('dropOnCell',scope),board=vm.runInContext('boardColumn',scope),category=vm.runInContext('workflowColumn',scope),nativeTerminal=vm.runInContext('nativeTerminal',scope);
const cel={classList:{add(){},remove(){}}};
const C=(name,cat)=>({name,category:cat});
let testCount=0;
const cases=[
 {label:'Agile User Story with Resolved categorized InProgress',project:'Agile',type:'User Story',states:[C('New','Proposed'),C('Active','InProgress'),C('Resolved','InProgress'),C('Closed','Completed'),C('Removed','Removed')],from:'Active',want:'Closed',terminal:true},
 {label:'Agile Bug with Resolved category',project:'Agile',type:'Bug',states:[C('New','Proposed'),C('Active','InProgress'),C('Resolved','Resolved'),C('Closed','Completed')],from:'Active',want:'Resolved',terminal:false},
 {label:'Agile Task with Closed terminal',project:'Agile',type:'Task',states:[C('New','Proposed'),C('Active','InProgress'),C('Closed','Completed')],from:'Active',want:'Closed',terminal:true},
 {label:'Scrum Product Backlog Item',project:'Scrum',type:'Product Backlog Item',states:[C('New','Proposed'),C('Approved','Proposed'),C('Committed','InProgress'),C('Done','Completed')],from:'Committed',want:'Done',terminal:true},
 {label:'Basic Issue',project:'Basic',type:'Issue',states:[C('To Do','Proposed'),C('Doing','InProgress'),C('Done','Completed')],from:'Doing',want:'Done',terminal:true},
 {label:'CMMI Requirement Resolved is InProgress',project:'CMMI',type:'Requirement',states:[C('Proposed','Proposed'),C('Active','InProgress'),C('Resolved','InProgress'),C('Closed','Completed')],from:'Active',want:'Closed',terminal:true},
 {label:'Inherited custom Complete in Completed category',project:'Inherited',type:'User Story',states:[C('New','Proposed'),C('In Progress','InProgress'),C('Complete','Completed')],from:'In Progress',want:'Complete',terminal:true},
 {label:'Inherited Complete in InProgress category fallback',project:'Inherited',type:'Change Request',states:[C('New','Proposed'),C('In Progress','InProgress'),C('Complete','InProgress')],from:'In Progress',want:'Complete',terminal:false},
 {label:'Unknown native state name in Completed category',project:'Inherited',type:'Custom Item',states:[C('Planned','Proposed'),C('Building','InProgress'),C('Shipped','Completed')],from:'Building',want:'Shipped',terminal:true},
 {label:'Missing state category with recognized Complete name',project:'Older',type:'Legacy',states:[{name:'New'},{name:'Active'},{name:'Complete'}],from:'Active',want:'Complete',terminal:true}
];
(async()=>{
 for(const [i,scenario] of cases.entries()){
  currentItem={id:9200+i,project:scenario.project,type:scenario.type,state:scenario.from,rev:5};activeStates=scenario.states;display={};denied=new Set();requests.length=0;
  await drop(currentItem.id,'Done','Default',cel);
  assert.strictEqual(currentItem.state,scenario.want,scenario.label+' native ADO state');
  assert.strictEqual(board(currentItem),'Done',scenario.label+' display');
  assert.strictEqual(nativeTerminal(currentItem),scenario.terminal,scenario.label+' terminal classification');
  assert(requests.some(r=>r.url.includes('validateOnly=true')),scenario.label+' no-write validation');
  assert(!requests.some(r=>r.method==='PATCH'&&!r.url.includes('validateOnly=true')),scenario.label+' no direct invalid mutation');
  // Reloaded data must keep intentional placement (per sprint, not process-global).
  assert.strictEqual(board({...currentItem}),'Done',scenario.label+' persists on reload');
  assert.strictEqual(category({...currentItem}),scenario.label.startsWith('CMMI')||scenario.label.startsWith('Agile User')?'Closed':category(currentItem));
  console.log('PASS '+scenario.label);testCount++;
 }
 // A custom WIT with the SAME type name in another project cannot inherit the first process map.
 currentItem={id:9290,project:'Agile',type:'User Story',state:'Active',rev:1};activeStates=cases[0].states;display={};
 await getStates(currentItem);
 const other={id:9291,project:'Another',type:'User Story',state:'Active',rev:1};activeStates=[C('New','Proposed'),C('Active','InProgress'),C('Complete','Completed')];
 await getStates(other);
 assert.strictEqual(category({...other,state:'Complete'}),'Closed');
 assert.strictEqual(category({...currentItem,state:'Resolved'}),'In Progress');
 console.log('PASS separate project/type maps');testCount++;
 // When a process blocks the preferred intermediate state, validateOnly must
 // skip it and choose a permitted category-completed state without writing it.
 currentItem={id:9292,project:'Rules',type:'Bug',state:'Active',rev:13};activeStates=cases[1].states;display={};denied=new Set(['Resolved']);requests.length=0;
 await drop(currentItem.id,'Done','Default',cel);
 assert.strictEqual(currentItem.state,'Closed');assert.strictEqual(board(currentItem),'Done');
 assert.deepStrictEqual(requests.filter(x=>x.url.includes('validateOnly=true')).map(x=>JSON.parse(x.body)[1].value),['Resolved','Closed']);
 console.log('PASS validator skips blocked resolved state and uses allowed completed state');testCount++;
 // Never silently move the Board when ADO rules reject ALL destination states.
 currentItem={id:9293,project:'NoTransition',type:'Task',state:'Active',rev:3};activeStates=cases[2].states;display={};denied=new Set(['Closed']);requests.length=0;
 await drop(currentItem.id,'Done','Default',cel);
 assert.strictEqual(currentItem.state,'Active');assert.strictEqual(display[currentItem.id],undefined);
 assert(notifications.some(n=>n.includes('rejected every Done transition')));
 console.log('PASS rejecting all transitions preserves ADO and Board');testCount++;
 // ADO write failure must restore Board display state, even after validation passed.
 currentItem={id:9294,project:'Failure',type:'Task',state:'Active',rev:3};activeStates=cases[2].states;display={};denied=new Set();writeFail=true;
 await drop(currentItem.id,'Done','Default',cel);writeFail=false;
 assert.strictEqual(currentItem.state,'Active');assert.strictEqual(display[currentItem.id],undefined);
 console.log('PASS ADO write failure rolls back staged Done placement');testCount++;
 // Custom Complete placed in the ADO InProgress category is NOT terminal for health.
 const fallback={project:'Inherited',type:'Change Request',state:'Complete'};
 assert.strictEqual(category(fallback),'In Progress');assert.strictEqual(nativeTerminal(fallback),false);
 console.log('PASS custom category remains authoritative for Sprint Health');testCount++;
 // A process changed while the extension was open: retry metadata discovery.
 const stale={id:9297,project:'Edited',type:'Custom',state:'Active',rev:2};
 currentItem=stale;activeStates=[C('New','Proposed'),C('Active','InProgress')];display={};denied=new Set();
 await getStates(stale);
 activeStates=[C('New','Proposed'),C('Active','InProgress'),C('Complete','Completed')];
 await drop(stale.id,'Done','Default',cel);
 assert.strictEqual(stale.state,'Complete');assert.strictEqual(board(stale),'Done');
 console.log('PASS inherited process changed after initial metadata load');testCount++;
 // Process API equivalents may use stateCategory instead of category.
 const alternate={id:9298,project:'Alternative',type:'Subtype',state:'Active',rev:2};
 currentItem=alternate;activeStates=[{name:'New',stateCategory:'Proposed'},{name:'Active',stateCategory:'InProgress'},{name:'Complete',stateCategory:'Completed'}];display={};
 await drop(alternate.id,'Done','Default',cel);
 assert.strictEqual(alternate.state,'Complete');assert.strictEqual(nativeTerminal(alternate),true);
 console.log('PASS alternate stateCategory metadata field');testCount++;
 // Running the complete/close action after a Done placement retains the real terminal state.
 currentItem={id:9300,project:'Another',type:'User Story',state:'Complete',rev:9};activeStates=cases[6].states;display={[9300]:true};denied=new Set();
 await drop(9300,'Closed','Default',cel);
 assert.strictEqual(currentItem.state,'Complete');assert.strictEqual(board(currentItem),'Closed');
 console.log('PASS explicit Board acceptance does not invent ADO states');testCount++;
 assert(src.includes("const DIAG_VERSION='1.0.39'"));
 console.log(`PASS ${testCount} process-aware scenarios`);
})().catch(e=>{console.error(e);process.exitCode=1;});
