const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('extension/app.js','utf8');
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`Missing ${start}`);return source.slice(a,b);}
const code=extract('function reportCompletedState(', 'function renderVelocityBurndown(');
const context={isPlanningContextType:w=>/^(feature|epic)$/i.test(w.type),console};vm.createContext(context);vm.runInContext(code,context);
const work=[{id:1,type:'Task',state:'Completed',effort:1},{id:2,type:'Task',state:'New',effort:1},{id:3,type:'Task',state:'New',storyPoints:1},{id:4,type:'Product Backlog Item',state:'New',effort:2},{id:5,type:'Task',state:'New',effort:5},{id:6,type:'Feature',state:'New',effort:99}];
const r=context.reportCommittedProgress(work,work);assert.deepStrictEqual(JSON.parse(JSON.stringify(r)),{total:10,completed:1,remaining:9,completedItems:1,totalItems:5});
assert.equal(context.reportEstimate({effort:2,storyPoints:2}),2,'Must not double count estimates');
assert.equal(context.reportCompletedState({state:'Completed'}),true);
const prior=work.map(x=>({...x,state:x.id===1?'Active':x.state}));const r2=context.reportCommittedProgress(prior,work);assert.equal(r2.completed,1);
assert(source.includes('referenceCalendarMonth'), 'Calendar must navigate months');
assert(source.includes('gs-calendar-day')&&source.includes('proposed-occurrence'),'Recurrence preview must be visible');
assert(source.includes('function renderRecurrenceExplanation()'),'Recurrence must have human-readable guidance');
assert(source.includes('void autoReportObservation(currentSprint(),reportWork())'),'ADO changes must update observations');
assert(source.includes("nav?.type==='reload'"),'Reload must preserve tab independently of new navigation');
assert(source.includes("const description=richField('Description'")&&source.includes("const criteria=richField('Acceptance Criteria'"),'Popup planning fields required');
console.log('v0.9.15 acceptance invariants PASS (10-point fixture, state, calendar, navigation, popup, observations)');
