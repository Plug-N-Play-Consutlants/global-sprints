const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync('extension/app.js','utf8');
function take(a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,`Missing boundary ${a}`);return s.slice(i,j);}
const ctx={console,Date,Set,Map,JSON,Number,Math,Error,Intl,diagnostic:()=>{},planDate:x=>new Date(x+'T00:00:00Z'),planISO:d=>d.toISOString().slice(0,10),OUTLOOK_DAYS:['sunday','monday','tuesday','wednesday','thursday','friday','saturday']};vm.createContext(ctx);
vm.runInContext(take('function retainReportHistory(','let observationInFlight='),ctx);
let snaps=[{at:'baseline',automatic:true},{at:'manual',automatic:false},...Array.from({length:200},(_,i)=>({at:String(i),automatic:true}))];
let retained=ctx.retainReportHistory(snaps);assert.equal(retained.length,152);assert.equal(retained[0].at,'baseline');assert.equal(retained[1].at,'manual');assert.equal(retained.at(-1).at,'199');console.log('PASS: immutable manual captures and original baseline survive rolling observation cap');
vm.runInContext(take('function meetingOccurrencesInMonth(','function renderMeetingCalendar('),ctx);
let weekly={date:'2026-10-05',repeat:'weekly',repeatEnd:'2026-10-30',repeatDays:['monday','wednesday']};
let occurrences=ctx.meetingOccurrencesInMonth([weekly],2026,9);assert.deepEqual(Array.from(occurrences,x=>x.date),['2026-10-05','2026-10-07','2026-10-12','2026-10-14','2026-10-19','2026-10-21','2026-10-26','2026-10-28']);
let once=ctx.meetingOccurrencesInMonth([{date:'2026-10-08'}],2026,9);assert.equal(once.length,1);console.log('PASS: recurring and single calendar dates expand correctly');
const local=new Map();ctx.localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)};
vm.runInContext(take('const OUTLOOK_RECOVERY_KEY=','async function outlookReconcile('),ctx);
assert(ctx.outlookRecoveryRecord({operationId:'op1',eventId:'event1',calendarId:'cal',accountId:'acc',meetingId:'meeting',scheduleId:null}));
assert.equal(ctx.outlookRecoveryEntries().length,1);ctx.outlookRecoveryClear('op1');assert.equal(ctx.outlookRecoveryEntries().length,0);console.log('PASS: recovery journal round-trip and removal');
const source=take('async function hierarchyMapBounded(','function normalizeItem(');
ctx.assignedLoadSequence=7;ctx.ancestorItems=[];ctx.api=async url=>{const id=Number(url.match(/workitems\/(\d+)/)[1]);if(url.includes('$expand'))return {relations:id===1||id===2?[{rel:'System.LinkTypes.Hierarchy-Reverse',url:'https://example/99'}]:[]};return {id,fields:{'System.Title':'Parent','System.TeamProject':'P'}};};
ctx.normalizeItem=x=>({id:x.id,title:x.fields['System.Title']});vm.runInContext(source,ctx);
ctx.enrichHierarchy([{id:1},{id:2}],7).then(()=>{assert.equal(ctx.ancestorItems.length,1);assert.equal(ctx.ancestorItems[0].id,99);console.log('PASS: hierarchy deduplicates shared ancestor');}).catch(e=>{console.error(e);process.exitCode=1});
