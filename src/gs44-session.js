/* v1.0.44: stale ADO iframe recovery. No SDK calls or reloads while writes are unresolved. */
const GS44Session=(()=>{
 const IDLE_MS=5*60*1000, DRAFT_KEY='pnpc-gs-recovery-draft-v1', RELOAD_KEY='pnpc-gs-last-automatic-reload-v1';
 let inactiveAt=0,lastInteraction=Date.now(),writeCount=0,cardProvider=null,reloading=false,pending=false,deferredScheduled=false;
 const diagnosticSafe=(kind,details)=>{try{diagnostic(kind,details,'warn');}catch{}};
 const session=()=>{try{return window.sessionStorage||sessionStorage;}catch{return null;}};
 function readDraft(){try{const raw=session()?.getItem(DRAFT_KEY);if(!raw)return null;const data=JSON.parse(raw);if(!data||Date.now()-data.at>30*60*1000){session()?.removeItem(DRAFT_KEY);return null;}return data;}catch{return null;}}
 function setCardProvider(provider){cardProvider=typeof provider==='function'?provider:null;}
 function restoreCard(id,project){const d=readDraft();if(!d||Number(d.id)!==Number(id)||String(d.project)!==String(project))return null;try{session()?.removeItem(DRAFT_KEY);}catch{}return d;}
 function hasRecoveredDraft(){return !!readDraft();}
 function notice(message){
  if(typeof document==='undefined')return;
  let node=document.getElementById('gs44-session-warning');
  if(!node){node=document.createElement('div');node.id='gs44-session-warning';node.setAttribute('role','alert');node.className='gs44-session-warning';
   const text=document.createElement('span');text.id='gs44-session-warning-text';
   const button=document.createElement('button');button.type='button';button.textContent='Reload Global Sprints';button.addEventListener('click',()=>reload('manual'));node.append(text,button);document.body.append(node);}
  const target=document.getElementById('gs44-session-warning-text');if(target)target.textContent=message;
 }
 function reload(reason){
  if(reloading)return;
  if(writeCount>0||typeof busy!=='undefined'&&busy||typeof outlookBookingBusy!=='undefined'&&outlookBookingBusy||typeof bulkOutlookBooking!=='undefined'&&bulkOutlookBooking){
   pending=true;notice('Your Azure DevOps session needs refreshing. Current writes or Outlook operations must finish first; no operation will be repeated automatically.');
   if(!deferredScheduled){deferredScheduled=true;setTimeout(()=>{deferredScheduled=false;if(pending)reload('deferred');},1000);}return;}
  const store=session();let last=0;
  try{last=Number(store?.getItem(RELOAD_KEY)||0);}catch{}
  if(reason!=='manual'&&Date.now()-last<45000){notice('Azure DevOps still needs authorization after a recent reload. Reopen the extension or reload once the host session is restored.');return;}
  if(cardProvider){try{const draft=cardProvider();if(draft?.dirty&&draft.id){if(!store)throw Error('Session storage unavailable');store.setItem(DRAFT_KEY,JSON.stringify({...draft,at:Date.now()}));if(!readDraft())throw Error('Session storage did not retain card draft');diagnosticSafe('session.card_draft_preserved',{itemId:Number(draft.id)});}}catch(e){pending=true;notice('Unable to preserve unsaved card edits. Copy them before reloading Global Sprints.');diagnosticSafe('session.draft_capture_failed',{reason:String(e?.name||'storage')});return;}}
  try{store?.setItem(RELOAD_KEY,String(Date.now()));}catch{}
  reloading=true;diagnosticSafe('session.reload',{reason,hadUnsavedDraft:hasRecoveredDraft()});
  try{window.location.reload();}catch(e){reloading=false;pending=true;notice('Automatic session refresh was blocked. Reload the extension manually after saving your work.');diagnosticSafe('session.reload_blocked',{reason:String(e?.name||'reload')});}
 }
 function markAuthenticationFailure(status){pending=true;diagnosticSafe('session.authentication_stale',{status});setTimeout(()=>reload('authentication'),120);}
 function resume(reason){
  const since=inactiveAt?Date.now()-inactiveAt:0;inactiveAt=0;
  if(!token||!registry)return;
  if(pending){diagnosticSafe('session.resume_stale',{});reload(reason);return;}
  if(since>=IDLE_MS){diagnosticSafe('session.resume_stale',{});if(typeof GS46Board!=='undefined')void GS46Board.refresh({automatic:true});else reload(reason);}
 }
 function start(){
  window.addEventListener('blur',()=>{inactiveAt=Date.now();});
  window.addEventListener('focus',()=>resume('focus'));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')inactiveAt=Date.now();else resume('visibility');});
  window.addEventListener('pageshow',event=>{if(event.persisted)reload('page-cache');});
  document.addEventListener('pointerdown',()=>{const previous=lastInteraction;lastInteraction=Date.now();if(!inactiveAt&&Date.now()-previous>=IDLE_MS&&token&&registry){if(pending)reload('inactive-tab');else if(typeof GS46Board!=='undefined')void GS46Board.refresh({automatic:true});else reload('inactive-tab');}},{capture:true,passive:true});
  if(hasRecoveredDraft())diagnosticSafe('session.recovered_draft_available',{});
 }
 function beginWrite(){writeCount++;}
 function endWrite(){writeCount=Math.max(0,writeCount-1);if(pending&&writeCount===0)setTimeout(()=>reload('deferred'),0);}
 function resumeDeferred(){if(pending&&writeCount===0)setTimeout(()=>reload('deferred'),0);}
 return {start,setCardProvider,restoreCard,hasRecoveredDraft,markAuthenticationFailure,beginWrite,endWrite,resumeDeferred,reload};
})();
GS44Session.start();
