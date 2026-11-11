'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const main=fs.readFileSync('src/app-main.js','utf8');
const rt=fs.readFileSync('src/gs40-runtime.js','utf8');
function between(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'missing extract anchors');return s.slice(a,b);}
// Existing closeout editor persists; only the user-facing label and save-feedback position change.
assert.match(html,/<h2 id="gs40RetroHeading">Sprint Closeout Notes<\/h2>/);
assert.match(html,/id="gs40RetroStatus"/);
assert.match(html,/<span id="gs42CloseoutFeedback"[^>]*role="status"[^>]*aria-live="polite"/);
const notes=between(html,'id="gs40RetrospectivePanel"','id="ceremonyAssistant"');
assert.ok(notes.indexOf('id="gs42CloseoutFeedback"')>notes.indexOf('id="gs40RetroSave"'),'feedback must sit beside save controls');
assert.ok(notes.indexOf('id="gs42CloseoutFeedback"')<notes.indexOf('id="gs40RetroHistory"'));
assert.match(rt,/gs42CloseoutFeedback\(finalize\?'Closeout notes finalized and saved to sprint history\.'\s*:\s*'Closeout notes draft saved\.'/);
assert.match(rt,/gs42CloseoutFeedback\('Closeout notes reopened/);
// Saved schedules: native details widget, all existing controls remain inside without moving to an alternate renderer.
assert.match(html,/<details class="panel gs42-saved-schedules" id="gs42SavedSchedulesDisclosure"/);
const panel=between(html,'id="gs42SavedSchedulesDisclosure"','id="ceremonyPanel"');
assert.match(panel,/<summary>/);
assert.match(panel,/id="gs42SavedSchedulesSummary"/);
assert.match(panel,/id="workspaceSchedules"/);
assert.ok(panel.indexOf('id="workspaceSchedules"')<panel.indexOf('</details>'),'schedule list remains in collapsible content');
assert.match(main,/summary\.textContent=`· \$\{active\.length\} active/);
assert.match(main,/end\.className='danger';end\.textContent='End schedule…'/);
assert.match(main,/clear\.className='danger';clear\.textContent='Clear All Meetings'/);
assert.match(main,/end\.onclick=\(\)=>void changeScheduleLifecycle\(sc\.id,'retire'\)/,'existing end behavior preserved');
// Focused tests of local feedback and shared save routine with an isolated, non-ADO storage stub.
const feedbackCode=between(rt,'function gs42CloseoutFeedback(','function gs40ReadRetro(');
const classes=new Set();const feedbackNode={textContent:'',classList:{toggle:(v,on)=>on?classes.add(v):classes.delete(v)}};
const fbctx={$:id=>id==='gs42CloseoutFeedback'?feedbackNode:null};vm.createContext(fbctx);vm.runInContext(feedbackCode,fbctx);
vm.runInContext('gs42CloseoutFeedback("Saved next to button")',fbctx);assert.equal(feedbackNode.textContent,'Saved next to button');
vm.runInContext('gs42CloseoutFeedback("Validation failed",true)',fbctx);assert.ok(classes.has('error'));
vm.runInContext('gs42CloseoutFeedback()',fbctx);assert.equal(feedbackNode.textContent,'');assert.ok(!classes.has('error'));
const saved=[],global=[],locals=[],reg={id:'registry',__etag:2,sprints:[]};let fail=false;
const ctx={console,Error,structuredClone,registry:reg,busy:false,notify:m=>global.push(m),diagnostic:()=>{},storage:{getDocument:async()=>({...reg}),setDocument:async(_,obj)=>{if(fail)throw Error('Storage unavailable');saved.push(obj);return obj}},COLLECTION:'workspace',ROOT:'registry',$:()=>({value:'s'})};
vm.createContext(ctx);vm.runInContext(between(main,'async function persist(','async function newSprint('),ctx);
(async()=>{
 const persist=vm.runInContext('persist',ctx);
 assert.equal(await persist(r=>r.sprints.push({id:'one'}),false,false,(m,error)=>locals.push([m,error])),true);
 assert.equal(saved.length,1);assert.deepEqual(global,[],'local save must not send global banner');
 assert.ok(locals.some(x=>x[0]==='Saving changes…'));
 fail=true;assert.equal(await persist(()=>{},false,false,(m,error)=>locals.push([m,error])),false);
 assert.ok(locals.some(x=>x[1]&&x[0].includes('Storage unavailable')),'failure appears beside save button');
 fail=false;assert.equal(await persist(()=>{},false,true),true);assert.ok(global.includes('Changes saved successfully.'),'existing callers retain global feedback');
 const normalize=between(main,'function normalizeRoomResponse(','async function roomRequest(');
 const licenseCtx={ALLOWED:new Set(['licensed','trial_active','trial_expired','unlicensed','expired','suspended','revoked']),Error,Date};vm.createContext(licenseCtx);vm.runInContext(normalize,licenseCtx);
 const normalizeResponse=vm.runInContext('normalizeRoomResponse',licenseCtx);
 assert.equal(normalizeResponse({status:'licensed',allowed:true,expires_at:null}).allowed,true,'paid license without a declared end remains supported');
 const future=new Date(Date.now()+86400000).toISOString();assert.equal(normalizeResponse({status:'trial_active',allowed:true,expires_at:future}).expiresAt,future);
 assert.throws(()=>normalizeResponse({status:'trial_active',allowed:true}),/verified expiry/,'trial without expiry cannot become unbounded access');
 assert.throws(()=>normalizeResponse({status:'licensed',allowed:true,expires_at:'not a date'}),/Invalid licensing expiry/);
 assert.equal(normalizeResponse({status:'revoked',allowed:false}).allowed,false);
 assert.equal(normalizeResponse({status:'suspended',allowed:false}).allowed,false);
 assert.throws(()=>normalizeResponse({status:'revoked',allowed:true}),/Inconsistent/);
 console.log('PASS: v1.0.42 inline closeout feedback, accessible disclosure, red End schedule, opt-in local save/errors, validated trial expiry and authorization status normalization');
})().catch(e=>{console.error(e);process.exitCode=1});
