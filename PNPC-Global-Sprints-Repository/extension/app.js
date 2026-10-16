import * as sdkModule from './vendor/SDK.min.js';
'use strict';
window.addEventListener('error',event=>{if(/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(String(event.message||''))){event.preventDefault();return;}const el=document.getElementById('message');if(el){el.textContent='Extension script error: '+(event.message||'Unknown error');el.className='message error';}});
window.addEventListener('unhandledrejection',event=>{const el=document.getElementById('message');if(el){el.textContent='Extension startup error: '+String(event.reason?.message||event.reason||'Unknown rejection');el.className='message error';}});
/* Organization-scoped extension data. No PAT, passwords, or browser-local sprint store. */
const $=id=>document.getElementById(id);
// PNPC Global Sprints / Product Command Azure DevOps room client.
// Browser token is passed only to the configured HTTPS Product Command endpoint.
// Product Command verifies identity and issues entitlement decisions.
// Never cache bearer tokens or license keys.
const ROOM_API='https://plugnplayconsultants.com/wp-json/pnpc-product-command/v1';
const ALLOWED=new Set(['licensed','trial_active','trial_expired','unlicensed','expired','suspended','revoked']);
const ROOM_ENFORCE_PREVIEW=true; // Client UI gate only. Product Command remains authoritative; client code is not tamper-resistant.
function normalizeRoomResponse(raw){
 if(!raw||typeof raw!=='object'||!ALLOWED.has(raw.status)||typeof raw.allowed!=='boolean')throw Error('Unexpected licensing service response.');
 if(raw.allowed!==['licensed','trial_active'].includes(raw.status))throw Error('Inconsistent licensing decision.');
 return {status:raw.status,allowed:raw.allowed,startedAt:typeof raw.started_at==='string'?raw.started_at:null,expiresAt:typeof raw.expires_at==='string'?raw.expires_at:null};
}
async function roomRequest({operation,organization,token,licenseKey,signal}){
 if(!['entitlement','trial','activate'].includes(operation))throw Error('Unsupported licensing operation.');
 if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(organization||''))throw Error('Invalid Azure DevOps organization name.');
 if(!token||typeof token!=='string')throw Error('Azure DevOps authentication is required.');
 if(operation==='activate'&&(!licenseKey||typeof licenseKey!=='string'))throw Error('A license key is required.');
 const body={organization};
 if(operation==='activate')body.license_key=licenseKey;
 const response=await fetch(`${ROOM_API}/ado/${operation}`,{method:'POST',mode:'cors',cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal});
 const payload=await response.json().catch(()=>null);
 if(!response.ok){
  const reason=typeof payload?.data?.reason==='string'&&/^[a-z0-9_]{1,80}$/.test(payload.data.reason)?payload.data.reason:null;
  const base=response.status===503?'Licensing service temporarily unavailable.':response.status===401?'Azure DevOps authentication was not accepted.':response.status===403?'Organization authorization was denied.':(payload?.message||`Licensing request failed (${response.status}).`);
  const error=new Error(reason?`${base} Diagnostic: ${reason}.`:base);
  error.status=response.status;error.code=typeof payload?.code==='string'&&/^[a-z0-9_]{1,80}$/.test(payload.code)?payload.code:null;throw error;
 }
 return normalizeRoomResponse(payload);
}

const COLLECTION='global-sprints-v1';
const ROOT='registry';
const DEFAULT_WORKSPACE_ID='default-workspace';
const MAX_ITEMS=200;
const DEFAULT_PROJECTS=['Serve It Up Safe','SIUS - Page Generator'];
const ENABLE_WORK_ITEM_WRITES=true; // Safety gate until verified in a test organization.
let sdk,context,token,storage,registry,items=[],projects=[],busy=false;
let projectVisibility=[];
let activeWorkspaceId=DEFAULT_WORKSPACE_ID;
function activeWorkspace(){return registry?.workspaces?.find(w=>w.id===activeWorkspaceId);}
function workspaceSprints(){return (registry?.sprints||[]).filter(s=>s.workspaceId===activeWorkspaceId);}
function workspaceProjectIds(){return activeWorkspace()?.projectIds||[];}
// Access is restricted until the licensing service returns a verified entitlement.
// A transient error retains only the last decision verified during this page session.
let roomStatus=null,roomBusy=false,roomCheckPending=false;
const ROOM_CACHE_PREFIX='pnpc-gs-verified-entitlement-v1:';
const ROOM_REQUEST_TIMEOUT_MS=12000;
const ROOM_RETRY_MIN_MS=60000;
const ROOM_RETRY_MAX_MS=15*60000;
let roomRetryTimer=null,roomRetryDelay=ROOM_RETRY_MIN_MS;
function roomCacheKey(){
 const host=sdk?.getHost?.();
 const id=String(host?.id||'').toLowerCase();
 const name=roomOrganization().toLowerCase();
 // The stable host GUID prevents reusing a cached decision for a renamed or unrelated organization.
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id)||!name)return null;
 return ROOM_CACHE_PREFIX+id+':'+name;
}
function roomStoreVerified(result){
 const key=roomCacheKey();if(!key)return;
 try{localStorage.setItem(key,JSON.stringify({schema:1,organizationId:String(sdk.getHost().id).toLowerCase(),organization:roomOrganization().toLowerCase(),decision:result,verifiedAt:new Date().toISOString()}));}
 catch(error){diagnostic('licensing.cache.write_failed',{reason:String(error?.name||'storage')},'warn');}
}
function roomRestoreVerified(){
 const key=roomCacheKey();if(!key)return false;
 try{
  const raw=localStorage.getItem(key);if(!raw)return false;
  const saved=JSON.parse(raw);
  if(saved.schema!==1||saved.organizationId!==String(sdk.getHost().id).toLowerCase()||saved.organization!==roomOrganization().toLowerCase())return false;
  const result=normalizeRoomResponse(saved.decision);
  // A previously verified trial has a known end date; an outage must not extend it indefinitely.
  if(result.status==='trial_active'&&result.expiresAt&&Date.parse(result.expiresAt)<=Date.now()){
   roomStatus={...result,status:'trial_expired',allowed:false};
  }else roomStatus=result;
  diagnostic('licensing.cache.restored',{status:roomStatus.status,allowed:roomStatus.allowed});
  return true;
 }catch(error){diagnostic('licensing.cache.invalid',{reason:String(error?.name||'invalid')},'warn');return false;}
}
function roomScheduleRetry(){
 if(roomRetryTimer)return;
 roomRetryTimer=setTimeout(()=>{roomRetryTimer=null;if(!roomBusy&&token&&roomOrganization())void checkRoom('entitlement');},roomRetryDelay);
 roomRetryDelay=Math.min(roomRetryDelay*2,ROOM_RETRY_MAX_MS);
}
function roomClearRetry(){if(roomRetryTimer){clearTimeout(roomRetryTimer);roomRetryTimer=null;}roomRetryDelay=ROOM_RETRY_MIN_MS;}
function roomAccessAllowed(){
 if(!roomStatus?.allowed)return false;
 return !(roomStatus.status==='trial_active'&&roomStatus.expiresAt&&Date.parse(roomStatus.expiresAt)<=Date.now());
}
function roomReadableStatus(){
 if(!roomStatus)return 'Entitlement not checked';
 const names={licensed:'Licensed',trial_active:'Trial active',trial_expired:'Trial expired',unlicensed:'Not licensed',expired:'License expired',suspended:'License suspended',revoked:'License revoked'};
 const when=roomStatus.expiresAt?` · Ends ${new Date(roomStatus.expiresAt).toLocaleString()}`:'';
 return `${names[roomStatus.status]||roomStatus.status}${when}`;
}
function renderRoomAccess(){
 const denied=ROOM_ENFORCE_PREVIEW&&!!roomStatus&&!roomAccessAllowed();
 const pending=ROOM_ENFORCE_PREVIEW&&!roomStatus;
 const banner=$('licenseAccessNotice');if(banner){banner.classList.toggle('hidden',!denied);banner.textContent=denied?`${roomReadableStatus()}. Global Sprints work areas are unavailable until a trial or paid license is active. Existing sprint data is retained. Open Configuration to manage licensing.`:'';}
 for(const name of ['board','planning','reports','demo']){
  const panel=$('tab-'+name);if(panel){panel.inert=!!(denied||pending);panel.setAttribute('aria-disabled',String(!!(denied||pending)));}
 }
 const ctx=document.querySelector('.gs-context');if(ctx)ctx.inert=!!(denied||pending);
 for(const b of document.querySelectorAll('.gs-tab')){
  const restricted=['board','planning','reports','demo'].includes(b.dataset.tab);
  b.disabled=!!denied&&restricted;
 }
 // Access checks update the current panels' interactivity and notice only.
 // They must never navigate, change the selected tab, or alter the remembered tab.
}

function roomOrganization(){
 const host=sdk?.getHost?.();
 const name=host?.name||'';
 return /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(name)?name:'';
}
function renderRoomStatus(message){
 const trialButton=$('licenseRoomTrial');
 if(trialButton){
  const trialAvailable=roomStatus?.status==='unlicensed';
  trialButton.classList.toggle('hidden',!trialAvailable);
  trialButton.setAttribute('aria-hidden',String(!trialAvailable));
 }
 const node=$('licenseRoomStatus');if(!node)return;
 node.textContent=message||(roomStatus?`Organization entitlement: ${roomReadableStatus()}.`:'Entitlement has not yet been checked.');
 renderRoomAccess();
}
async function checkRoom(operation='entitlement'){
 if(roomBusy)return;
 const organization=roomOrganization();
 if(!organization)return renderRoomStatus('Azure DevOps organization could not be identified. Licensing request not sent.');
 if(!token)return renderRoomStatus('Azure DevOps access token unavailable.');
 const key=operation==='activate'?$('licenseRoomKey')?.value.trim():undefined;
 if(operation==='activate'&&!key)return renderRoomStatus('Enter a license key to activate.');
 if(operation==='trial'&&roomStatus&&roomStatus.status!=='unlicensed')return renderRoomStatus('A trial cannot be started from the current entitlement state. '+roomReadableStatus()+'.');
 if(operation==='trial'&&!confirm('Start the 14-day organization-wide Global Sprints trial? This cannot be restarted.'))return;
 roomBusy=true;
 for(const id of ['licenseRoomCheck','licenseRoomTrial','licenseRoomActivate'])if($(id))$(id).disabled=true;
 renderRoomStatus('Contacting Product Command licensing service…');
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),ROOM_REQUEST_TIMEOUT_MS);
  let result;
  try{result=await roomRequest({operation,organization,token,licenseKey:key,signal:controller.signal});}
  finally{clearTimeout(timeout);}
  roomClearRetry();
  roomStatus=result;
  roomStoreVerified(result);
  // An explicit denial may be a short-lived administrator simulation. Recheck without blocking the UI.
  if(operation==='entitlement'&&!result.allowed)roomScheduleRetry();
  if($('licenseRoomKey'))$('licenseRoomKey').value='';
  renderRoomStatus();
  diagnostic('licensing.room.checked',{operation,status:result.status,allowed:result.allowed});
 }catch(error){
  // A transient service failure must not be confused with an unlicensed decision.
  // Retain the last verified decision, if one exists.
  renderRoomStatus(`Licensing check failed: ${error.name==='AbortError'?'Request timed out.':error.message} ${roomStatus?'Last verified status: '+roomReadableStatus()+'. Service will retry automatically.':'No verified entitlement is available. Work areas remain restricted until verification succeeds.'}`);
  if(operation==='entitlement')roomScheduleRetry();
  diagnostic('licensing.room.unavailable',{operation,status:error.status||'network',code:error.code||'unavailable'},'warn');
 }finally{
  roomBusy=false;
  for(const id of ['licenseRoomCheck','licenseRoomTrial','licenseRoomActivate'])if($(id))$(id).disabled=false;
 }
}
// Opportunistic recovery in addition to bounded backoff; no blocking startup request.
window.addEventListener('online',()=>{if(token&&!roomBusy)void checkRoom('entitlement');});
window.addEventListener('focus',()=>{if(token&&!roomBusy&&roomRetryTimer)void checkRoom('entitlement');});
function workspaceLabel(){const w=activeWorkspace();return w?`${w.projectIds.length} project(s) · ${workspaceSprints().length} sprint(s)`:'';}
function renderWorkspacePicker(preferred){
 const picker=$('workspacePicker');const selected=preferred||activeWorkspaceId;
 picker.replaceChildren();for(const w of registry.workspaces||[])if(!w.archived)picker.add(new Option(w.name,w.id));
 activeWorkspaceId=(registry.workspaces||[]).some(w=>w.id===selected&&!w.archived)?selected:(registry.workspaces||[]).find(w=>!w.archived)?.id||DEFAULT_WORKSPACE_ID;
 picker.value=activeWorkspaceId;$('workspaceSummary').textContent=workspaceLabel();
}
function syncWorkspaceProjects(){
 projectVisibility=workspaceProjectIds().filter(id=>projects.some(p=>p.id===id));
 savedProjectVisibility=projectForm();renderProjectSelectors();updateDirty();
}
async function migrateWorkspaces(){
 const hasWorkspace=Array.isArray(registry.workspaces)&&registry.workspaces.length&&registry.sprints.every(s=>s.workspaceId&&registry.workspaces.some(w=>w.id===s.workspaceId));
 if(hasWorkspace)return;
 const existingIds=Array.isArray(registry.includedProjectIds)?registry.includedProjectIds:projects.map(p=>p.id);
 const ok=await persist(r=>{
  r.workspaces ||= [];
  if(!r.workspaces.some(w=>w.id===DEFAULT_WORKSPACE_ID))r.workspaces.unshift({id:DEFAULT_WORKSPACE_ID,name:'Default Workspace',description:'Existing Global Sprints',projectIds:existingIds,createdAt:new Date().toISOString()});
  for(const sprint of r.sprints||[])if(!sprint.workspaceId||!r.workspaces.some(w=>w.id===sprint.workspaceId))sprint.workspaceId=DEFAULT_WORKSPACE_ID;
 },false);
 if(!ok)throw Error('Workspace migration could not be saved. Existing sprint data was not modified.');
}
async function createWorkspace(){
 if(!(await guardSprint())||!(await guardProjects()))return;
 const name=prompt('Workspace name');if(name===null)return;
 if(!name.trim()||name.trim().length>120)return notify('Enter a workspace name up to 120 characters.',true);
 const ids=[...$('workspaceProjects').selectedOptions].map(o=>o.value);
 if(!ids.length)return notify('Select at least one project in Workspace Configuration before creating a workspace.',true);
 const id=crypto.randomUUID();const ok=await persist(r=>{r.workspaces.push({id,name:name.trim(),description:'',projectIds:ids,createdAt:new Date().toISOString()});},false);
 if(ok){activeWorkspaceId=id;renderWorkspacePicker(id);syncWorkspaceProjects();renderSprintPicker('');clearWorkspaceViews();rememberContext();notify('Workspace created. Create its first sprint in Planning.');}
}
async function renameWorkspace(){const w=activeWorkspace();if(!w)return;
 const name=prompt('Rename workspace',w.name);if(name===null)return;
 if(!name.trim()||name.trim().length>120)return notify('Enter a valid workspace name.',true);
 const ok=await persist(r=>{r.workspaces.find(x=>x.id===w.id).name=name.trim();},false);
 if(ok){renderWorkspacePicker(w.id);notify('Workspace renamed.');}
}
async function archiveWorkspace(){const w=activeWorkspace();if(!w||w.id===DEFAULT_WORKSPACE_ID)return notify('The Default Workspace cannot be archived.',true);
 if(!confirm(`Archive workspace "${w.name}"? Its sprints and ceremonies will be preserved but hidden until restored.`))return;
 const ok=await persist(r=>{r.workspaces.find(x=>x.id===w.id).archived=true;},false);
 if(ok){activeWorkspaceId=DEFAULT_WORKSPACE_ID;renderWorkspacePicker();syncWorkspaceProjects();renderSprintPicker('');clearWorkspaceViews();rememberContext();notify('Workspace archived. Its data has been retained.');}
}
function clearWorkspaceViews(){items=[];assignedItems=[];ancestorItems=[];browserItems=[];browserSelection.clear();nearbyResults=[];++browserSequence;++assignedLoadSequence;renderBrowser();renderBacklog();renderBoard();renderSprintHealth();}
async function switchWorkspace(){
 const destination=$('workspacePicker').value;
 $('workspacePicker').value=activeWorkspaceId;
 if(!(await guardSprint())||!(await guardProjects()))return;
 activeWorkspaceId=destination;renderWorkspacePicker(destination);syncWorkspaceProjects();
 const last=readContext().workspaceSprints?.[destination]||'';
 renderSprintPicker(last);clearWorkspaceViews();rememberContext();await loadAssignedItems();notify('Workspace opened.');
}
function renderWorkspaceConfiguration(){
 const select=$('workspaceProjects');if(!select)return;
 const w=activeWorkspace();select.replaceChildren();
 for(const p of projects.slice().sort((a,b)=>a.name.localeCompare(b.name))){const o=new Option(p.name,p.id);o.selected=!!w?.projectIds.includes(p.id);select.add(o);}
 $('workspaceConfigurationStatus').textContent=w?`Editing ${w.name}. Select one or more participating projects.`:'Select a workspace.';
}
async function saveWorkspaceProjects(){const w=activeWorkspace();if(!w)return;
 if(!(await guardProjects()))return;
 const ids=[...$('workspaceProjects').selectedOptions].map(o=>o.value);
 if(!ids.length)return notify('A workspace must include at least one project.',true);
 const ok=await persist(r=>{r.workspaces.find(x=>x.id===w.id).projectIds=ids;},false);
 if(ok){syncWorkspaceProjects();renderWorkspacePicker(w.id);clearWorkspaceViews();rememberContext();notify('Workspace project membership saved. Existing sprint assignments were preserved.');}
}
function showArchivedWorkspaces(){const archived=(registry.workspaces||[]).filter(w=>w.archived);
 if(!archived.length)return notify('No archived workspaces.');
 const name=prompt('Restore archived workspace by entering its exact name:\n'+archived.map(w=>w.name).join('\n'));if(name===null)return;
 const match=archived.find(w=>w.name===name);if(!match)return notify('No matching archived workspace.',true);
 void persist(r=>{r.workspaces.find(w=>w.id===match.id).archived=false;},false).then(ok=>{if(ok){renderWorkspacePicker(activeWorkspaceId);notify('Workspace restored.');}});
}

let assignedItems=[];
let assignedLoadSequence=0;
let ancestorItems=[];const workflowStates=new Map();const workflowCategories=new Map();
let searchTimer,searchSequence=0,nearbyResults=[];
let savedSprintForm='',savedProjectVisibility='',activeSprintId='',switchingSprint=false;
const sprintForm=()=>JSON.stringify(['sprintName','start','end','goal','status'].map(id=>$(id).value));
const projectForm=()=>JSON.stringify([...projectVisibility].sort());
const sprintDirty=()=>sprintForm()!==savedSprintForm;
const projectsDirty=()=>projectForm()!==savedProjectVisibility;
function updateDirty(){
 $('sprintDirty').textContent=sprintDirty()?'● Unsaved sprint changes':'All sprint changes saved';
 $('projectPreferencesStatus').textContent=projectsDirty()?'● Unsaved project selection':'Project selection saved';
}
function acknowledge(label){notify(label);}
function askUnsaved(kind){return new Promise(resolve=>{
 const dialog=$('unsavedDialog');$('unsavedTitle').textContent=`Unsaved ${kind} changes`;
 $('unsavedDescription').textContent=`Your ${kind} changes have not been saved. What would you like to do?`;
 dialog.classList.remove('hidden');
 const finish=answer=>{dialog.classList.add('hidden');resolve(answer);};
 $('unsavedSave').onclick=()=>finish('save');$('unsavedDiscard').onclick=()=>finish('discard');$('unsavedCancel').onclick=()=>finish('cancel');
 });}
async function guardSprint(){if(!sprintDirty())return true;const choice=await askUnsaved('sprint');if(choice==='cancel')return false;if(choice==='save')return await saveSprint();return true;}
async function guardProjects(){if(!projectsDirty())return true;const choice=await askUnsaved('project selection');if(choice==='cancel')return false;if(choice==='save')return await saveProjectPreferences();projectVisibility=JSON.parse(savedProjectVisibility);renderProjectSelectors();updateDirty();return true;}
window.addEventListener('beforeunload',e=>{if(sprintDirty()||projectsDirty()){e.preventDefault();e.returnValue='';}});

const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lastActionTarget=null;
document.addEventListener('click',e=>{const target=e.target.closest('button,[role=button]');if(target)lastActionTarget=target;},true);
function contextualMessage(target,message,error){
 const card=target?.closest('.ceremony-record,.schedule-meetings .row,.work-item-popup,[role=dialog]');
 const field=target?.closest('.fields > div');
 const container=card||field;
 if(!container)return false;
 let status=container.querySelector(':scope > .gs-action-feedback');
 if(!status){status=document.createElement('p');status.className='gs-action-feedback';status.setAttribute('role','status');status.setAttribute('aria-live','polite');container.append(status);}
 status.textContent=message;status.classList.toggle('error',!!error);return true;
}
function notify(message,error=false){
 if(error)diagnostic('ui.operation_failed',{message},'error');
 // System messages remain in the global notification area. Action-specific failures
 // are displayed at the initiating component, without a competing page banner.
 if(error&&contextualMessage(lastActionTarget,message,true))return;
 $('message').textContent=message;$('message').className='message'+(error?' error':'');$('message').setAttribute('role','status');$('message').setAttribute('aria-live','polite');
}
function requireSprint(){const id=$('sprintPicker').value;const s=registry.sprints.find(x=>x.id===id);if(!s)throw Error('Create or select a global sprint first.');return s;}
function organizationApiBase(){
  const web=sdk.getWebContext?.() || sdk.getPageContext?.()?.webContext || {};
  const page=sdk.getPageContext?.() || {};
  const host=sdk.getHost?.() || {};
  const candidates=[web.collection?.uri,web.collection?.url,web.host?.uri,web.host?.url,
    page.webContext?.collection?.uri,page.webContext?.collection?.url,
    page.webContext?.host?.uri,page.webContext?.host?.url,
    host.serviceHost?.uri,host.serviceHost?.url];
  const parseOrgUrl=value=>{
    if(typeof value!=='string')return null;
    try{
      const u=new URL(value);
      if(u.protocol!=='https:')return null;
      if(u.hostname==='dev.azure.com'){
        const org=u.pathname.split('/').filter(Boolean)[0];
        return org?`https://dev.azure.com/${encodeURIComponent(org)}`:null;
      }
      if(/^[a-z0-9-]+\.visualstudio\.com$/i.test(u.hostname))return u.origin;
    }catch{}
    return null;
  };
  for(const value of candidates){const result=parseOrgUrl(value);if(result)return result;}
  // In some project hub contexts Azure DevOps exposes the organization name, not a URI.
  const names=[web.collection?.name,page.webContext?.collection?.name,
    web.host?.name,page.webContext?.host?.name,host.name];
  const referrers=[document.referrer,...Array.from(window.location.ancestorOrigins||[])];
  for(const value of referrers){const result=parseOrgUrl(value);if(result)return result;}
  const name=names.find(v=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/i.test(v));
  if(name)return `https://dev.azure.com/${encodeURIComponent(name)}`;
  throw Error('Azure DevOps organization context is incomplete (no collection URL or name). Please report this message and the project URL.');
}
function serviceHttpError(service,status){
 const category=status===401?'Authentication required':status===403?'Permission denied':status===404?'Resource not found':status===409||status===412?'Concurrent change detected':status===429?'Request throttled':status>=500?'Service temporarily unavailable':'Request failed';
 return Error(`${service}: ${category} (HTTP ${Number(status)||0}). Check Extension Health or contact support if this persists.`);
}
async function api(path,options={}){const started=Date.now();const method=options.method||'GET';const response=await fetch(`${organizationApiBase()}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...options.headers}});if(!response.ok){diagnostic('ado.api_failure',{status:response.status,method,durationMs:Date.now()-started},'error');throw serviceHttpError('Azure DevOps',response.status);}if(method!=='GET')diagnostic('ado.api_write',{status:response.status,method,durationMs:Date.now()-started});return response.status===204?null:response.json();}

// Local UI preferences are scoped to the Azure DevOps user and organization.
let browserItems=[],browserSequence=0,contextKey='',browserBusy=false;
const browserSelection=new Set();let bulkBusy=false;
function readContext(){try{return JSON.parse(localStorage.getItem(contextKey)||'{}');}catch{return {};}}
function rememberContext(){if(!contextKey)return;try{localStorage.setItem(contextKey,JSON.stringify({
 workspace:activeWorkspaceId,workspaceSprints:{...(readContext().workspaceSprints||{}),[activeWorkspaceId]:$('sprintPicker').value},sprint:$('sprintPicker').value,boardMode:$('boardMode').value,boardDensity:$('boardDensity').value,
 activeTab:requestedTab,project:$('project').value,browseProject:$('browseProject').value,browseMode:$('browseMode').value
}));}catch(e){console.warn('Unable to save local view preferences',e);}}
function restoreContext(){
 const saved=readContext();
 for(const [id,key] of [['boardMode','boardMode'],['boardDensity','boardDensity'],['project','project'],['browseProject','browseProject'],['browseMode','browseMode']]){
  if(saved[key]&&[...$(id).options].some(o=>o.value===saved[key]))$(id).value=saved[key];
 }
 return workspaceSprints().some(s=>s.id===(saved.workspaceSprints?.[activeWorkspaceId]||saved.sprint))?(saved.workspaceSprints?.[activeWorkspaceId]||saved.sprint):'';
}
function populateBrowseProjects(){
 const select=$('browseProject'),old=select.value;
 select.replaceChildren(new Option('Choose a project',''));
 projects.filter(x=>projectVisibility.includes(x.id)).sort((a,b)=>a.name.localeCompare(b.name)).forEach(x=>select.add(new Option(x.name,x.name)));
 if([...select.options].some(x=>x.value===old))select.value=old;
}
function browseNotice(message,error=false){$('browseStatus').textContent=message;$('browseStatus').style.color=error?'var(--pn-error,#b42318)':'';}
async function browseBacklog(){
 const project=$('browseProject').value,sequence=++browserSequence;
 if(!project){browseNotice('Choose an included project.',true);return;}
 if(browserBusy)return;
 browserBusy=true;$('browseLoad').disabled=true;browserNoticeReset();
 try{
  const escaped=project.replace(/'/g,"''");
  const wiql={query:`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${escaped}' AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC`};
  const result=await api(`/${encodeURIComponent(project)}/_apis/wit/wiql?$top=${MAX_ITEMS}&api-version=7.1`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(wiql)});
  const ids=(result.workItems||[]).slice(0,MAX_ITEMS).map(x=>x.id),found=[];
  for(let i=0;i<ids.length;i+=100){
   const result=await api('/_apis/wit/workitemsbatch?api-version=7.1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids.slice(i,i+100),$expand:'Relations',errorPolicy:'Omit'})});
   for(const x of result.value||[]){
    const item=normalizeItem(x);
    const parent=(x.relations||[]).find(r=>r.rel==='System.LinkTypes.Hierarchy-Reverse');
    const match=parent?.url?.match(/\/(\d+)(?:\?.*)?$/);
    item.parentId=match?Number(match[1]):null;
    found.push(item);
   }
  }
  if(sequence!==browserSequence)return;
  browserItems=found;browserSelection.clear();renderBrowser();
  browseNotice(`Showing ${found.length} recently changed work items from ${project}${(result.workItems||[]).length>=MAX_ITEMS?' (first 200; refine using search for older items)':''}. Add and Remove save immediately.`);
 }catch(e){browseNotice('Unable to browse backlog: '+e.message,true);}
 finally{browserBusy=false;$('browseLoad').disabled=false;}
}
function browserNoticeReset(){browseNotice('Loading project backlog and parent-child relationships…');$('browseResults').replaceChildren();}
function renderBrowser(){
 const root=$('browseResults');root.replaceChildren();
 if(!browserItems.length){root.textContent='No items loaded. Select a project and choose Browse backlog.';return;}
 updateBulkToolbar();
 const sprint=currentSprint(),tree=$('browseMode').value==='hierarchy',map=new Map(browserItems.map(x=>[x.id,x]));
 const children=new Map(),roots=[];
 for(const item of browserItems){
  if(tree&&item.parentId&&item.parentId!==item.id&&map.has(item.parentId)){
   if(!children.has(item.parentId))children.set(item.parentId,[]);
   children.get(item.parentId).push(item);
  }else roots.push(item);
 }
 const makeEntry=item=>{
  const row=document.createElement('div');row.className='browse-entry';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='browse-select';checkbox.setAttribute('aria-label',`Select work item ${item.id}`);checkbox.checked=browserSelection.has(item.id);checkbox.disabled=!sprint||bulkBusy;checkbox.onchange=()=>{if(checkbox.checked)browserSelection.add(item.id);else browserSelection.delete(item.id);updateBulkToolbar();};
  const title=document.createElement('span');title.className='browse-title';
  const a=document.createElement('a');a.textContent=`#${item.id}`;a.href=item.url||`${organizationApiBase()}/${encodeURIComponent(item.project)}/_workitems/edit/${item.id}`;a.target='_blank';a.rel='noopener noreferrer';
  title.append(a,document.createTextNode(` ${item.title} `));
  const meta=document.createElement('span');meta.className='muted';meta.textContent=`${item.type} · ${item.state}`;
  const btn=document.createElement('button');btn.className='secondary';
  const included=!!sprint?.itemIds.includes(item.id);btn.textContent=included?'Remove':'Add to sprint';btn.disabled=!sprint;
  btn.onclick=async()=>{btn.disabled=true;await toggleItem(item.id);renderBrowser();};
  row.append(checkbox,title,meta,btn);return row;
 };
 const build=(item,depth,seen)=>{
  if(seen.has(item.id)||depth>25)return document.createTextNode('');
  const next=new Set(seen);next.add(item.id);
  const kids=children.get(item.id)||[];
  if(!kids.length)return makeEntry(item);
  const details=document.createElement('details');details.open=depth<2;
  const summary=document.createElement('summary');summary.append(makeEntry(item));
  details.append(summary);
  for(const kid of kids)details.append(build(kid,depth+1,next));
  return details;
 };
 if(tree)root.classList.add('browse-tree');else root.classList.remove('browse-tree');
 for(const item of roots)root.append(tree?build(item,0,new Set()):makeEntry(item));
}

function updateBulkToolbar(){
 const bar=$('browseBulkToolbar');if(!bar)return;
 const n=browserSelection.size,s=currentSprint();
 $('browseSelectedCount').textContent=`${n} selected`;
 for(const id of ['browseBulkAdd','browseBulkRemove','browseClearSelection'])$(id).disabled=bulkBusy||!n||(id!=='browseClearSelection'&&!s);
 $('browseSelectAll').disabled=bulkBusy||!s||!browserItems.length;
 bar.setAttribute('aria-busy',String(bulkBusy));
}
async function bulkAssign(add){
 if(bulkBusy||!browserSelection.size)return;
 let sprint;try{sprint=requireSprint();}catch(e){return notify(e.message,true);}
 if(!(await guardSprint()))return;
 const ids=[...browserSelection];bulkBusy=true;updateBulkToolbar();
 try{
  const changed=ids.filter(id=>add?!sprint.itemIds.includes(id):sprint.itemIds.includes(id));
  if(!changed.length){notify('All selected items already have the requested sprint membership.');return;}
  const selected=new Set(changed);
  const ok=await persist(r=>{
   const target=r.sprints.find(x=>x.id===sprint.id);
   if(!target)throw Error('Selected sprint is no longer available.');
   target.itemIds=add?[...new Set([...target.itemIds,...changed])]:target.itemIds.filter(id=>!selected.has(id));
  });
  if(ok){browserSelection.clear();await loadAssignedItems();notify(`${changed.length} work item(s) ${add?'added to':'removed from'} the sprint.`);}
 }catch(e){notify('Unable to update selected work items: '+e.message,true);}
 finally{bulkBusy=false;renderBrowser();}
}
function initBulkControls(){
 $('browseSelectAll').onclick=()=>{for(const item of browserItems)browserSelection.add(item.id);renderBrowser();};
 $('browseClearSelection').onclick=()=>{browserSelection.clear();renderBrowser();};
 $('browseBulkAdd').onclick=()=>bulkAssign(true);
 $('browseBulkRemove').onclick=()=>bulkAssign(false);
 updateBulkToolbar();
}
initBulkControls();
async function init(){try{
  sdk=sdkModule;
  sdk.init({loaded:false,applyTheme:true});await sdk.ready();context=sdk.getHost();m365Identity();
  // ADO hub readiness must not depend on organization queries or board restoration.
  sdk.notifyLoadSucceeded();notify('Connecting to organization data…');
  // Session recovery is independent of Azure DevOps data initialization.
  void m365RestoreSession();
  token=await sdk.getAccessToken();if(!token)throw Error('Azure DevOps did not provide an access token.');roomRestoreVerified();renderRoomStatus();void checkRoom('entitlement');
  const service=await sdk.getService('ms.vss-features.extension-data-service');storage=await service.getExtensionDataManager(sdk.getExtensionContext().id,token);
  try{registry=await storage.getDocument(COLLECTION,ROOT);}catch(e){if(e.status!==404 && !/404|not found/i.test(String(e.message)))throw e;registry={id:ROOT,sprints:[]};}
  await loadProjects();
  await migrateWorkspaces();
  contextKey='pnpc-gs-ui:'+encodeURIComponent(organizationApiBase())+':'+encodeURIComponent(sdk.getUser?.()?.id||'anonymous');
  const savedWorkspace=readContext().workspace;const restoredTab=readContext().activeTab; if(GS_VALID_TABS.includes(restoredTab)&&restoredTab!==requestedTab){requestedTab=restoredTab;showTab(restoredTab,false);}renderWorkspacePicker(savedWorkspace);syncWorkspaceProjects();renderWorkspaceConfiguration();populateBrowseProjects();const lastSprint=restoreContext();
  renderSprintPicker(lastSprint);document.body.classList.remove('gs-initializing');syncPlanScope();renderWorkspaceSchedules();renderDeletionAudit();renderBoard();renderHistory();notify('Connected. Restoring assigned work items…');
  // Work-item hydration is independent of the extension host load handshake.
  void loadAssignedItems().catch(e=>{diagnostic('startup.board_restore_failed',{message:String(e.message||e)},'error');notify('Board restoration failed: '+e.message,true);});
}catch(e){document.body.classList.remove('gs-initializing');diagnostic('startup.failed',{message:String(e.message||e)},'error');notify('Global Sprints initialization failed: '+e.message,true);try{sdk?.notifyLoadFailed(e.message);}catch{}}}
async function loadProjects(){
 const data=await api('/_apis/projects?stateFilter=wellFormed&$top=200&api-version=7.1');
 projects=data.value||[];
 // Persist organization-wide project inclusion without changing source projects.
 // New projects are included by default; an explicit empty list remains valid.
 const saved=registry.includedProjectIds;
 projectVisibility=Array.isArray(saved)?saved.filter(id=>projects.some(p=>p.id===id)):projects.map(p=>p.id);
 savedProjectVisibility=projectForm();renderProjectSelectors();updateDirty();
}
function renderProjectSelectors(){
 const selector=$('project'),selected=selector.value;
 selector.replaceChildren(new Option('All included projects',''));
 projects.filter(p=>projectVisibility.includes(p.id)).sort((a,b)=>a.name.localeCompare(b.name)).forEach(p=>selector.add(new Option(p.name,p.name)));
 selector.value=[...selector.options].some(o=>o.value===selected)?selected:'';
 const included=$('includedProjects'),excluded=$('excludedProjects');
 included.replaceChildren();excluded.replaceChildren();
 projects.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(p=>{
   (projectVisibility.includes(p.id)?included:excluded).add(new Option(p.name,p.id));
 });
 populateBrowseProjects();
 renderWorkspaceConfiguration();
 $('projectCount').textContent=`${projectVisibility.length} included · ${projects.length-projectVisibility.length} excluded`;
}
function moveProjects(include){
 const from=$(include?'excludedProjects':'includedProjects');
 const ids=new Set([...from.selectedOptions].map(o=>o.value));
 if(!ids.size){notify('Select one or more projects to move.');return;}
 const next=include?[...new Set([...projectVisibility,...ids])]:projectVisibility.filter(id=>!ids.has(id));
 projectVisibility=next;
 renderProjectSelectors();
 updateDirty();notify('Project selection changed. Save to keep these changes.');
}
async function saveProjectPreferences(){
 const nextIds=[...projectVisibility];
 if(!projectsDirty()){notify('Project selection is already saved.');return true;}
 const ok=await persist(r=>{r.workspaces.find(w=>w.id===activeWorkspaceId).projectIds=nextIds;},false);
 if(ok){savedProjectVisibility=projectForm();updateDirty();renderWorkspaceConfiguration();renderWorkspacePicker(activeWorkspaceId);notify('Workspace project selection saved.');}
 return ok;
}
function renderSprintPicker(preferred){const p=$('sprintPicker');const selected=preferred||p.value;p.replaceChildren(new Option('Select a sprint',''));workspaceSprints().forEach(s=>p.add(new Option(s.name,s.id)));p.value=workspaceSprints().some(s=>s.id===selected)?selected:'';activeSprintId=p.value;renderSprintFields();if($('planScope'))syncPlanScope();rememberContext();}
function renderSprintFields(){const s=registry.sprints.find(x=>x.id===$('sprintPicker').value);$('sprintName').value=s?.name||'';$('start').value=s?.start||'';$('end').value=s?.end||'';$('goal').value=s?.goal||'';$('status').value=s?.status||'Planning';savedSprintForm=sprintForm();updateDirty();renderGuidance();renderBacklog();renderBrowser();renderBoard();renderHistory();renderCeremonies();renderWorkspaceSchedules();renderSprintHealth();renderPmAssistance();renderDeletionAudit();renderBoardDrafts();}
async function persist(change,render=true){
 if(busy){notify('An operation is already in progress. Please wait.',true);return false;}
 busy=true;notify('Saving changes…');
 try{
  // Reject stale edits rather than silently replacing another user's registry changes.
  // The extension-data service ETag on setDocument provides the final atomic check.
  let latest;
  try{latest=await storage.getDocument(COLLECTION,ROOT);}catch(e){if(e.status!==404&&!/404|not found/i.test(String(e.message)))throw e;latest=null;}
  if(latest&&registry.__etag!==latest.__etag){
   throw Error('Another team member saved changes since you loaded this page. Refresh Global Sprints to load their changes before saving yours.');
  }
  if(!latest&&registry.__etag!==undefined)throw Error('The shared registry changed or was removed. Refresh before saving.');
  const next=structuredClone(registry);await change(next);if(registry.__etag!==undefined)next.__etag=registry.__etag;
  const saved=await storage.setDocument(COLLECTION,next);registry=saved;
 if(render)renderSprintPicker($('sprintPicker').value);
 notify('Changes saved successfully.');return true;
 }catch(e){notify('Save failed: '+e.message+' Reload before retrying if another user changed this record.',true);return false;}
 finally{busy=false;}
}
async function newSprint(){openNewSprintDialog();}
async function saveSprint(){
 const name=$('sprintName').value.trim(),start=$('start').value,end=$('end').value,goal=$('goal').value.trim(),status=$('status').value;
 if(!name){notify('Sprint name is required.',true);return false;}
 if(start&&end&&start>end){notify('End date must not precede start date.',true);return false;}
 const selected=$('sprintPicker').value;
 const existing=registry.sprints.find(x=>x.id===selected);
 if(existing&&!sprintDirty()){notify('Sprint is already saved. No changes needed.');return true;}
 const id=existing?.id||crypto.randomUUID();
 const ok=await persist(r=>{const target=r.sprints.find(x=>x.id===id);
 if(target)Object.assign(target,{name,start,end,goal,status});
 else r.sprints.push({id,workspaceId:activeWorkspaceId,name,start,end,goal,status,itemIds:[],snapshots:[]});
 },false);
 if(ok){renderSprintPicker(id);syncPlanScope();await loadAssignedItems();notify(`Sprint "${name}" saved successfully.`);}
 return ok;
}
// Sprint selection is personal UI context; sprint membership and execution are shared.
// Always reload the organization registry before switching to another member's sprint.
async function refreshSharedRegistryForExecution(){
 const latest=await storage.getDocument(COLLECTION,ROOT);
 if(!latest||!Array.isArray(latest.sprints)||!Array.isArray(latest.workspaces))throw Error('Shared workspace data is unavailable. No local assignments were changed.');
 registry=latest;
 return latest;
}
async function switchSprint(){
 if(switchingSprint)return;switchingSprint=true;
 const destination=$('sprintPicker').value;
 $('sprintPicker').value=activeSprintId;
 try{if(!(await guardSprint())){notify('Sprint switch cancelled.');return;}
 await refreshSharedRegistryForExecution();
 if(destination&&!workspaceSprints().some(s=>s.id===destination))throw Error('That sprint is no longer available in this workspace. Refresh the workspace selection.');
 $('sprintPicker').value=destination;activeSprintId=destination;renderSprintFields();syncPlanScope();rememberContext();await loadAssignedItems();notify(destination?'Sprint opened with current shared assignments.':'Sprint selection cleared.');
 }catch(e){$('sprintPicker').value=activeSprintId;notify('Unable to open shared sprint: '+e.message,true);}
 finally{switchingSprint=false;}
}
async function toggleProjectManager(){
 const panel=$('projectManager'),opened=panel.classList.contains('hidden');
 if(!opened&&!(await guardProjects())){notify('Project configuration remains open.');return;}
 panel.classList.toggle('hidden',!opened);
 $('manageProjects').setAttribute('aria-expanded',String(opened));
 $('manageProjects').textContent=opened?'Hide project configuration ▴':'Configure included / excluded projects ▾';
 notify(opened?'Project configuration opened.':'Project configuration closed.');
}
async function loadItems(){try{if(!workspaceSprints().length)throw Error('Create a sprint in this workspace first.');notify('Loading work items…');const names=$('project').value?[$('project').value]:projects.filter(p=>projectVisibility.includes(p.id)).map(p=>p.name);if(!names.length)throw Error('No included projects. Open Manage projects to include at least one.');const collected=[];for(const name of names){const escaped=name.replace(/'/g,"''");const state=$('stateFilter').value==='active'?" AND [System.State] NOT IN ('Closed','Removed')":'';const wiql={query:`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${escaped}'${state} ORDER BY [System.ChangedDate] DESC`};const r=await api(`/${encodeURIComponent(name)}/_apis/wit/wiql?$top=${MAX_ITEMS}&api-version=7.1`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(wiql)});const ids=(r.workItems||[]).slice(0,MAX_ITEMS).map(x=>x.id);for(let i=0;i<ids.length;i+=200){const detail=await api(`/_apis/wit/workitems?ids=${ids.slice(i,i+200).join(',')}&fields=System.Id,System.Title,System.TeamProject,System.State,System.AssignedTo,System.WorkItemType&api-version=7.1`);collected.push(...(detail.value||[]).map(x=>({id:x.id,rev:x.rev,project:x.fields['System.TeamProject'],title:x.fields['System.Title'],state:x.fields['System.State'],type:x.fields['System.WorkItemType'],assignee:x.fields['System.AssignedTo']?.displayName||'Unassigned',url:x._links?.html?.href||''})));}}
items=collected;renderBacklog();renderBoard();rememberContext();notify(`Loaded ${items.length} work items across ${names.length} project(s).`);
}catch(e){notify(e.message,true);}}
function searchCandidates(){
 const query=$('search').value.trim().toLowerCase();
 if(!query)return [];
 const digits=/^#?(\d+)$/.exec(query)?.[1];
 const all=new Map([...items,...nearbyResults].map(w=>[w.id,w]));
 return [...all.values()].map(w=>{
  const title=w.title.toLowerCase(), id=String(w.id);
  const exact=id===digits?0:title===query?1:title.startsWith(query)?2:title.includes(query)?3:id.includes(query)?4:10;
  const distance=digits?Math.abs(w.id-Number(digits)):0;
  return {w,rank:digits?(distance<=10?distance:exact+20):exact};
 }).filter(x=>x.rank<30).sort((a,b)=>a.rank-b.rank||b.w.id-a.w.id).slice(0,12).map(x=>x.w);
}
function renderSuggestions(){
 const target=$('searchSuggestions'),query=$('search').value.trim();target.replaceChildren();
 if(!query){target.classList.add('hidden');$('search').setAttribute('aria-expanded','false');return;}
 const matches=searchCandidates();
 for(const w of matches){
  const b=document.createElement('button');b.type='button';b.setAttribute('role','option');
  const main=document.createElement('span');main.textContent=`#${w.id} · ${w.title}`;
  const sub=document.createElement('span');sub.className='muted';sub.textContent=`${w.project} · ${w.state}`;
  b.append(main,sub);b.onclick=()=>{if(!items.some(x=>x.id===w.id))items.push(w);$('search').value=String(w.id);nearbyResults=[];renderBacklog();renderBoard();renderSuggestions();target.classList.add('hidden');};target.append(b);
 }
 if(!matches.length){const hint=document.createElement('div');hint.className='hint';hint.textContent='No matches yet. Load work items or try another term.';target.append(hint);}
 target.classList.remove('hidden');$('search').setAttribute('aria-expanded','true');
}
async function lookupNearbyIds(value){
 const match=/^#?(\d{2,8})$/.exec(value.trim());if(!match){nearbyResults=[];renderSuggestions();return;}
 const n=Number(match[1]),sequence=++searchSequence;
 const ids=[];for(let id=Math.max(1,n-5);id<=n+5;id++)ids.push(id);
 try{
  const response=await api(`/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Id,System.Title,System.TeamProject,System.State,System.AssignedTo,System.WorkItemType&errorPolicy=Omit&api-version=7.1`);
  if(sequence!==searchSequence)return;
  const allowed=new Set(projects.filter(p=>projectVisibility.includes(p.id)).map(p=>p.name));
  nearbyResults=(response.value||[]).filter(x=>allowed.has(x.fields['System.TeamProject'])).map(x=>({id:x.id,rev:x.rev,project:x.fields['System.TeamProject'],title:x.fields['System.Title']||'',state:x.fields['System.State']||'',type:x.fields['System.WorkItemType']||'',assignee:x.fields['System.AssignedTo']?.displayName||'Unassigned',url:x._links?.html?.href||''}));
 }catch{if(sequence!==searchSequence)return;nearbyResults=[];}
 renderSuggestions();
}
function handleSearch(){
 clearTimeout(searchTimer);searchSequence++;nearbyResults=[];renderBacklog();renderSuggestions();
 if(/^#?\d{2,8}$/.test($('search').value.trim()))searchTimer=setTimeout(()=>lookupNearbyIds($('search').value),350);
}
function renderBacklog(){const body=$('backlog');body.replaceChildren();const q=$('search').value.toLowerCase().replace(/^#/,'');const s=registry?.sprints.find(x=>x.id===$('sprintPicker').value);for(const w of items.filter(x=>`${x.id} ${x.title} ${x.project} ${x.assignee}`.toLowerCase().includes(q))){const tr=document.createElement('tr');tr.innerHTML=`<td><a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer">#${w.id}</a> ${escapeHtml(w.title)}</td><td>${escapeHtml(w.project)}</td><td>${escapeHtml(w.assignee)}</td><td>${escapeHtml(w.state)}</td><td></td>`;const b=document.createElement('button');b.className=s?.itemIds.includes(w.id)?'secondary':'';b.textContent=s?.itemIds.includes(w.id)?'Remove':'Add';b.disabled=!s;b.onclick=()=>toggleItem(w.id);tr.lastElementChild.append(b);body.append(tr);}if(!body.children.length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="5">No matching loaded work items.</td>';body.append(tr);}}
async function toggleItem(id){let s;try{s=requireSprint();}catch(e){return notify(e.message,true);}if(!(await guardSprint()))return;const wasIncluded=s.itemIds.includes(id);const ok=await persist(r=>{const t=r.sprints.find(x=>x.id===s.id);t.itemIds=t.itemIds.includes(id)?t.itemIds.filter(x=>x!==id):[...t.itemIds,id];});if(ok){await loadAssignedItems();renderBrowser();notify(`Work item #${id} ${wasIncluded?'removed from':'added to'} the sprint.`);}}
async function loadAssignedItems(){
 const seq=++assignedLoadSequence;
 const s=registry?.sprints.find(x=>x.id===$('sprintPicker').value);
 const ids=[...new Set(s?.itemIds||[])];
 assignedItems=[];ancestorItems=[];renderGuidance();
 if(!ids.length){renderBoard();renderSprintHealth();renderTimeline();renderPmAssistance();return;}
 notify(`Restoring ${ids.length} assigned work item(s)…`);
 try{
  const found=[];
  for(let i=0;i<ids.length;i+=200){
   const response=await api('/_apis/wit/workitemsbatch?api-version=7.1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids.slice(i,i+200),errorPolicy:'Omit'})});
   found.push(...(response.value||[]).map(normalizeItem));
  }
  if(seq!==assignedLoadSequence)return;
  assignedItems=found;diagnostic('ado.items_loaded',{assigned:ids.length,loaded:found.length,unavailable:ids.length-found.length,operation:'restore_assigned'});renderGuidance();
  await enrichHierarchy(found,seq);
  if(seq!==assignedLoadSequence)return;
  renderBoard();renderSprintHealth();renderTimeline();renderPmAssistance();diagnosticCoverage();
  void autoReportObservation(s,found);
  const missing=ids.length-found.length;
  if(missing)notify(`Restored ${found.length} board item(s); ${missing} could not be retrieved.`,true);
  else notify(`Restored ${found.length} assigned board item(s).`);
 }catch(e){if(seq!==assignedLoadSequence)return;notify('Unable to restore assigned board items: '+e.message,true);renderBoard();}
}

// Parent-child relations are read from ADO, never inferred from names or local sprint structure.
async function enrichHierarchy(found,sequence){
 const seen=new Map(found.map(w=>[w.id,w])), contextual=[];
 let frontier=[...found];
 for(let depth=0;depth<12&&frontier.length;depth++){
  if(sequence!==assignedLoadSequence)return;
  const nextIds=new Set();
  for(const w of frontier){
   try{
    const record=await api(`/_apis/wit/workitems/${w.id}?$expand=Relations&api-version=7.1`);
    const relation=(record.relations||[]).find(r=>r.rel==='System.LinkTypes.Hierarchy-Reverse');
    const match=relation?.url?.match(/\/(\d+)(?:\?.*)?$/);
    w.parentId=match?Number(match[1]):null;
    if(w.parentId&&!seen.has(w.parentId))nextIds.add(w.parentId);
   }catch(e){console.warn('Unable to resolve parent for work item',w.id,e);}
  }
  if(!nextIds.size)break;
  const next=[];
  for(const id of nextIds){
   try{
    const record=await api(`/_apis/wit/workitems/${id}?api-version=7.1`);
    const w=normalizeItem(record);w.contextOnly=true;seen.set(w.id,w);contextual.push(w);next.push(w);
   }catch(e){console.warn('Unable to load ancestor',id,e);}
  }
  frontier=next;
 }
 ancestorItems=contextual;
}
function normalizeItem(x){const f=x.fields||{};return {id:x.id,rev:x.rev,project:f['System.TeamProject'],title:f['System.Title']||'',state:f['System.State']||'',type:f['System.WorkItemType']||'',assignee:f['System.AssignedTo']?.displayName||'Unassigned',assigneeIdentity:f['System.AssignedTo']?.uniqueName||'',priority:f['Microsoft.VSTS.Common.Priority']??null,effort:f['Microsoft.VSTS.Scheduling.StoryPoints']??f['Microsoft.VSTS.Scheduling.Effort']??null,storyPoints:f['Microsoft.VSTS.Scheduling.StoryPoints']??null,effortField:f['Microsoft.VSTS.Scheduling.StoryPoints']!==undefined?'Microsoft.VSTS.Scheduling.StoryPoints':f['Microsoft.VSTS.Scheduling.Effort']!==undefined?'Microsoft.VSTS.Scheduling.Effort':null,startDate:String(f['Microsoft.VSTS.Scheduling.StartDate']||'').slice(0,10),targetDate:String(f['Microsoft.VSTS.Scheduling.TargetDate']||'').slice(0,10),dueDate:String(f['Microsoft.VSTS.Scheduling.DueDate']||'').slice(0,10),description:f['System.Description']||'',acceptanceCriteria:f['Microsoft.VSTS.Common.AcceptanceCriteria']??null,changedDate:f['System.ChangedDate']||'',url:x._links?.html?.href||''};}
function currentSprint(){return registry?.sprints.find(x=>x.id===$('sprintPicker').value);}
// Planning drafts are workspace-owned snapshots of Global Sprints coordination only.
// They never write work item states or iteration paths back to Azure DevOps.
function boardDrafts(){return activeWorkspace()?.boardDrafts||[];}
function renderBoardDrafts(){
 const selector=$('boardDraftPicker');if(!selector)return;
 const previous=selector.value;selector.replaceChildren(new Option('Choose saved draft',''));
 boardDrafts().forEach(d=>selector.add(new Option(`${d.name} · ${new Date(d.savedAt).toLocaleDateString()} · ${d.itemIds.length} items`,d.id)));
 selector.value=boardDrafts().some(d=>d.id===previous)?previous:'';
 $('boardDraftCount').textContent=`${boardDrafts().length}/10 workspace drafts`;
}
async function saveBoardDraft(){
 const sp=currentSprint(),w=activeWorkspace();if(!sp||!w)return notify('Select a sprint first.',true);
 const drafts=boardDrafts();if(drafts.length>=10)return notify('This workspace already has 10 drafts. Delete a draft to save another.',true);
 const name=prompt('Name this planning draft:',`${sp.name} · Draft ${drafts.length+1}`)?.trim();if(!name)return;
 const now=new Date().toISOString(),draft={id:crypto.randomUUID(),name:name.slice(0,120),savedAt:now,sourceSprintId:sp.id,itemIds:[...(sp.itemIds||[])],itemLanes:structuredClone(sp.itemLanes||{}),blockedItems:structuredClone(sp.blockedItems||{}),customLanes:structuredClone(sp.customLanes||[]),laneMappings:structuredClone(sp.laneMappings||{})};
 const ok=await persist(r=>{const target=r.workspaces.find(x=>x.id===w.id);target.boardDrafts||=[];if(target.boardDrafts.length>=10)throw Error('Draft limit reached.');target.boardDrafts.push(draft);},false);
 if(ok){renderBoardDrafts();$('boardDraftPicker').value=draft.id;try{const stored=await storage.getDocument(COLLECTION,ROOT);if(!stored.workspaces?.find(x=>x.id===w.id)?.boardDrafts?.some(x=>x.id===draft.id))throw Error('Draft was not found in saved registry.');registry=stored;renderBoardDrafts();$('boardDraftPicker').value=draft.id;notify('Planning draft saved and verified. Azure DevOps work items were not changed.');}catch(e){notify('Draft save could not be verified: '+e.message,true);}}
}
async function resetSprintBoard(){
 const sp=currentSprint();if(!sp)return notify('Select a sprint first.',true);
 if(!confirm(`Reset the board for "${sp.name}"?\n\nThis removes ${sp.itemIds?.length||0} sprint assignments, blocked flags and card lane overrides. Azure DevOps work items and their workflow states remain unchanged.\n\nSave a planning draft first if you want to revisit this arrangement.`))return;
 const ok=await persist(r=>{const target=r.sprints.find(x=>x.id===sp.id);target.itemIds=[];target.itemLanes={};target.blockedItems={};},false);
 if(ok){assignedItems=[];renderSprintFields();renderBoardDrafts();notify('Sprint board reset. Host-project work items were not changed.');}
}
async function restoreBoardDraft(){
 const sp=currentSprint(),d=boardDrafts().find(x=>x.id===$('boardDraftPicker').value);if(!sp||!d)return notify('Select a sprint and a draft.',true);
 if(!confirm(`Restore "${d.name}" into "${sp.name}"?\n\nThis replaces the sprint's ${sp.itemIds?.length||0} current assignments with ${d.itemIds.length} saved assignments and restores card lanes and blockers. Azure DevOps workflow states remain unchanged.`))return;
 const ok=await persist(r=>{const t=r.sprints.find(x=>x.id===sp.id);t.itemIds=[...d.itemIds];t.itemLanes=structuredClone(d.itemLanes||{});t.blockedItems=structuredClone(d.blockedItems||{});t.customLanes=structuredClone(d.customLanes||[]);t.laneMappings=structuredClone(d.laneMappings||{});},false);
 if(ok){await loadAssignedItems();renderSprintFields();renderBoardDrafts();notify('Planning draft restored. No Azure DevOps states changed.');}
}
// Draft deletion must be confirmed against the organization-scoped persisted registry.
// Do not report success solely because setDocument returned without throwing.
async function deleteBoardDraft(){
 const selectedId=$('boardDraftPicker').value;
 const w=activeWorkspace(),d=boardDrafts().find(x=>x.id===selectedId);
 if(!d||!w)return notify('Choose a draft to delete.',true);
 const workspaceId=w.id;
 if(!confirm(`Delete planning draft "${d.name}"? This does not change any sprint.`))return;
 const ok=await persist(r=>{
  const target=r.workspaces?.find(x=>x.id===workspaceId);
  if(!target)throw Error('The workspace no longer exists.');
  const before=target.boardDrafts||[];
  if(!before.some(x=>x.id===selectedId))throw Error('The selected draft no longer exists. Refresh the page.');
  target.boardDrafts=before.filter(x=>x.id!==selectedId);
  if(target.boardDrafts.length!==before.length-1)throw Error('Draft deletion did not remove exactly one record.');
 },false);
 if(!ok)return;
 // Successful setDocument updates the local registry. Refresh the picker immediately.
 renderBoardDrafts();
 $('boardDraftPicker').value='';
 try{
  // Fetch the authoritative stored record instead of relying on the in-memory array.
  const persisted=await storage.getDocument(COLLECTION,ROOT);
  const storedWorkspace=persisted?.workspaces?.find(x=>x.id===workspaceId);
  if(!storedWorkspace)throw Error('Workspace not found in saved registry.');
  registry=persisted;
  if((storedWorkspace.boardDrafts||[]).some(x=>x.id===selectedId)){
   renderBoardDrafts();
   notify('The draft is still present in saved organization data. Deletion could not be confirmed; refresh and retry.',true);
   return;
  }
  // Rebuild the actual options immediately, without waiting for a page refresh.
  renderBoardDrafts();
  $('boardDraftPicker').value='';
  $('boardDraftCount').textContent=`${(storedWorkspace.boardDrafts||[]).length}/10 workspace drafts`;
  notify(`Planning draft "${d.name}" deleted and verified in saved organization data.`);
 }catch(e){
  notify('Draft deletion could not be verified against saved organization data: '+e.message+'. Refresh to check its status.',true);
 }
}

const LANE_PRESETS={'Backlog / Planned':'To Do','Ready to Start':'To Do','Active Work':'In Progress','Blocked':'In Progress','Waiting on Client':'In Progress','Review / Testing':'In Progress','Completed':'Done','Closed / Archived':'Closed'};
const LANE_CATEGORIES=['To Do','In Progress','Done','Closed'];
let diagnosticEvents=[];const DIAG_KEY='pnpc-global-sprints-diagnostics-v2';
const DIAG_LIMIT=600;
const DIAG_VERSION='0.9.23';
let diagnosticSessionId='';
// Production diagnostic payloads are deliberately numeric/boolean or finite enums.
// Free-form strings (including messages and exception text) must never be exported.
const DIAGNOSTIC_SAFE_FIELDS=new Set(['status','method','durationMs','assigned','unavailable','loaded','missing','count','checkCount','failed','warnings','version','projectCount','itemCount','snapshotCount','success','connected','enabled','state']);
const DIAGNOSTIC_ENUMS={method:new Set(['GET','POST','PUT','PATCH','DELETE']),state:new Set(['connected','disconnected','pending','active','inactive','expired','unknown'])};
function safeDiagnosticDetails(details){
 const out={};
 for(const [key,value] of Object.entries(details||{})){
  if(!DIAGNOSTIC_SAFE_FIELDS.has(key))continue;
  if(typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))out[key]=value;
  else if(typeof value==='string'&&DIAGNOSTIC_ENUMS[key]?.has(value))out[key]=value;
  else if(key==='version'&&typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value))out[key]=value;
 }
 return out;
}
// Revalidate historical browser records before displaying or exporting them.
// Older releases permitted arbitrary free text in diagnostic details.
function sanitizedDiagnosticEvent(raw){
 if(!raw||typeof raw!=='object')return null;
 const kind=typeof raw.kind==='string'&&/^[a-z][a-z0-9._-]{0,89}$/.test(raw.kind)?raw.kind:'legacy.event';
 const severity=['info','warn','error'].includes(raw.severity)?raw.severity:'info';
 const at=typeof raw.at==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(raw.at)&&!Number.isNaN(Date.parse(raw.at))?new Date(raw.at).toISOString():null;
 return {at,kind,severity,details:safeDiagnosticDetails(raw.details)};
}
function diagnostic(kind,details={},severity='info'){
 const event={at:new Date().toISOString(),session:diagnosticSessionId,kind:/^[a-z][a-z0-9._-]{0,89}$/.test(String(kind))?String(kind):'app.event',severity:['info','warn','error'].includes(severity)?severity:'info',details:safeDiagnosticDetails(details)};
 diagnosticEvents.push(event);diagnosticEvents=diagnosticEvents.slice(-DIAG_LIMIT);
 try{localStorage.setItem(DIAG_KEY,JSON.stringify(diagnosticEvents));}catch(_){}renderDiagnostics();
}
function diagnosticAcceptance(){
 const events=diagnosticEvents.filter(e=>e.session===diagnosticSessionId);
 const kinds=new Set(events.map(e=>e.kind));
 const coverage=events.filter(e=>e.kind==='reports.coverage').at(-1)?.details||{};
 const has=(kind)=>kinds.has(kind);
 const checks=[
  {name:'ADO assigned-item loading',status:has('ado.items_loaded')?'observed':'not tested'},
  {name:'Full sprint coverage',status:coverage.assigned!==undefined?(coverage.unavailable===0?'pass':'needs attention'):'not tested'},
  {name:'Live state write',status:has('ado.state_update.success')?'observed':has('ado.state_update.failure')?'failed':'not tested'},
  {name:'Live date write',status:has('ado.timeline_update_success')?'observed':has('ado.timeline_update_failure')?'failed':'not tested'},
  {name:'Inbound ADO refresh',status:has('ado.refresh.failed')?'failed':has('ado.refresh.completed')?'observed':'not tested'},
  {name:'Automatic observation',status:has('reports.observation.failed')?'failed':has('reports.observation.saved')?'observed':has('reports.observation.already_recorded')?'previously captured':'not tested'},
  {name:'Demo edit/recalculation',status:has('demo.ticket.saved')?'observed':'not tested'},
  {name:'Demo scenario load',status:has('demo.scenario.loaded')?'observed':'not tested'}
 ];
 return {checks,counts:{events:events.length,warnings:events.filter(e=>e.severity==='warn').length,errors:events.filter(e=>e.severity==='error').length},coverage};
}
function diagnosticCoverage(){
 const s=currentSprint();if(!s)return;
 const ids=new Set(s.itemIds||[]),loaded=new Set(assignedItems.map(x=>x.id));
 const executable=assignedItems.filter(x=>!['Epic','Feature'].includes(x.type));
 const counts={assigned:ids.size,loaded:loaded.size,unavailable:[...ids].filter(id=>!loaded.has(id)).length,executable:executable.length,planningContext:assignedItems.length-executable.length,closed:executable.filter(x=>String(x.state).toLowerCase()==='closed').length,done:executable.filter(x=>String(x.state).toLowerCase()==='done').length,unscheduled:executable.filter(x=>!x.startDate&&!x.targetDate&&!x.dueDate).length};
 diagnostic('reports.coverage',counts,counts.unavailable?'warn':'info');
}
function renderDiagnostics(){
 const node=$('diagnosticStatus');if(node)node.textContent=`${diagnosticEvents.length} events (max ${DIAG_LIMIT}) · SDK ${sdk?'ready':'unavailable'} · Storage ${storage?'connected':'unavailable'} · ADO ${token?'authenticated':'unavailable'}`;
 const summary=$('diagnosticAcceptance');if(summary){const a=diagnosticAcceptance();summary.textContent='Current session · '+a.counts.events+' events · '+a.counts.warnings+' warnings · '+a.counts.errors+' errors\n'+a.checks.map(c=>c.status.toUpperCase()+' · '+c.name).join('\n');}
 const view=$('diagnosticRecent');if(view)view.textContent=diagnosticEvents.slice(-20).reverse().map(sanitizedDiagnosticEvent).filter(Boolean).map(e=>`${e.at||'Unknown time'}  ${e.severity.toUpperCase()}  ${e.kind}  ${JSON.stringify(e.details)}`).join('\n')||'No events captured yet.';
}
function downloadDiagnostics(){
 diagnosticCoverage();diagnostic('diagnostics.export',{eventCount:diagnosticEvents.length});
 const payload={schema:'pnpc.diagnostics.v4',product:'global-sprints',version:DIAG_VERSION,generatedAt:new Date().toISOString(),capabilities:{sdk:!!sdk,extensionStorage:!!storage,workItemApi:!!token},events:diagnosticEvents.map(sanitizedDiagnosticEvent).filter(Boolean)};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`global-sprints-support-diagnostics-${DIAG_VERSION}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function clearDiagnostics(){diagnosticEvents=[];try{localStorage.removeItem(DIAG_KEY);}catch(_){}diagnostic('diagnostics.cleared');}
function startDiagnosticSession(){diagnosticSessionId='session-'+Date.now().toString(36);diagnostic('diagnostics.session_started',{version:DIAG_VERSION});diagnosticCoverage();}

// One-click, read-only live trace plus isolated synthetic assertions. No mutation API calls.
let auditLastRun=null,auditRunning=false;

// v0.7.0: consistent action help. Native titles work on hover and accessible labels on focus.
function installActionHelp(){
 const help={
  wizardReset:'Discard the unsaved proposal and reset its form. Saved schedules and Outlook meetings stay intact.',
  wizardNext:'Continue to the next meeting proposal step. Nothing is saved yet.',wizardBack:'Return to the previous proposal step.',
  previewCeremonies:'Rebuild the unsaved meeting proposal from your current selections.',
  confirmCeremonies:'Save approved meetings as internal records. This does not send Outlook invitations.',
  capture:'Save a dated baseline of sprint commitments for future scope and progress comparisons.',
  reportRefresh:'Read current source work items from Azure DevOps and update reports.',
  reportObserve:'Save a dated progress observation. Burndown needs observations on different days.',
  reportExport:'Download the currently displayed report data as CSV.',
  resetSprintBoard:'Remove all assignments from this global sprint, not source work items or their states.',
  saveBoardDraft:'Save a recoverable copy of the current global sprint board.',
  restoreBoardDraft:'Restore a previously saved global sprint board draft.',
  auditRunButton:'Check extension health using read-only Azure DevOps checks and isolated synthetic calculations.',
  auditExportButton:'Export the most recent health check with evidence and coverage limitations.'
 };
 for(const button of document.querySelectorAll('button')){
  if(button.title||button.classList.contains('hidden'))continue;
  const label=(button.textContent||'').trim().replace(/\s+/g,' ');
  const explanation=help[button.id]|| (label?`${label}. This action applies to the current section; review any confirmation before changes are saved.`:'');
  if(explanation)button.title=explanation;
 }
}

function auditCheck(results,id,status,observed,expected='',detail=''){
 results.push({id,status,expected,observed,detail});
 diagnostic('audit.check',{checkId:id,status,detail:detail.slice(0,90)},status==='FAIL'?'error':status==='WARNING'?'warn':'info');
}
function auditRender(){
 const status=$('auditRunStatus'),output=$('auditRunResults');if(!status||!output)return;
 if(auditRunning){status.textContent='Diagnostic running. Read-only checks may take a few seconds.';return;}
 if(!auditLastRun){status.textContent='Not run yet. Live checks are read-only; synthetic checks are isolated.';output.textContent='';return;}
 const counts={};for(const c of auditLastRun.checks)counts[c.status]=(counts[c.status]||0)+1;
 const health=(counts.FAIL||0)?'ACTION REQUIRED':(counts.WARNING||0)?'REVIEW NEEDED':'CHECKS HEALTHY';
 status.textContent=`${health} · Completed ${auditLastRun.finishedAt} · ${auditLastRun.checks.length} checks · ${counts.PASS||0} PASS · ${counts.FAIL||0} FAIL · ${counts.WARNING||0} WARNING · ${counts.NOT_TESTED||0} NOT TESTED`;
 output.textContent=auditLastRun.checks.map(c=>`${c.status} · ${c.id}\n  Expected: ${c.expected||'N/A'}\n  Observed: ${c.observed}${c.detail?'\n  Note: '+c.detail:''}`).join('\n\n');
}

// Outlook-familiar meeting time picker: readable 12-hour options, canonical HH:mm values.
function populateMeetingTimePicker(input,selected='09:30'){
 // Native time input supports any minute; datalist provides quick quarter-hour choices.
 const value=String(selected||'09:30');
 input.value=/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?value:'09:30';
}
function initializeMeetingTimePickers(){
 for(const id of ['planTime','ceremonyTime']){
  const input=$(id);if(input)populateMeetingTimePicker(input,input.value||'09:30');
 }
}

async function runAutomatedAudit(){
 installActionHelp();
 if(auditRunning)return;
 auditRunning=true;const button=$('auditRunButton');if(button)button.disabled=true;auditRender();
 const checks=[],startedAt=new Date().toISOString();diagnostic('audit.run.started',{version:DIAG_VERSION});
 try{
  auditCheck(checks,'extension.capabilities',sdk&&storage&&token?'PASS':'WARNING',`SDK ${!!sdk}, storage ${!!storage}, ADO token ${!!token}`,'All capabilities available');
  const tooltipTargets=[...document.querySelectorAll('#tab-board button,#tab-planning button,#tab-reports button')].filter(b=>!b.classList.contains('hidden')); // Audit inactive tabs too; tab panels are intentionally hidden until selected.
  const missingTooltips=tooltipTargets.filter(b=>!b.title&&!b.getAttribute('aria-label')&&!b.getAttribute('aria-describedby'));
  auditCheck(checks,'ui.action_help',!tooltipTargets.length?'NOT TESTED':missingTooltips.length?'WARNING':'PASS',`${tooltipTargets.length} controls checked; ${missingTooltips.length} missing explanations`,'Visible Board, Planning and Reports buttons have accessible help','Read-only DOM inspection; does not prove tooltip positioning or clarity.');
  const wizardControls=['wizardReset','wizardResetStatus','wizardStepHelp','workspaceSchedules','ceremonyPreview'];
  auditCheck(checks,'ui.meeting_setup_guidance',wizardControls.every(id=>!!$(id))?'PASS':'FAIL',`${wizardControls.filter(id=>!!$(id)).length}/${wizardControls.length} required guidance and proposal elements present`,'Proposal clearing and saved schedules have distinct guidance','Does not execute destructive or persisted operations.');
  const scheduleRecords=(activeScheduleWorkspace()?.meetingSchedules||[]);
  auditCheck(checks,'live.schedule_record_integrity',!scheduleRecords.length?'NOT TESTED':scheduleRecords.every(sc=>Array.isArray(sc.meetings))?'PASS':'WARNING',`${scheduleRecords.length} saved workspace schedules; ${scheduleRecords.filter(sc=>!Array.isArray(sc.meetings)).length} invalid meeting arrays`,'Saved schedules retain a meeting list','Read-only; no Outlook changes.');
  const historyReady=!!$('historyToggle')&&!!$('historyPanel')&&!!$('history');auditCheck(checks,'ui.history_record',historyReady?'PASS':'FAIL',historyReady?'Capture history controls present':'History Record controls missing','History Record access and detail container exist','Does not exercise export or persistence.');const demoReady=!!document.querySelector('[data-tab=demo]')&&!!$('tab-demo')&&!!$('demoWorkspace');auditCheck(checks,'ui.demo_entry',demoReady?'PASS':'FAIL',demoReady?'Demo tab and isolated workspace present':'Demo entry incomplete','Dedicated demo entry points exist','Does not execute synthetic scenarios.');const baselineHelp=$('commitmentHelp');auditCheck(checks,'ui.baseline_explanation',baselineHelp?.textContent.toLowerCase().includes('commitment')?'PASS':'WARNING',baselineHelp?'Read-only commitment record explanation present':'No baseline explanation found','Explain why commitment snapshots differ from current sprint summary');

  const s=currentSprint();
  if(!s){auditCheck(checks,'live.sprint_selection','NOT_TESTED','No selected sprint','A selected sprint');}
  else{
   const ids=[...new Set((s.itemIds||[]).map(Number))].filter(Number.isFinite);
   const local=new Map([...items,...assignedItems].map(w=>[Number(w.id),w]));
   const missing=ids.filter(id=>!local.has(id));
   auditCheck(checks,'live.assignment_coverage',missing.length?'WARNING':'PASS',`${ids.length} assigned, ${missing.length} not locally loaded`,'Every assigned item loaded','Read-only; no automatic refresh or changes');
   const loaded=ids.map(id=>local.get(id)).filter(Boolean);
   const uniqueProjects=new Set(loaded.map(w=>w.project));
   auditCheck(checks,'live.project_coverage',loaded.length?'PASS':'NOT_TESTED',`${uniqueProjects.size} source projects, ${loaded.length} loaded items`,'Work items retain source project metadata');
   const bad=loaded.filter(w=>!w.id||!w.project||!w.type||!w.state);
   auditCheck(checks,'live.item_integrity',bad.length?'WARNING':'PASS',`${bad.length} incomplete records among ${loaded.length}`,'ID, project, type and state on every item');
   const snapshots=s.snapshots||[];
   const invalid=snapshots.filter(x=>!x.at||!Array.isArray(x.items));
   auditCheck(checks,'live.snapshot_structure',invalid.length?'WARNING':'PASS',`${snapshots.length} snapshots, ${invalid.length} malformed`,'Timestamp and item array in every observation');
   const uniqueDays=new Set(snapshots.map(x=>String(x.at||'').slice(0,10)).filter(Boolean));
   auditCheck(checks,'live.burndown_history',uniqueDays.size>=2?'PASS':'NOT_TESTED',`${uniqueDays.size} distinct observation days`,'At least two dated observations','Cannot manufacture historical observations');
   const activeIds=new Set(ids);
   auditCheck(checks,'live.assignment_duplicates',ids.length===(s.itemIds||[]).length?'PASS':'WARNING',`${(s.itemIds||[]).length-ids.length} duplicate sprint assignments`,'No duplicate IDs');
   // State metadata is retrieved through GET only, using source project and work-item type.
   if(token&&loaded.length){
    const samples=[...new Map(loaded.map(w=>[workflowKey(w),w])).values()].slice(0,12);
    for(const w of samples){
     const key=workflowKey(w);
     try{
      const metadata=await api(`/${encodeURIComponent(w.project)}/_apis/wit/workitemtypes/${encodeURIComponent(w.type)}/states?api-version=7.1`);
      const states=metadata.value||[];
      const present=states.some(x=>x.name===w.state);
      const unmapped=states.filter(x=>!['proposed','inprogress','resolved','completed','removed'].includes(String(x.category||'').toLowerCase())&&!WORKFLOW_MAP[String(x.name||'').toLowerCase()]);
      auditCheck(checks,'live.workflow.'+checks.length,present?'PASS':'WARNING',`${w.project} / ${w.type}: ${states.length} states; current state ${present?'recognized':'not recognized'}; ${unmapped.length} unmapped`,'Source state appears in its work-item-type metadata');
      if(unmapped.length)auditCheck(checks,'live.workflow_unmapped.'+checks.length,'WARNING',`${unmapped.length} unmapped states for ${w.type}`,'Every state can be classified safely','Names intentionally excluded from diagnostic export');
     }catch(e){auditCheck(checks,'live.workflow.'+checks.length,'WARNING',`Metadata GET failed (${String(e.message||e).slice(0,110)})`,'Readable workflow state metadata');}
    }
    auditCheck(checks,'live.process_ancestry','NOT_TESTED','Work-item-type state metadata is not proof of Agile/Scrum ancestry','Agile/Scrum or inherited process verified','Requires authoritative project/process ancestry mapping');
    // Read-only parent-link verification for loaded tickets. No mutation or hierarchy inference.
    try{
     const relationshipIds=loaded.map(w=>Number(w.id)).filter(Number.isFinite);
     const relationshipRecords=[];
     for(let offset=0;offset<relationshipIds.length;offset+=100){
      const batch=relationshipIds.slice(offset,offset+100);
      const response=await api(`/_apis/wit/workitems?ids=${batch.join(',')}&$expand=relations&api-version=7.1`);
      relationshipRecords.push(...(response.value||[]));
     }
     const byId=new Map(relationshipRecords.map(w=>[Number(w.id),w]));
     const absent=relationshipIds.filter(id=>!byId.has(id));
     const parents=relationshipRecords.filter(w=>(w.relations||[]).some(r=>r.rel==='System.LinkTypes.Hierarchy-Reverse'));
     const invalid=relationshipRecords.filter(w=>(w.relations||[]).filter(r=>r.rel==='System.LinkTypes.Hierarchy-Reverse').length>1);
     auditCheck(checks,'live.parent_relationships',absent.length||invalid.length?'WARNING':'PASS',`${relationshipRecords.length} source records; ${parents.length} parent-linked; ${absent.length} missing; ${invalid.length} multiple-parent anomalies`,'Source parent links readable; no work item has multiple parents','Read-only snapshot. Does not prove links remain unchanged after future edits.');
    }catch(e){auditCheck(checks,'live.parent_relationships','WARNING',`Relationship GET failed: ${String(e.message||e).slice(0,120)}`,'Source parent links readable');}
   }else auditCheck(checks,'live.workflow_metadata','NOT_TESTED','No authenticated loaded work items','At least one source work item');
   try{
    const selected=loaded.slice(0,100),fresh=[];
    for(let offset=0;offset<selected.length;offset+=100){const batch=selected.slice(offset,offset+100);if(!batch.length)continue;const response=await api(`/_apis/wit/workitems?ids=${batch.map(w=>w.id).join(',')}&fields=System.Id,System.State,System.Rev&api-version=7.1`);fresh.push(...(response.value||[]));}
    const freshById=new Map(fresh.map(w=>[Number(w.id),w]));
    const mismatches=selected.filter(w=>freshById.has(Number(w.id))&&freshById.get(Number(w.id)).fields?.['System.State']!==w.state);
    const absent=selected.filter(w=>!freshById.has(Number(w.id)));
    auditCheck(checks,'live.source_freshness',absent.length?'WARNING':mismatches.length?'WARNING':'PASS',`${selected.length} compared; ${mismatches.length} state differences; ${absent.length} unavailable`,'Local state matches a fresh read-only ADO GET','Differences indicate refresh is needed; no production tickets modified.');
   }catch(e){auditCheck(checks,'live.source_freshness','WARNING',String(e.message||e).slice(0,120),'Fresh source work-item read');}
   auditCheck(checks,'live.inbound_roundtrip','NOT_TESTED','No external source mutation performed','External change reflected after refresh','Read-only freshness comparison does not prove a full mutation-and-refresh roundtrip');
  }
  // Pure synthetic tests: do not switch Demo Mode or save to browser/organization storage.
  const sample=demoSeed('risk');const active=sample.work.filter(w=>w.inSprint&&w.type!=='Feature');
  const before=active.filter(w=>w.state==='Closed').length;
  const candidate=active.find(w=>w.state==='New'||w.state==='Active');
  if(candidate){candidate.state='Closed';const after=active.filter(w=>w.state==='Closed').length;
   auditCheck(checks,'synthetic.state_recalculation',after===before+1?'PASS':'FAIL',`${before} -> ${after} closed`,'Exactly one additional Closed item');
  }else auditCheck(checks,'synthetic.state_recalculation','FAIL','No open candidate','At least one open sample');
  const block=sample.work.find(w=>w.inSprint&&!['Closed','Done'].includes(w.state));
  if(block){block.blocked=false;const beforeBlocked=sample.work.filter(w=>w.inSprint&&w.blocked).length;block.blocked=true;const afterBlocked=sample.work.filter(w=>w.inSprint&&w.blocked).length;
   auditCheck(checks,'synthetic.blocker_recalculation',afterBlocked===beforeBlocked+1?'PASS':'FAIL',`${beforeBlocked} -> ${afterBlocked} blocked`,'One additional blocker');
  }
  const excluded=sample.work.find(w=>w.inSprint);if(excluded){const beforeCount=sample.work.filter(w=>w.inSprint).length;excluded.inSprint=false;const afterCount=sample.work.filter(w=>w.inSprint).length;
   auditCheck(checks,'synthetic.membership_recalculation',afterCount===beforeCount-1?'PASS':'FAIL',`${beforeCount} -> ${afterCount} included`,'One fewer sprint member');}
  auditCheck(checks,'synthetic.history',sample.observations.length>=2?'PASS':'FAIL',`${sample.observations.length} dated observations`,'At least two synthetic observations');
  auditCheck(checks,'outlook.delivery','NOT_TESTED','No Graph write or invitation issued','Actual attendee invitation delivery','Read-only runner cannot validate external email delivery');
 }catch(e){auditCheck(checks,'audit.unexpected_error','FAIL',String(e.message||e).slice(0,180),'Audit completes without uncaught error');}
 finally{auditLastRun={schema:'pnpc.audit.v1',version:DIAG_VERSION,startedAt,finishedAt:new Date().toISOString(),mode:'read-only-live-and-isolated-synthetic',checks};auditRunning=false;if(button)button.disabled=false;diagnostic('audit.run.completed',{checkCount:checks.length,failed:checks.filter(x=>x.status==='FAIL').length,warnings:checks.filter(x=>x.status==='WARNING').length});auditRender();}
}
function exportAutomatedAudit(){if(!auditLastRun)return notify('Run the automated diagnostic first.',true);
 const url=URL.createObjectURL(new Blob([JSON.stringify(auditLastRun,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`global-sprints-automated-audit-${DIAG_VERSION}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// Resolve lane membership from the current sprint; default is never a workflow mutation.
function laneFor(id){return currentSprint()?.itemLanes?.[id] || 'Default';}
function isSprintBlocked(id){return !!currentSprint()?.blockedItems?.[id];}
async function setSprintBlocked(id,blocked){
 const sprintId=currentSprint()?.id;if(!sprintId)return false;
 const ok=await persist(r=>{const sprint=r.sprints.find(x=>x.id===sprintId);if(!sprint)throw Error('Sprint no longer exists.');sprint.blockedItems ||= {};if(blocked)sprint.blockedItems[id]={since:new Date().toISOString()};else delete sprint.blockedItems[id];},false);
 if(ok){diagnostic('sprint-blocker-changed',{sprintId,workItemId:id,blocked});renderBoard();renderPmAssistance();notify(`#${id} ${blocked?'marked blocked':'unblocked'} in this global sprint.`);}
 return ok;
}
// Persist lane edits through the existing organization-scoped storage mechanism.
async function saveLanes(change,message){
 const id=currentSprint()?.id;
 if(!id){notify('Select a sprint before changing lanes.',true);return false;}
 // Refresh only the shared registry, not the board's current selection or scroll position.
 // This prevents a colleague's unrelated save from blocking a normal execution move.
 try{await refreshSharedRegistryForExecution();}
 catch(e){notify('Cannot update shared swimlane: '+e.message,true);return false;}
 if(!registry.sprints.some(s=>s.id===id&&s.workspaceId===activeWorkspaceId)){
  notify('This sprint is no longer available in the selected workspace.',true);return false;
 }
 const ok=await persist(r=>{
  const sprint=r.sprints.find(s=>s.id===id);
  if(!sprint)throw new Error('Sprint no longer exists.');
  sprint.customLanes ||= [];
  sprint.laneMappings ||= {};
  sprint.itemLanes ||= {};
  change(sprint);
 },false);
 if(ok){notify(message||'Swimlanes saved.');renderBoard();}
 return ok;
}

function laneConfig(name){return currentSprint()?.laneMappings?.[name]||null;}
let laneEditing=null;
function addLane(){if(!currentSprint()){notify('Select a sprint before adding a lane.',true);return;}openLaneEditor();}
function closeLaneDialog(){$('laneDialog').classList.add('hidden');laneEditing=null;}
function openLaneEditor(name=null){
 laneEditing=name;$('laneDialog').classList.remove('hidden');$('laneEditor').classList.remove('hidden');$('laneMappingList').classList.add('hidden');
 $('laneDialogTitle').textContent=name?`Edit mapping: ${name}`:'Add swimlane';$('laneSave').textContent=name?'Save mapping':'Create swimlane';
 const purpose=$('lanePurpose');purpose.replaceChildren();for(const n of [...Object.keys(LANE_PRESETS),'Custom'])purpose.add(new Option(n,n));
 const existing=name?laneConfig(name):null;purpose.value=existing?.purpose|| (name?'Custom':'Backlog / Planned');
 $('laneCustomName').value=name||'';$('laneCustomNameWrap').classList.toggle('hidden',!!name||purpose.value!=='Custom');
 $('laneOrientation').value=existing?.orientation||'horizontal';$('laneCategory').value=existing?.category||LANE_PRESETS[purpose.value]||'In Progress';$('laneOverrideAccept').checked=false;
 purpose.disabled=!!name;refreshLaneOverride();
}
function refreshLaneOverride(){const purpose=$('lanePurpose').value;const standard=LANE_PRESETS[purpose];if(!laneEditing)$('laneCustomNameWrap').classList.toggle('hidden',purpose!=='Custom');
 const overridden=!!standard&&$('laneCategory').value!==standard;$('laneOverrideWrap').classList.toggle('hidden',!overridden);
 $('laneOverrideNote').textContent=overridden?`Nonstandard mapping: ${purpose} normally maps to ${standard}. This affects Global Sprints only, not Azure DevOps states.`:'Mapping affects Global Sprints organization only; Azure DevOps workflow states are unchanged.';
}
function openLaneMappingList(){
 $('laneDialog').classList.remove('hidden');$('laneEditor').classList.add('hidden');$('laneMappingList').classList.remove('hidden');$('laneDialogTitle').textContent='Custom swimlane mappings';
 const list=$('laneMappingList');list.replaceChildren();const lanes=currentSprint()?.customLanes||[];
 if(!lanes.length){const p=document.createElement('p');p.textContent='No custom swimlanes yet.';list.append(p);}
 for(const name of lanes){const row=document.createElement('div');row.className='row';row.style.margin='10px 0';const text=document.createElement('span');text.textContent=`${name} — ${laneOrientation(name)} — ${laneConfig(name)?.category||'Unmapped'}`;const btn=document.createElement('button');btn.textContent='Edit mapping';btn.onclick=()=>openLaneEditor(name);row.append(text,btn);list.append(row);}
 const close=document.createElement('button');close.className='secondary';close.textContent='Close';close.onclick=closeLaneDialog;list.append(close);
}
async function commitLaneEditor(){
 const purpose=$('lanePurpose').value,category=$('laneCategory').value,standard=LANE_PRESETS[purpose],override=!!standard&&category!==standard;
 if(override&&!$('laneOverrideAccept').checked)return notify('Accept the nonstandard mapping before saving.',true);
 const name=laneEditing|| (purpose==='Custom'?$('laneCustomName').value.trim():purpose);
 if(!name)return notify('Enter a swimlane name.',true);
 if(!laneEditing&&laneNames().some(n=>n.toLowerCase()===name.toLowerCase()))return notify('That swimlane already exists.',true);
 const config={purpose,category,orientation:$('laneOrientation').value,override,acknowledgedAt:override?new Date().toISOString():null};
 const old=laneEditing;const ok=await saveLanes(s=>{if(!old)s.customLanes.push(name);s.laneMappings[name]=config;},old?`Mapping saved for ${name}.`:`Swimlane "${name}" added.`);
 if(ok){diagnostic(old?'swimlane.mapping':'swimlane.created',{name,...config});closeLaneDialog();$('lanePicker').value=name;renderBoard();$('lanePicker').value=name;}
}
function laneOrientation(name){return laneConfig(name)?.orientation==='vertical'?'vertical':'horizontal';}
function horizontalLanes(){return laneNames().filter(n=>laneOrientation(n)==='horizontal');}
function verticalLanes(){return laneNames().filter(n=>laneOrientation(n)==='vertical');}
function laneNames(){const s=currentSprint();return [...new Set(['Default','Expedite',...(s?.customLanes||[])])];}
function boardColumns(base){
 const vertical=verticalLanes();const ordered=[...base];
 for(const name of vertical){const config=laneConfig(name)||{};const position=Number.isInteger(config.position)?config.position:Math.max(0,ordered.indexOf(config.category)+1);
 ordered.splice(Math.max(0,Math.min(position,ordered.length)),0,name);
 }
 return ordered;
}
async function reorderNamedLane(name,direction){
 const sprint=currentSprint();if(!sprint?.customLanes?.includes(name))return;
 const vertical=laneOrientation(name)==='vertical';
 if(vertical){
  const base=[...WORKFLOW_COLUMNS];if(assignedSelection().some(w=>workflowColumn(w)==='Other'))base.push('Other');
  const order=boardColumns(base),index=order.indexOf(name),next=index+direction;
  if(next<0||next>=order.length)return;
  [order[index],order[next]]=[order[next],order[index]];
  const ok=await saveLanes(target=>{for(const [i,n] of order.entries())if(target.customLanes.includes(n)&&target.laneMappings[n]?.orientation==='vertical')target.laneMappings[n].position=i;},'Column position saved.');
  if(ok)diagnostic('swimlane.reordered',{lane:name,direction,orientation:'vertical'});return;
 }
 const same=sprint.customLanes.filter(n=>laneOrientation(n)==='horizontal'),i=same.indexOf(name),neighbor=same[i+direction];
 if(!neighbor)return;
 const ok=await saveLanes(target=>{const a=target.customLanes.indexOf(name),b=target.customLanes.indexOf(neighbor);[target.customLanes[a],target.customLanes[b]]=[target.customLanes[b],target.customLanes[a]];},'Swimlane order saved.');
 if(ok)diagnostic('swimlane.reordered',{lane:name,direction,orientation:'horizontal'});
}
let selectedLane=null;
function attachLaneActions(label,name,orientation){
 label.classList.add('selectable-lane');label.tabIndex=0;label.setAttribute('role','button');label.setAttribute('aria-label','Select lane '+name);
 const bar=document.createElement('div');bar.className='lane-inline-actions';bar.hidden=selectedLane!==name;
 label.classList.toggle('selected-lane',selectedLane===name);
 const select=()=>{selectedLane=selectedLane===name?null:name;renderBoard();};
 label.addEventListener('click',e=>{if(!e.target.closest('button'))select();});
 label.addEventListener('keydown',e=>{if(e.target===label&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select();}});
 const horizontal=orientation==='horizontal';const same=(currentSprint()?.customLanes||[]).filter(n=>laneOrientation(n)==='horizontal');const i=same.indexOf(name);
 const base=[...WORKFLOW_COLUMNS];if(assignedSelection().some(w=>workflowColumn(w)==='Other'))base.push('Other');const columns=boardColumns(base);const vi=columns.indexOf(name);
 for(const [caption,dir] of [[horizontal?'↑':'←',-1],[horizontal?'↓':'→',1]]){
  const b=document.createElement('button');b.type='button';b.className='lane-mini';b.textContent=caption;b.title='Move '+name;
  b.disabled=horizontal?(dir<0?i===0:i===same.length-1):(dir<0?vi===0:vi===columns.length-1);
  b.onclick=e=>{e.stopPropagation();void reorderNamedLane(name,dir);};bar.append(b);
 }
 const edit=document.createElement('button');edit.type='button';edit.className='lane-mini';edit.textContent='⚙';edit.title='Configure '+name;edit.onclick=e=>{e.stopPropagation();openLaneEditor(name);};bar.append(edit);
 const remove=document.createElement('button');remove.type='button';remove.className='lane-mini';remove.textContent='×';remove.title='Remove '+name;remove.onclick=e=>{e.stopPropagation();void removeNamedLane(name);};bar.append(remove);label.append(bar);
}
async function renameLane(){const old=$('lanePicker').value;if(!old||old==='Default'||old==='Expedite')return notify('Only custom swimlanes can be renamed.',true);const value=prompt('Rename swimlane:',old)?.trim();if(!value||value===old)return;if(laneNames().some(n=>n.toLowerCase()===value.toLowerCase()))return notify('That swimlane already exists.',true);await saveLanes(s=>{s.customLanes=s.customLanes.map(n=>n===old?value:n);if(s.laneMappings?.[old]){s.laneMappings[value]=s.laneMappings[old];delete s.laneMappings[old];}for(const [id,n] of Object.entries(s.itemLanes))if(n===old)s.itemLanes[id]=value;},`Swimlane renamed to "${value}".`);diagnostic("swimlane.renamed",{from:old,to:value});}
async function removeNamedLane(old){if(!currentSprint()?.customLanes?.includes(old))return;if(!confirm(`Remove lane "${old}"? Its cards will move to Default.`))return;const ok=await saveLanes(s=>{s.customLanes=s.customLanes.filter(n=>n!==old);delete s.laneMappings[old];for(const [id,n] of Object.entries(s.itemLanes))if(n===old)s.itemLanes[id]='Default';},`Lane "${old}" removed; its cards moved to Default.`);if(ok)diagnostic('swimlane.removed',{name:old});}
function removeLane(){const lanes=currentSprint()?.customLanes||[];if(!lanes.length)return notify('No custom lanes to remove.');$('laneDialog').classList.remove('hidden');$('laneEditor').classList.add('hidden');$('laneMappingList').classList.remove('hidden');$('laneDialogTitle').textContent='Remove custom lane';const list=$('laneMappingList');list.replaceChildren();for(const name of lanes){const b=document.createElement('button');b.type='button';b.textContent='Remove '+name;b.className='secondary';b.onclick=async()=>{await removeNamedLane(name);closeLaneDialog();};list.append(b);}const close=document.createElement('button');close.textContent='Cancel';close.onclick=closeLaneDialog;list.append(close);}
async function moveLaneItem(id,lane){await saveLanes(s=>{s.itemLanes[id]=lane;},`Work item #${id} moved to ${lane}.`);}
// Workflow metadata is scoped by project AND work-item type. Never mutate a global
// state-name map from an individual project's inherited/custom process.
function workflowKey(w){return `${w.project}::${w.type}`;}
function workflowCategory(w,state=w.state){
 const scoped=workflowCategories.get(workflowKey(w));
 const name=String(state||'').trim().toLowerCase();
 return scoped?.get(name)||WORKFLOW_MAP[name]||'Other';
}
async function getStates(w){const key=workflowKey(w);if(workflowStates.has(key))return workflowStates.get(key);
 const result=await api(`/${encodeURIComponent(w.project)}/_apis/wit/workitemtypes/${encodeURIComponent(w.type)}/states?api-version=7.1`);
 const entries=result.value||[];const states=entries.map(x=>x.name);
 const mapping=new Map();const categoryMap={proposed:'To Do',inprogress:'In Progress',resolved:'Done',completed:'Done'};
 for(const entry of entries){const label=String(entry.name||'').trim().toLowerCase();if(!label)continue;
  const category=String(entry.category||'').toLowerCase();const normalized=categoryMap[category]||WORKFLOW_MAP[label];
  if(normalized)mapping.set(label,normalized);
  else diagnostic('ado.workflow.unmapped_state',{workItemType:w.type,project:w.project,category});
 }
 workflowCategories.set(key,mapping);
 diagnostic('ado.workflow.states_loaded',{workItemType:w.type,project:w.project,stateCount:states.length,unmapped:entries.filter(x=>!mapping.has(String(x.name||'').trim().toLowerCase())).length});
 workflowStates.set(key,states);return states;
}
function assignedSelection(){
  const sprint=registry?.sprints.find(x=>x.id===$('sprintPicker').value);
  const available=new Map([...items,...assignedItems].map(w=>[w.id,w]));
  return (sprint?.itemIds||[]).map(id=>available.get(id)).filter(Boolean);
}
function workItemLink(w){
  const link=document.createElement('a');link.textContent=`#${w.id} · ${w.title}`;
  // Prefer the canonical organization route; API work items may omit _links.html.
  link.href=w.url||`${organizationApiBase()}/${encodeURIComponent(w.project)}/_workitems/edit/${w.id}`;
  link.target='_blank';link.rel='noopener noreferrer';return link;
}
const WORKFLOW_COLUMNS=['To Do','In Progress','Done','Closed'];
const WORKFLOW_MAP={
 'to do':'To Do','new':'To Do','proposed':'To Do','approved':'To Do',
 'in progress':'In Progress','active':'In Progress','committed':'In Progress','doing':'In Progress',
 'done':'Done','resolved':'Done','completed':'Done','development complete':'Done',
 'closed':'Closed','accepted':'Closed','tested and approved':'Closed'
};
function isRemoved(w){return ['removed','cut','cancelled','canceled'].includes((w.state||'').toLowerCase());}
function workflowColumn(w){return workflowCategory(w);}
// Presentation-only exception: an ADO Closed item may be displayed in Done.
// Never rewrite the underlying terminal ADO state or report it as awaiting validation.
function boardColumn(w){return workflowColumn(w)==='Closed'&&currentSprint()?.doneDisplayIds?.[w.id]?'Done':workflowColumn(w);}
async function setDoneDisplay(w,enabled){const id=currentSprint()?.id;if(!id)return false;const ok=await persist(r=>{const sp=r.sprints.find(x=>x.id===id);if(!sp)throw Error('Sprint no longer exists');sp.doneDisplayIds ||= {};if(enabled)sp.doneDisplayIds[w.id]=true;else delete sp.doneDisplayIds[w.id];},false);if(ok){renderBoard();renderSprintHealth();notify(enabled?`#${w.id} displayed in Done; Azure DevOps remains Closed.`:`#${w.id} returned to its native workflow column.`);}return ok;}
function compactMode(){return $('boardDensity')?.value==='compact';}
async function updateWorkItemState(w,next){
 if(next===w.state)return true;
 if(!ENABLE_WORK_ITEM_WRITES){notify('State changes are disabled.',true);return false;}
 try{
  const revisionBefore=w.rev;
  diagnostic('ado.state_update.attempt',{workItemId:w.id,revision:revisionBefore,fromState:w.state,toState:next});
  const result=await api(`/_apis/wit/workitems/${w.id}?api-version=7.1`,{
   method:'PATCH',headers:{'Content-Type':'application/json-patch+json'},
   body:JSON.stringify([{op:'test',path:'/rev',value:w.rev},{op:'add',path:'/fields/System.State',value:next}])
  });
  for(const item of [w,...assignedItems,...items])if(item.id===w.id){item.state=result.fields['System.State'];item.rev=result.rev;}
  diagnostic('ado.state_update.success',{workItemId:w.id,revisionBefore,revisionAfter:result.rev,toState:result.fields['System.State'],revisionAdvanced:Number(result.rev)>Number(revisionBefore)});renderBoard();renderSprintHealth();renderTimeline();void autoReportObservation(currentSprint(),reportWork());notify(`Updated #${w.id} to ${result.fields['System.State']} in Azure DevOps.`);
  return true;
 }catch(e){diagnostic('ado.state_update.failure',{workItemId:w.id,reason:String(e.message||e)},'error');notify(`State update rejected for #${w.id}: ${e.message}`,true);return false;}
}
async function destinationState(w,column){
 const available=await getStates(w);
 const candidates=available.filter(state=>workflowCategory(w,state)===column);
 if(!candidates.length)throw Error(`No ${column} state is defined for ${w.type} in ${w.project}. The original Azure DevOps workflow is unchanged.`);
 if(candidates.includes(w.state))return w.state;
 const preferred={'To Do':['New','To Do','Approved','Proposed'],'In Progress':['Active','In Progress','Committed','Doing'],'Done':['Done','Resolved','Development Complete'],'Closed':['Closed','Accepted','Tested and Approved']};
 const rank=x=>{const i=preferred[column].findIndex(v=>v.toLowerCase()===x.toLowerCase());return i<0?999:i;};return candidates.sort((x,y)=>rank(x)-rank(y))[0];
}
const isPlanningContextType=w=>/^(epic|feature)$/i.test((w.type||'').trim());
// Board detail stays in the extension. Only the explicit external link leaves this view.
async function openBoardItemDetail(w){
 let dialog=document.getElementById('gs-board-item-dialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='gs-board-item-dialog';document.body.append(dialog);}
 dialog.className='gs-ticket-dialog';dialog.replaceChildren();
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const head=el('header','gs-ticket-header');const heading=el('div');heading.append(el('small','gs-ticket-eyebrow',w.project+' · '+w.type+' · #'+w.id),el('h2','',w.title));const close=el('button','secondary','Close');close.type='button';close.onclick=()=>dialog.close();head.append(heading,close);dialog.append(head);
 const form=el('form','gs-ticket-form');form.addEventListener('submit',event=>event.preventDefault());
 const grid=el('div','gs-ticket-grid');const field=(label,control)=>{const wrap=el('label','gs-ticket-field');wrap.append(el('span','',label),control);grid.append(wrap);return control;};
 const title=field('Title',el('input'));title.value=w.title;title.required=true;
 const state=field('Azure DevOps state',el('select'));state.add(new Option(w.state,w.state));
 const assignee=field('Assigned to (email or identity)',el('input'));assignee.value=w.assigneeIdentity|| (w.assignee==='Unassigned'?'':w.assignee);assignee.placeholder='Name or email';
 const effort=field('Effort / Story Points',el('input'));effort.type='number';effort.min='0';effort.step='any';effort.value=w.effort??'';
 const detailSection=el('section','gs-ticket-rich-fields');
 detailSection.append(el('h3','','Planning details'));
 const richField=(label,value)=>{const wrapper=el('label','gs-ticket-field gs-ticket-rich-field');wrapper.append(el('span','',label));const area=el('textarea');area.rows=5;area.value=value||'';wrapper.append(area);detailSection.append(wrapper);return area;};
 // Azure DevOps stores these fields as HTML. Render an editable text representation
 // and escape on save rather than sending raw user-provided HTML.
 const plainText=html=>new DOMParser().parseFromString(String(html||''),'text/html').body.textContent||'';
 const htmlText=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/\n/g,'<br>');
 const description=richField('Description',plainText(w.description));
 const criteria=richField('Acceptance Criteria',plainText(w.acceptanceCriteria));
 detailSection.append(el('small','gs-ticket-help','Editing these text fields replaces their existing rich-text formatting. Unchanged fields retain their original formatting.')); 
 const estimateHelp=el('small','gs-ticket-help','Uses the estimation field supported by this work-item type.');grid.append(estimateHelp);
 const info=el('p','gs-ticket-help','Changes are saved to Azure DevOps. Sprint membership and swimlanes are managed on the board.');
 const feedback=el('p','gs-ticket-feedback');feedback.setAttribute('role','status');
 const actions=el('div','gs-ticket-actions');const link=el('a','gs-ticket-external','Open in Azure DevOps ↗');link.href=w.url||`${organizationApiBase()}/${encodeURIComponent(w.project)}/_workitems/edit/${w.id}`;link.target='_blank';link.rel='noopener noreferrer';const save=el('button','','Save Changes');save.type='submit';actions.append(link,save);
 form.append(grid,detailSection,info,feedback,actions);dialog.append(form);
 const comments=el('section','gs-ticket-comments');comments.append(el('h3','','Comments'));const history=el('div','gs-ticket-comment-history','Loading comments…');const comment=el('textarea');comment.rows=3;comment.placeholder='Add a comment to this work item';comment.setAttribute('aria-label','New work item comment');const send=el('button','secondary','Add Comment');send.type='button';comments.append(history,comment,send);dialog.append(comments);
 if(!dialog.open)dialog.showModal();
 try{const states=await getStates(w);state.replaceChildren(...states.map(v=>new Option(v,v)));state.value=w.state;}catch(e){feedback.textContent='Could not load valid states: '+e.message;}
 let estimateField=w.effortField;
 if(!estimateField){try{const type=await api(`/${encodeURIComponent(w.project)}/_apis/wit/workitemtypes/${encodeURIComponent(w.type)}?api-version=7.1`);const fields=(type.fieldInstances||type.fields||[]).map(x=>x.referenceName||x.field?.referenceName);estimateField=fields.includes('Microsoft.VSTS.Scheduling.StoryPoints')?'Microsoft.VSTS.Scheduling.StoryPoints':fields.includes('Microsoft.VSTS.Scheduling.Effort')?'Microsoft.VSTS.Scheduling.Effort':null;}catch{} }
 if(!estimateField){effort.disabled=true;estimateHelp.textContent='No supported Effort or Story Points field found. Open Azure DevOps to configure estimates.';}
 // Not every ADO work-item type exposes Acceptance Criteria. Query field metadata
 // instead of attempting a write that the process would reject.
 try{const type=await api(`/${encodeURIComponent(w.project)}/_apis/wit/workitemtypes/${encodeURIComponent(w.type)}?api-version=7.1`);const names=(type.fieldInstances||type.fields||[]).map(x=>x.referenceName||x.field?.referenceName);if(!names.includes('Microsoft.VSTS.Common.AcceptanceCriteria')){criteria.disabled=true;criteria.closest('label').querySelector('span').textContent='Acceptance Criteria (not available for this work-item type)';}}catch{if(w.acceptanceCriteria===null){criteria.disabled=true;}}
 
 const loadComments=async()=>{try{const r=await api(`/${encodeURIComponent(w.project)}/_apis/wit/workItems/${w.id}/comments?api-version=7.1-preview.4`);history.replaceChildren();for(const c of (r.comments||[]).slice(-25)){const row=el('div','gs-ticket-comment');row.append(el('strong','',c.createdBy?.displayName||'Team member'),el('p','',String(c.text||'').replace(/<[^>]*>/g,'')));history.append(row);}if(!history.children.length)history.textContent='No comments yet.';}catch(e){history.textContent='Comments unavailable: '+e.message;}};
 void loadComments();
 send.onclick=async()=>{if(!comment.value.trim())return;send.disabled=true;try{await api(`/${encodeURIComponent(w.project)}/_apis/wit/workItems/${w.id}/comments?api-version=7.1-preview.4`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:comment.value.trim()})});comment.value='';feedback.textContent='Comment added.';await loadComments();}catch(e){feedback.textContent='Comment was not saved: '+e.message;}finally{send.disabled=false;}};
 form.onsubmit=async event=>{event.preventDefault();const changes=[];const put=(name,value)=>changes.push({op:'add',path:'/fields/'+name,value});if(title.value.trim()!==w.title)put('System.Title',title.value.trim());
 if(description.value!==plainText(w.description))put('System.Description',htmlText(description.value));
 if(!criteria.disabled&&criteria.value!==plainText(w.acceptanceCriteria))put('Microsoft.VSTS.Common.AcceptanceCriteria',htmlText(criteria.value));if(state.value!==w.state)put('System.State',state.value);if(assignee.value.trim()!==(w.assigneeIdentity|| (w.assignee==='Unassigned'?'':w.assignee)))put('System.AssignedTo',assignee.value.trim());if(estimateField&&String(effort.value)!==String(w.effort??'')){if(effort.value!==''&&(!Number.isFinite(Number(effort.value))||Number(effort.value)<0)){feedback.textContent='Estimate must be zero or greater.';return;}changes.push(effort.value===''?{op:'remove',path:'/fields/'+estimateField}:{op:'add',path:'/fields/'+estimateField,value:Number(effort.value)});}
 if(!changes.length){feedback.textContent='No changes to save.';return;}save.disabled=true;try{const result=await api(`/_apis/wit/workitems/${w.id}?api-version=7.1`,{method:'PATCH',headers:{'Content-Type':'application/json-patch+json'},body:JSON.stringify([{op:'test',path:'/rev',value:w.rev},...changes])});const fresh=normalizeItem(result);for(const item of [w,...items,...assignedItems,...ancestorItems])if(Number(item.id)===Number(w.id))Object.assign(item,fresh);renderBoard();renderSprintHealth();renderTimeline();void autoReportObservation(currentSprint(),reportWork());feedback.textContent='Saved to Azure DevOps.';heading.querySelector('h2').textContent=fresh.title;}catch(e){feedback.textContent='Save failed: '+e.message;}finally{save.disabled=false;}};
}

function workItemCard(w){
 const card=document.createElement('div');card.className='ticket hybrid-ticket'+(w.contextOnly||isPlanningContextType(w)?' context-item':'');
 const heading=document.createElement('div');heading.className='hybrid-title';const detailsButton=document.createElement('button');detailsButton.type='button';detailsButton.className='gs-board-detail-trigger';detailsButton.textContent=`#${w.id} · ${w.title}`;detailsButton.setAttribute('aria-label',`View work item #${w.id} details`);detailsButton.onclick=()=>openBoardItemDetail(w);heading.append(detailsButton);
 const meta=document.createElement('small');meta.textContent=`${w.project} · ${w.type||'Work item'} · ${w.assignee}`;
 const status=document.createElement('small');status.textContent=`State: ${w.state||'Unknown'}`;
 card.append(heading,meta,status);if(isSprintBlocked(w.id))card.classList.add('sprint-blocked');if(compactMode())card.classList.add('compact-card');
 if(!w.contextOnly&&!isPlanningContextType(w)&&$('boardMode').value==='kanban'){
  card.draggable=true;card.classList.add('draggable-card');
  card.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',String(w.id));event.dataTransfer.effectAllowed='move';});
 }

 if(w.contextOnly||isPlanningContextType(w)){const hint=document.createElement('small');hint.textContent=w.contextOnly?'Parent context · not assigned to this sprint':'Planning context · excluded from execution Kanban';card.append(hint);return card;}
 const laneInfo=document.createElement('small');laneInfo.textContent=`Swimlane: ${laneFor(w.id)}${laneConfig(laneFor(w.id))?.override?' (custom mapping)':''}${boardColumn(w)==='Done'&&workflowColumn(w)==='Closed'?' · Closed in Azure DevOps (visual Done exception)':''}`;card.append(laneInfo);const controls=document.createElement('div');controls.className='card-controls';
 const lane=document.createElement('select');lane.setAttribute('aria-label',`Swimlane for #${w.id}`);
 for(const name of laneNames())lane.add(new Option(name,name));lane.value=laneFor(w.id);
 lane.onchange=async()=>{const destination=lane.value;lane.disabled=true;await moveLaneItem(w.id,destination);lane.disabled=false;};
 const state=document.createElement('select');state.setAttribute('aria-label',`Azure DevOps state for #${w.id}`);
 state.add(new Option(w.state||'Unknown',w.state||''));
 state.onfocus=async()=>{try{const choices=await getStates(w);const previous=state.value;state.replaceChildren();for(const name of choices)state.add(new Option(name,name));state.value=previous;}catch(e){notify(`Could not load states for #${w.id}: ${e.message}`,true);}};
 state.onchange=async()=>{const next=state.value;state.disabled=true;await changeState(w,next);state.disabled=false;};
 const remove=document.createElement('button');remove.type='button';remove.className='secondary sprint-remove';remove.textContent='−';remove.title='Remove from sprint';remove.setAttribute('aria-label',`Remove work item #${w.id} from sprint`);remove.onclick=()=>toggleItem(w.id);
 const blockerLabel=document.createElement('label');blockerLabel.className='sprint-blocker-toggle';
 const blocker=document.createElement('input');blocker.type='checkbox';blocker.checked=isSprintBlocked(w.id);blocker.setAttribute('aria-label',`Blocked: work item #${w.id}`);
 blocker.onchange=async()=>{const desired=blocker.checked;blocker.disabled=true;const ok=await setSprintBlocked(w.id,desired);if(!ok){blocker.checked=!desired;blocker.disabled=false;}};
 blockerLabel.append(blocker,document.createTextNode('Blocked'));
 const quickActions=document.createElement('div');quickActions.className='sprint-card-quick';quickActions.append(blockerLabel,remove);heading.append(remove);
 const laneLabel=document.createElement('label');laneLabel.textContent='Swimlane';laneLabel.append(lane);
 const stateLabel=document.createElement('label');stateLabel.textContent='ADO state';stateLabel.append(state);
 if($('boardMode').value==='kanban')controls.append(laneLabel);controls.append(stateLabel);card.append(blockerLabel,controls);if(compactMode()){meta.classList.add('density-detail');status.classList.add('density-detail');controls.classList.add('density-detail');const toggle=document.createElement('button');toggle.type='button';toggle.className='secondary compact-controls-toggle';toggle.textContent='Edit';toggle.onclick=()=>controls.classList.toggle('density-detail');card.append(toggle);}return card;
}
function renderHierarchy(selected){
 const root=$('hierarchyView');root.replaceChildren();if(!selected.length){root.textContent='No work items assigned to this sprint.';return;}
 const nodes=[...ancestorItems,...selected];const byId=new Map(nodes.map(w=>[w.id,w]));
 const children=new Map();const roots=[];
 for(const w of nodes){if(w.parentId&&w.parentId!==w.id&&byId.has(w.parentId)){if(!children.has(w.parentId))children.set(w.parentId,[]);children.get(w.parentId).push(w);}else roots.push(w);}
 const order=['Epic','Feature','User Story','Product Backlog Item','Bug','Task'];const rank=w=>{const i=order.indexOf(w.type);return i<0?99:i;};
 const sort=(a,b)=>a.project.localeCompare(b.project)||rank(a)-rank(b)||a.id-b.id;
 const rendered=new Set();
 function appendBranch(parent,w){if(rendered.has(w.id))return;rendered.add(w.id);const childrenOf=(children.get(w.id)||[]).sort(sort);
  const node=document.createElement('div');node.className='hierarchy-node';
  if(childrenOf.length){const details=document.createElement('details');details.open=true;const summary=document.createElement('summary');summary.append(workItemCard(w));details.append(summary);for(const child of childrenOf)appendBranch(details,child);node.append(details);}
  else node.append(workItemCard(w));parent.append(node);
 }
 for(const w of roots.sort(sort))appendBranch(root,w);
 for(const w of nodes)if(!rendered.has(w.id))appendBranch(root,w);
}
async function dropOnCell(id,column,lane,cell){
 const w=assignedSelection().find(x=>x.id===id);if(!w)return;
 const oldColumn=boardColumn(w),oldLane=laneFor(id);
 if(column===oldColumn&&lane===oldLane)return;
 cell.classList.add('drop-pending');
 try{
  if(column!==oldColumn){
   const states=await getStates(w);
   const nativeDone=states.some(x=>WORKFLOW_MAP[x.trim().toLowerCase()]==='Done');
   if(column==='Done'&&!nativeDone){
    if(workflowColumn(w)!=='Closed'){
     if(!confirm(`This project has no Done state for ${w.type}. Moving #${w.id} to Done will CLOSE the original Azure DevOps ticket. Continue?`))return;
     const terminal=await destinationState(w,'Closed');
     if(!await updateWorkItemState(w,terminal))return;
    }
    if(!await setDoneDisplay(w,true))return;
   }else if(column==='Closed'&&workflowColumn(w)==='Closed'){
    if(!await setDoneDisplay(w,false))return;
   }else{
    const target=await destinationState(w,column);
    if(!await updateWorkItemState(w,target))return;
    if(currentSprint()?.doneDisplayIds?.[w.id]&&!await setDoneDisplay(w,false))return;
   }
  }
  if(lane!==oldLane){
   const ok=await saveLanes(s=>{s.itemLanes[id]=lane;},`Moved #${id} to swimlane ${lane}.`);
   if(!ok){notify(`State updated, but could not save swimlane for #${id}.`,true);return;}
  }
  renderBacklog();renderBoard();
 }catch(e){notify(`Cannot move #${id}: ${e.message}`,true);}
 finally{cell.classList.remove('drop-pending');renderBoard();}
}
function updateKanbanScrollControls(){
 const wrap=$('kanbanScrollControls'),board=$('board');
 if(!wrap||!board)return;
 const active=$('boardMode').value==='kanban'&&!compactMode();
 const overflow=board.scrollWidth>board.clientWidth+3;
 wrap.classList.toggle('hidden',!active||!overflow);
 if(!active||!overflow)return;
 $('kanbanScrollLeft').disabled=board.scrollLeft<=2;
 $('kanbanScrollRight').disabled=board.scrollLeft+board.clientWidth>=board.scrollWidth-3;
}
function renderHybridBoard(){
 const board=$('board');const previousScroll=board.scrollLeft;board.replaceChildren();
 const selected=assignedSelection(),visible=selected.filter(w=>!isRemoved(w)&&!isPlanningContextType(w));
 const lanePicker=$('lanePicker'),chosen=lanePicker.value;lanePicker.replaceChildren();
 for(const name of laneNames())lanePicker.add(new Option(name,name));
 lanePicker.value=laneNames().includes(chosen)?chosen:'Default';
 const baseColumns=[...WORKFLOW_COLUMNS];
 if(visible.some(w=>workflowColumn(w)==='Other'))baseColumns.push('Other');
 const columns=boardColumns(baseColumns);
 if(!currentSprint()){board.textContent='Select a sprint to view its Kanban board.';}
 else{
  const grid=document.createElement('div');grid.className='kanban-grid'+(compactMode()?' compact-grid':'');
  grid.style.gridTemplateColumns=`110px repeat(${columns.length}, minmax(${compactMode()?155:225}px,1fr))`;
  const corner=document.createElement('div');corner.className='kanban-header';corner.textContent='Swimlane';grid.append(corner);
  for(const column of columns){const head=document.createElement('div');head.className='kanban-header';head.textContent=column;if(verticalLanes().includes(column)){head.title='Compatible workflow category: '+(laneConfig(column)?.category||'In Progress');attachLaneActions(head,column,'vertical');}grid.append(head);}
  for(const lane of horizontalLanes()){
   const label=document.createElement('div');label.className='kanban-lane-label';label.textContent=lane;if(!['Default','Expedite'].includes(lane))attachLaneActions(label,lane,'horizontal');grid.append(label);
   for(const column of columns){
    const cell=document.createElement('div');cell.className='kanban-drop-cell';
    cell.setAttribute('aria-label',`${lane}, ${column}`);
    for(const w of visible.filter(w=>verticalLanes().includes(column)?(lane==='Default'&&laneFor(w.id)===column):(laneFor(w.id)===lane&&boardColumn(w)===column)))cell.append(workItemCard(w));
    if(column!=='Other'){
     cell.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';cell.classList.add('drag-over');});
     cell.addEventListener('dragleave',e=>{if(!cell.contains(e.relatedTarget))cell.classList.remove('drag-over');});
     cell.addEventListener('drop',e=>{e.preventDefault();cell.classList.remove('drag-over');const id=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(id))verticalLanes().includes(column)?void moveLaneItem(id,column):void dropOnCell(id,column,lane,cell);});
    }
    grid.append(cell);
   }
  }
  board.append(grid);board.scrollLeft=previousScroll;
  if(!visible.length){const note=document.createElement('p');note.className='muted';note.textContent='No executable work items are assigned yet. Swimlanes remain visible and ready for cards.';board.prepend(note);}
 }
 renderHierarchy(selected);
 const mode=$('boardMode').value;
 document.querySelector('.lane-toolbar').classList.toggle('hidden',mode!=='kanban');
 $('kanbanView').classList.toggle('hidden',mode!=='kanban');
 $('hierarchyView').classList.toggle('hidden',mode!=='hierarchy');
 updateKanbanScrollControls();
}
function renderBoard(){renderHybridBoard();}
async function changeState(w,state){await updateWorkItemState(w,state);renderBacklog();renderBoard();}
async function capture(){let s;try{s=requireSprint();}catch(e){return notify(e.message,true);}const missing=s.itemIds.filter(id=>![...items,...assignedItems].some(w=>w.id===id));if(missing.length)return notify(`Load all committed work items before capturing a baseline. ${missing.length} item(s) are not currently loaded.`,true);const snapshot={at:new Date().toISOString(),items:s.itemIds.map(id=>{const w=[...items,...assignedItems].find(x=>x.id===id);return {id,project:w.project,title:w.title,type:w.type,state:w.state,effort:w.effort,storyPoints:w.storyPoints};})};const ok=await persist(r=>{r.sprints.find(x=>x.id===s.id).snapshots.push(snapshot);});if(ok){renderHistory();notify(`Commitment baseline captured with ${snapshot.items.length} work items at ${new Date(snapshot.at).toLocaleString()}. Open History Record to inspect it.`);}}

// Advisory sprint-readiness checks. No mutations, enforced cadence, or new persisted schema.
function renderGuidance(){
 const summary=$('guidanceSummary'),list=$('guidanceChecks');
 if(!summary||!list)return;
 list.replaceChildren();
 const sprint=registry?.sprints?.find(x=>x.id===$('sprintPicker').value);
 if(!sprint){summary.textContent='Select or save a global sprint to see its summary.';renderPlanningSteps();return;}
 const ids=sprint.itemIds||[],available=new Map([...items,...assignedItems].map(w=>[w.id,w]));
 const restored=ids.map(id=>available.get(id)).filter(Boolean);
 const executable=restored.filter(w=>!isPlanningContextType(w));
 const context=restored.filter(isPlanningContextType);
 const missing=ids.length-restored.length;
 const checks=[];
 const add=(label,detail,good=false,work=[])=>checks.push({label,detail,good,work});
 const start=$('start').value,end=$('end').value,goal=$('goal').value.trim(),status=$('status').value;
 add('Sprint objective',goal?'An objective is recorded.':'Consider defining a clear outcome for this sprint.',!!goal);
 if(start&&end){const days=Math.round((Date.parse(end+'T12:00:00')-Date.parse(start+'T12:00:00'))/86400000)+1;add('Planning window',days>0?`${days} calendar days (${start} through ${end}). No prescribed sprint duration.`:'End date is before the start date.',days>0);}else add('Planning window','Dates are optional; add a delivery window when useful.');
 add('Executable commitments',`${executable.length} restored executable items; ${context.length} Epic/Feature context items excluded from execution counts.${missing?' '+missing+' assigned items not yet loaded; totals are incomplete.':''}`,executable.length>0&&!missing,executable);
 if(missing)add('Incomplete data',`${missing} assigned items have not loaded. Progress and ownership checks are partial. Refresh work items before relying on these figures.`);
 const unassigned=executable.filter(w=>!w.assignee||w.assignee==='Unassigned');
 add('Ownership',unassigned.length?`${unassigned.length} executable items have no assignee.`:'All restored executable items have an assignee.',!unassigned.length&&!missing,unassigned);
 const finished=executable.filter(w=>/^(done|closed|resolved|accepted|completed)$/i.test(w.state||''));
 const notStarted=executable.filter(w=>/^(new|to do|proposed|approved)$/i.test(w.state||''));
 add('Execution progress',`${finished.length} of ${executable.length} restored executable items in completion states (item count, not effort). ${notStarted.length} not started.`,finished.length>0,notStarted);
 const today=new Date().toISOString().slice(0,10);
 const overdue=executable.filter(w=>{const d=w.dueDate||w.targetDate;return d&&String(d).slice(0,10)<today&&!finished.includes(w);});
 if(overdue.length)add('Past-due work',`${overdue.length} incomplete items have dates before today.`,false,overdue);
 const snapshots=sprint.snapshots||[];
 if(snapshots.length){const first=new Set((snapshots[0].items||[]).map(w=>w.id));const added=executable.filter(w=>!first.has(w.id));add('Changes since first baseline',`${added.length} restored executable items added since the first snapshot. Historical snapshots are preserved.`,!added.length,added);}else add('Commitment baseline','Capture a baseline when the team agrees on the initial commitments.');
 if(status==='Active'&&!goal)add('Active sprint review','The active sprint has no objective.');
 if(status==='Closed')add('Closure review','Review incomplete work before accepting closure.');
 summary.textContent=`${status} · ${executable.length} executable items restored · ${context.length} context items · ${missing} not loaded`;
 for(const check of checks){const li=document.createElement('li');li.className=check.good?'guidance-good':'guidance-note';const strong=document.createElement('strong');strong.textContent=check.label+': ';li.append(strong,document.createTextNode(check.detail));
 if(check.work?.length){const links=document.createElement('span');links.className='guidance-work-links';for(const w of check.work.slice(0,12)){const link=workItemLink(w);link.textContent='#'+w.id;links.append(link);}li.append(links);if(check.work.length>12)li.append(document.createTextNode(` and ${check.work.length-12} more`));}list.append(li);}
 renderPlanningSteps();
}

function guidancePreferenceKey(){const s=currentSprint();return s?`pnpc-gs-guidance-dismissed:${activeWorkspace()?.id||'default'}:${s.id}`:null;}
function renderPlanningSteps(){
 const node=$('planningSteps'),panel=$('guidancePanel'),content=$('guidanceContent'),dismiss=$('guidanceDismiss'),restore=$('guidanceRestore');
 if(!node)return;
 node.replaceChildren();const s=currentSprint(),key=guidancePreferenceKey();
 const hidden=!!(key&&localStorage.getItem(key)==='1');content.classList.toggle('hidden',hidden);dismiss.classList.toggle('hidden',hidden);restore.classList.toggle('hidden',!hidden);
 if(!s){node.textContent='Select a sprint to begin planning.';dismiss.disabled=true;return;}dismiss.disabled=false;
 const steps=[
  {name:'Define the sprint objective',done:!!$('goal').value.trim(),help:'Describe the outcome the team intends to deliver.',target:'goal'},
  {name:'Review the planning dates',done:!!$('start').value&&!!$('end').value&&$('start').value<=$('end').value,help:'Choose a useful delivery window; no fixed sprint length is required.',target:'start'},
  {name:'Select committed work',done:(s.itemIds||[]).length>0,help:'Use Board → Backlog to browse and add work directly.',tab:'board'},
  {name:'Capture a commitment baseline',done:(s.snapshots||[]).length>0,help:'Capture a baseline once the team agrees on its initial work.',target:'capture'},
  {name:'Plan sprint ceremonies',done:(s.ceremonies||[]).length>0,help:'Use the Guided Ceremony Planner to preview standups, review and refinement.',target:'ceremonyAssistant'}
 ];
 for(const step of steps){const li=document.createElement('li');const status=document.createElement('strong');status.textContent=(step.done?'✓ Done: ':'○ To do: ')+step.name;li.append(status,document.createTextNode(' — '+(step.done?'Completed.':step.help)+' '));if(!step.done){const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.textContent=step.tab?'Open Board':'Go to step';btn.addEventListener('click',()=>{if(step.tab){const tab=document.querySelector('[data-tab="board"]');tab?.click();}else{const el=$(step.target);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus?.();}});li.append(btn);}node.append(li);}
}
$('guidanceDismiss').addEventListener('click',()=>{const key=guidancePreferenceKey();if(key)localStorage.setItem(key,'1');renderPlanningSteps();});
$('guidanceRestore').addEventListener('click',()=>{const key=guidancePreferenceKey();if(key)localStorage.removeItem(key);renderPlanningSteps();});

function renderHistory(){
 renderGuidance();const sp=currentSprint(),records=(sp?.snapshots||[]).map((record,index)=>({record,index})).filter(x=>!x.record.automatic);
 const btn=$('historyToggle'),root=$('history');if(btn)btn.textContent=`History Record (${records.length})`;if(!root)return;
 root.replaceChildren();if(!records.length){root.textContent='No commitment records yet. Capture a baseline to begin.';return;}
 for(const {record,index} of records.reverse()){
  const details=document.createElement('details');details.className='panel';details.style.margin='8px 0';
  const stamp=reportSnapshotTimestamp(record.at),summary=document.createElement('summary');summary.textContent=`Record ${index+1} · ${stamp?new Date(stamp).toLocaleString():'Date unavailable (legacy record)'} · ${(record.items||[]).length} work items`;details.append(summary);
  const description=document.createElement('p');description.className='muted';description.textContent='Captured source states at this point in time. This is not a restore point.';details.append(description);
  const table=document.createElement('table');const head=document.createElement('thead');const tr=document.createElement('tr');for(const label of ['ID','Project','Work item','Recorded state']){const th=document.createElement('th');th.textContent=label;tr.append(th);}head.append(tr);table.append(head);
  const body=document.createElement('tbody');for(const item of record.items||[]){const row=document.createElement('tr');for(const value of [item.id,item.project,item.title,item.state]){const td=document.createElement('td');td.textContent=String(value??'—');row.append(td);}body.append(row);}table.append(body);const wrap=document.createElement('div');wrap.style.overflowX='auto';wrap.append(table);details.append(wrap);
  const download=document.createElement('button');download.type='button';download.className='secondary';download.textContent='Download record (JSON)';download.title='Export this historical capture without changing the sprint';download.addEventListener('click',()=>{const payload={schema:'pnpc.commitment-record.v1',sprintId:sp.id,sprintName:sp.name,recordNumber:index+1,capturedAt:stamp||null,record};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`global-sprint-commitment-${index+1}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});details.append(download);
  const csv=document.createElement('button');csv.type='button';csv.className='secondary';csv.textContent='Download CSV';csv.title='Download this capture as a spreadsheet-compatible CSV';csv.style.marginLeft='8px';csv.addEventListener('click',()=>{
   const fields=['Capture date','Sprint','Record number','Work item ID','Project','Title','Recorded state'];
   const quote=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,'\u0027$&').replace(/"/g,'""')+'"';
   const rows=[fields,...(record.items||[]).map(item=>[stamp||'',sp.name,index+1,item.id,item.project,item.title,item.state])];
   const content='\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
   const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`global-sprint-commitment-${index+1}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });details.append(csv);root.append(details);
 }
}
// Keep history with its originating Global Sprint card, rather than a distant panel.
$('historyToggle').closest('.row')?.after($('historyPanel'));
$('historyToggle').addEventListener('click',()=>{const panel=$('historyPanel'),show=panel.classList.contains('hidden');panel.classList.toggle('hidden',!show);$('historyToggle').setAttribute('aria-expanded',String(show));if(show)renderHistory();});

// Legacy toolbar movement is retired; lane headers own their controls.
$('configureLane').onclick=()=>{if(!currentSprint())return notify('Select a sprint first.',true);openLaneMappingList();};
$('downloadDiagnostics').onclick=downloadDiagnostics;
// Sessions remain internal; production users see only support health and exports.
$('diagnosticClear').onclick=clearDiagnostics;
initializeMeetingTimePickers();
$('auditRunButton').onclick=runAutomatedAudit;
$('auditExportButton').onclick=exportAutomatedAudit;
try{const parsed=JSON.parse(localStorage.getItem(DIAG_KEY)||'[]');diagnosticEvents=Array.isArray(parsed)?parsed.slice(-DIAG_LIMIT).map(sanitizedDiagnosticEvent).filter(Boolean):[];}catch(_){diagnosticEvents=[];}startDiagnosticSession();
window.addEventListener('error',e=>{if(/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(String(e.message||'')))return;diagnostic('runtime.error',{message:String(e.message).slice(0,250)},'error');});
window.addEventListener('unhandledrejection',e=>diagnostic('runtime.rejection',{message:String(e.reason?.message||e.reason).slice(0,250)},'error'));
$('boardMode').onchange=()=>{rememberContext();renderBoard();};$('addLane').onclick=addLane;$('renameLane').onclick=renameLane;$('removeLane').onclick=removeLane;
$('manageProjects').onclick=toggleProjectManager;$('includeProjects').onclick=()=>moveProjects(true);$('excludeProjects').onclick=()=>moveProjects(false);$('saveProjectPreferences').onclick=saveProjectPreferences;$('newSprint').onclick=newSprint;$('saveSprint').onclick=saveSprint;$('capture').onclick=capture;$('refresh').onclick=loadItems;$('sprintPicker').onchange=switchSprint;
 ['sprintName','start','end','goal','status'].forEach(id=>{ $(id).addEventListener('input',()=>{updateDirty();renderGuidance();});$(id).addEventListener('change',()=>{updateDirty();renderGuidance();}); });$('search').oninput=handleSearch;

// Provide consistent immediate visual response for all action buttons.
document.addEventListener('pointerdown',e=>{const button=e.target.closest('button');if(button&&!button.disabled)button.classList.add('is-pressed');},true);
document.addEventListener('pointerup',()=>document.querySelectorAll('button.is-pressed').forEach(b=>b.classList.remove('is-pressed')),true);
document.addEventListener('pointercancel',()=>document.querySelectorAll('button.is-pressed').forEach(b=>b.classList.remove('is-pressed')),true);
document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;button.classList.add('was-activated');setTimeout(()=>button.classList.remove('was-activated'),650);},true);

$('workspacePicker').onchange=()=>void switchWorkspace();
$('createWorkspace').onclick=()=>void createWorkspace();
$('renameWorkspace').onclick=()=>void renameWorkspace();
$('archiveWorkspace').onclick=()=>void archiveWorkspace();
$('restoreWorkspace').onclick=showArchivedWorkspaces;
$('saveWorkspaceProjects').onclick=()=>void saveWorkspaceProjects();
$('saveBoardDraft').onclick=()=>void saveBoardDraft();$('resetSprintBoard').onclick=()=>void resetSprintBoard();$('restoreBoardDraft').onclick=()=>void restoreBoardDraft();$('deleteBoardDraft').onclick=()=>void deleteBoardDraft();
$('boardDensity').addEventListener('change',()=>{rememberContext();renderBoard();});

$('browseLoad').onclick=browseBacklog;
$('browseMode').onchange=()=>{rememberContext();renderBrowser();};
$('browseProject').onchange=()=>{browserItems=[];renderBrowser();rememberContext();browseNotice('Choose Browse backlog to load this project.');};
$('project').onchange=rememberContext;
$('kanbanScrollLeft').addEventListener('click',()=>{$('board').scrollBy({left:-Math.max(260,$('board').clientWidth*.65),behavior:'smooth'});});
$('kanbanScrollRight').addEventListener('click',()=>{$('board').scrollBy({left:Math.max(260,$('board').clientWidth*.65),behavior:'smooth'});});
$('board').addEventListener('scroll',updateKanbanScrollControls,{passive:true});
window.addEventListener('resize',updateKanbanScrollControls);

$('lanePurpose').addEventListener('change',()=>{const preset=LANE_PRESETS[$('lanePurpose').value];if(preset)$('laneCategory').value=preset;refreshLaneOverride();});
$('laneCategory').addEventListener('change',()=>{$('laneOverrideAccept').checked=false;refreshLaneOverride();});
$('laneSave').onclick=()=>void commitLaneEditor();$('laneCancel').onclick=closeLaneDialog;

// v0.3.20: tab navigation and sprint-scoped ceremony records.
let selectedCeremonyId=null;let selectedWorkspaceMeeting=null;let expandedScheduleId=null;let calendarScheduleId=null;
// Optional relevant-people suggestions. People.Read does not grant access to mailbox contents.
// The Microsoft Search person endpoint requires broader Mail.Read consent; do not request it for autocomplete.
let peopleLookupEnabled=false,peopleLookupTimer=null,peopleLookupSerial=0;
const PEOPLE_LOOKUP_PREF='pnpc-gs-people-suggestions-v1';
function peopleLookupPreferenceKey(){
 const account=m365Account?.homeAccountId||m365Account?.username;
 return account?PEOPLE_LOOKUP_PREF+':'+String(account).toLowerCase():null;
}
function peopleLookupSetUI(message=''){
 const button=$('contactLookupEnable');
 if(button){button.textContent=peopleLookupEnabled?'Remove Permissions':'Enable Outlook Recipient Suggestions';
  button.setAttribute('aria-pressed',String(peopleLookupEnabled));}
 if(message)peopleLookupClear(message);
}
function peopleLookupClear(message=''){
 const results=$('contactLookupResults');if(results){results.replaceChildren();results.hidden=true;}
 if(message)$('contactLookupStatus').textContent=message;
}
function peopleLookupTerm(){
 const input=$('ceremonyParticipants');const part=(input?.value||'').split(/[,;\n]/).pop().trim();
 return part.length>=2?part:'';
}
async function peopleLookupRestore(){
 peopleLookupEnabled=false;++peopleLookupSerial;
 const key=peopleLookupPreferenceKey();
 try{
  if(key&&localStorage.getItem(key)==='enabled'){
   await m365Client.acquireTokenSilent({account:m365Account,scopes:['People.Read']});
   peopleLookupEnabled=true;
  }
 }catch(e){diagnostic('m365.people.silent_unavailable',{message:String(e.message||e)},'warn');}
 peopleLookupSetUI(peopleLookupEnabled?'Recipient suggestions ready.':'Enable suggestions to look up people from Microsoft 365.');
}
async function peopleLookupEnable(){
 if(!m365Client||!m365Account){peopleLookupClear('Connect Microsoft 365 in Configuration first.');return;}
 const button=$('contactLookupEnable');button.disabled=true;
 try{
  const key=peopleLookupPreferenceKey();
  if(peopleLookupEnabled){
   // This disables this application's feature and removes its saved preference.
   // Microsoft tenant/account consent is managed separately in Microsoft account settings.
   if(key)localStorage.removeItem(key);
   peopleLookupEnabled=false;++peopleLookupSerial;
   peopleLookupSetUI('Recipient suggestions disabled locally. To revoke Microsoft consent, manage app permissions in your Microsoft account or tenant.');
  }else{
   await m365Client.acquireTokenPopup({account:m365Account,scopes:['People.Read']});
   peopleLookupEnabled=true;
   if(key)localStorage.setItem(key,'enabled');
   peopleLookupSetUI('Recipient suggestions enabled. Type at least two characters.');
   void peopleLookupSearch();
  }
 }catch(e){peopleLookupClear('Recipient suggestions could not be changed. Manual email entry remains available.');}
 finally{button.disabled=false;}
}
async function peopleLookupSearch(){
 const term=peopleLookupTerm(),seq=++peopleLookupSerial;
 if(!peopleLookupEnabled||!m365Account||term.length<2){peopleLookupClear(peopleLookupEnabled?'Type at least two characters of a name or email.':'Manual email entry remains available.');return;}
 $('contactLookupStatus').textContent='Searching relevant people from your Microsoft 365 account…';
 try{
  const token=(await m365Client.acquireTokenSilent({account:m365Account,scopes:['People.Read']})).accessToken;
  const params=new URLSearchParams({'$search':'"'+term.replace(/"/g,'')+'"','$top':'15'});
  const response=await fetch('https://graph.microsoft.com/v1.0/me/people?'+params.toString(),{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  if(!response.ok)throw Error('Microsoft Graph people request failed ('+response.status+').');
  const data=await response.json();if(seq!==peopleLookupSerial)return;
  const results=$('contactLookupResults');results.replaceChildren();const seen=new Set();
  for(const person of data.value||[]){
   const addresses=[person.scoredEmailAddresses?.[0]?.address,person.emailAddresses?.[0]?.address,person.emailAddress,person.userPrincipalName];
   const email=addresses.map(x=>String(x||'').trim()).find(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
   if(!email||seen.has(email.toLowerCase()))continue;seen.add(email.toLowerCase());
   const option=document.createElement('button');option.type='button';option.className='secondary';option.setAttribute('role','option');
   option.textContent=(person.displayName||email)+' · '+email;
   option.addEventListener('click',()=>{
    const input=$('ceremonyParticipants');const pieces=input.value.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
    if(pieces.length&&pieces[pieces.length-1].toLowerCase()===term.toLowerCase())pieces.pop();
    if(!pieces.some(x=>x.toLowerCase()===email.toLowerCase()))pieces.push(email);
    input.value=pieces.join(', ')+(pieces.length?', ':'');input.focus();peopleLookupClear('Recipient added. Continue typing to add more.');
   });results.append(option);
  }
  results.hidden=!results.children.length;
  $('contactLookupStatus').textContent=results.children.length?results.children.length+' suggested recipient(s). Select one to add.':'No relevant people found. You can enter any email address manually.';
 }catch(e){if(seq===peopleLookupSerial)peopleLookupClear('Recipient suggestions unavailable. Manual email entry still works.');}
}
$('contactLookupEnable').addEventListener('click',()=>void peopleLookupEnable());
$('ceremonyParticipants').addEventListener('input',()=>{
 clearTimeout(peopleLookupTimer);peopleLookupClear();
 peopleLookupTimer=setTimeout(()=>void peopleLookupSearch(),350);
});
const GS_TAB_STORAGE='pnpc-gs-tab';
const GS_TAB_PERSIST='pnpc-gs-last-tab-v1';
const CEREMONY_FIELDS=['ceremonyType','ceremonyTitle','ceremonyDate','ceremonyTime','ceremonyDuration','ceremonyParticipants','ceremonySecondary','ceremonyStatus','ceremonyAgenda','ceremonyOutcome'];
const GS_VALID_TABS=['board','planning','reports','demo','configuration','support'];
let requestedTab='board';
function showTab(name,remember=true){
 if(!GS_VALID_TABS.includes(name))name='board';
 diagnostic('ui.tab.opened',{tab:name});
 document.querySelectorAll('.gs-tab').forEach(b=>{const on=b.dataset.tab===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
 document.querySelectorAll('.gs-tab-panel').forEach(p=>p.classList.toggle('hidden',p.id!=='tab-'+name));
 if(name==='reports'){renderSprintHealth();renderTimeline();}if(name==='planning'){renderCeremonies();renderSprintHealth();}if(name==='board')renderBoard();
 if(remember){requestedTab=name;try{sessionStorage.setItem(GS_TAB_STORAGE,name);localStorage.setItem(GS_TAB_PERSIST,name);}catch{}rememberContext();}
 if(contextKey||remember)document.body.classList.remove('gs-initializing');
}
function activateTab(name){
 if(!GS_VALID_TABS.includes(name))name='board';
 requestedTab=name;
 // Restricted tab buttons are disabled by renderRoomAccess; never redirect.
 if(ROOM_ENFORCE_PREVIEW&&roomStatus&&!roomAccessAllowed()&&['board','planning','reports','demo'].includes(name))return;
 showTab(name,true);
}
document.querySelectorAll('.gs-tab').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab)));
// A fresh hub navigation opens Board; an actual browser reload retains the active tab.
// The licensing gate must never replace that requested destination with Configuration.
try{
 // Azure DevOps may recreate the extension iframe on a host-page refresh.
 // Session storage is not guaranteed to survive that lifecycle; use the durable
 // last user-selected tab as fallback, never a temporary access-gate tab.
 const previous=sessionStorage.getItem(GS_TAB_STORAGE)||localStorage.getItem(GS_TAB_PERSIST);
 requestedTab=GS_VALID_TABS.includes(previous)?previous:'board';showTab(requestedTab,false);
}catch{showTab('board',false);}
if(ROOM_ENFORCE_PREVIEW&&roomStatus&&!roomAccessAllowed())renderRoomAccess();
let referenceCalendarMonth='';
function renderMeetingReferenceCalendar(){
 const host=$('meetingReferenceCalendar');if(!host)return;
 const chosen=$('ceremonyDate').value||reportToday();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(chosen))return;
 if(!referenceCalendarMonth)referenceCalendarMonth=chosen.slice(0,7);
 const [year,month]=referenceCalendarMonth.split('-').map(Number);
 const first=new Date(Date.UTC(year,month-1,1)),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const existing=[...(activeScheduleWorkspace()?.meetingSchedules||[]).flatMap(x=>x.meetings||[]),...(currentSprint()?.ceremonies||[])];
 const onDate=new Map();for(const m of existing){if(!m.date)continue;onDate.set(m.date,(onDate.get(m.date)||[]).concat(m.title||m.type||'Meeting'));}
 // Show a preview of the selected native Outlook recurrence without creating events.
 const repeat=$('ceremonyRepeat')?.value||'none',end=$('ceremonyRepeatEnd')?.value||'',selected=$('ceremonyDate')?.value||'';
 const weekdays=new Set([...document.querySelectorAll('#ceremonyWeekdays input:checked')].map(x=>x.value));
 const dayNames=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 const preview=new Set();
 if(repeat!=='none'&&selected&&end&&end>=selected){const interval=repeat==='weekly'?1:Math.max(1,Number($('ceremonyInterval')?.value)||2);const anchor=new Date(selected+'T12:00:00Z');
  for(let d=1;d<=days;d++){const date=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;if(date<selected||date>end)continue;const dateObj=new Date(date+'T12:00:00Z');const weeks=Math.floor((dateObj-anchor)/604800000);if(weeks<0||weeks%interval!==0)continue;const dow=dayNames[dateObj.getUTCDay()];if(repeat==='weekly'?weekdays.has(dow):dateObj.getUTCDay()===anchor.getUTCDay())preview.add(date);}
 }
 host.replaceChildren();const toolbar=document.createElement('div');toolbar.className='row gs-calendar-toolbar';
 const prev=document.createElement('button'),next=document.createElement('button'),heading=document.createElement('strong');prev.type=next.type='button';prev.className=next.className='secondary';prev.textContent='‹';next.textContent='›';heading.textContent=first.toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});toolbar.append(prev,heading,next);host.append(toolbar);
 const navigate=delta=>{const d=new Date(Date.UTC(year,month-1+delta,1));referenceCalendarMonth=d.toISOString().slice(0,7);renderMeetingReferenceCalendar();};prev.onclick=()=>navigate(-1);next.onclick=()=>navigate(1);
 const grid=document.createElement('div');grid.className='gs-meeting-calendar-grid';
 for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){const label=document.createElement('strong');label.textContent=day;grid.append(label);}
 for(let i=0;i<offset;i++)grid.append(document.createElement('span'));
 for(let d=1;d<=days;d++){const date=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const b=document.createElement('button');b.type='button';b.textContent=String(d);b.className='gs-calendar-day'+(date===chosen?' selected':'')+(onDate.has(date)?' has-meeting':'')+(preview.has(date)?' proposed-occurrence':'');b.title=onDate.has(date)?onDate.get(date).join(' · '):preview.has(date)?'Proposed recurring meeting · '+date:'Choose '+date;b.onclick=()=>{$('ceremonyDate').value=date;renderMeetingReferenceCalendar();renderRecurrenceExplanation();};grid.append(b);}
 host.append(grid);
 const note=document.createElement('small');note.className='muted';note.textContent='Blue dates contain saved meeting records; outlined dates preview the proposed recurrence. Existing Outlook series occurrences are not fetched.';host.append(note);
}
function renderRecurrenceExplanation(){
 const host=$('ceremonyRecurrenceExplanation');if(!host)return;
 const mode=$('ceremonyRepeat').value,days=[...document.querySelectorAll('#ceremonyWeekdays input:checked')].map(x=>x.parentElement.textContent.trim());
 const type=$('ceremonyType').value,standup=/standup/i.test(type);
 renderMeetingReferenceCalendar();host.textContent=mode==='none'?'One meeting on the selected date.':mode==='weekly'?`Repeats every week${days.length?' on '+days.join(', '):' (choose at least one weekday)'}. One Outlook series, not separate weekly bookings.`:`Repeats every ${Number($('ceremonyInterval').value)||2} week(s) on the selected weekday. Intended for regular sprint ceremonies, not weekly standups.`;
 const interval=$('ceremonyInterval').closest('div');if(interval)interval.classList.toggle('hidden',mode!=='sprint');
 const weekdays=$('ceremonyWeekdays').closest('div');if(weekdays)weekdays.classList.toggle('hidden',mode!=='weekly');
 const end=$('ceremonyRepeatEnd').closest('div');if(end)end.classList.toggle('hidden',mode==='none');
 if(standup&&mode==='sprint')host.textContent+=' Standups normally repeat weekly; select Weekly on selected days instead.';
}
for(const id of ['ceremonyRepeat','ceremonyInterval','ceremonyRepeatEnd'])$(id)?.addEventListener('change',renderRecurrenceExplanation);
$('ceremonyType')?.addEventListener('change',()=>{if(!selectedCeremonyId&&/standup/i.test($('ceremonyType').value)&&$('ceremonyRepeat').value==='none'){$('ceremonyRepeat').value='weekly';document.querySelectorAll('#ceremonyWeekdays input').forEach(x=>x.checked=['monday','tuesday','wednesday','thursday','friday'].includes(x.value));}renderRecurrenceExplanation();});
document.querySelectorAll('#ceremonyWeekdays input').forEach(x=>x.addEventListener('change',renderRecurrenceExplanation));
$('ceremonyDate').addEventListener('change',()=>{referenceCalendarMonth=$('ceremonyDate').value.slice(0,7);renderMeetingReferenceCalendar();renderRecurrenceExplanation();});
function ceremonyForm(){return {type:$('ceremonyType').value,title:$('ceremonyTitle').value.trim(),date:$('ceremonyDate').value,time:$('ceremonyTime').value,duration:Number($('ceremonyDuration').value)||30,participants:$('ceremonyParticipants').value.trim(),secondary:$('ceremonySecondary').value,status:$('ceremonyStatus').value,agenda:$('ceremonyAgenda').value.trim(),outcome:$('ceremonyOutcome').value.trim(),repeat:$('ceremonyRepeat').value,repeatInterval:Number($('ceremonyInterval').value)||1,repeatDays:[...document.querySelectorAll('#ceremonyWeekdays input:checked')].map(x=>x.value),repeatEnd:$('ceremonyRepeatEnd').value};}
function resetCeremony(){selectedCeremonyId=null;selectedWorkspaceMeeting=null;for(const id of CEREMONY_FIELDS){const el=$(id);if(el.tagName==='SELECT')el.selectedIndex=0;else el.value='';}$('ceremonyDuration').value='30';$('ceremonyRepeat').value='none';$('ceremonyInterval').value='2';$('ceremonyRepeatEnd').value='';document.querySelectorAll('#ceremonyWeekdays input').forEach(x=>x.checked=false);$('ceremonyEditStatus').textContent='New meeting record';referenceCalendarMonth='';renderMeetingReferenceCalendar();renderRecurrenceExplanation();$('saveCeremony').textContent='Save ceremony';}
function editCeremony(id,source=null){$('ceremonyPanel').open=true;const s=currentSprint();const w=activeScheduleWorkspace();const found=source?{record:w?.meetingSchedules?.find(x=>x.id===source)?.meetings?.find(x=>x.id===id),scheduleId:source}:((s?.ceremonies||[]).some(x=>x.id===id)?{record:s.ceremonies.find(x=>x.id===id)}:findWorkspaceMeeting(id));const c=found?.record;if(!c)return;selectedCeremonyId=id;selectedWorkspaceMeeting=found.scheduleId||null;const map={ceremonyType:c.type,ceremonyTitle:c.title,ceremonyDate:c.date,ceremonyTime:c.time,ceremonyDuration:c.duration,ceremonyParticipants:c.participants,ceremonySecondary:c.secondary,ceremonyStatus:c.status,ceremonyAgenda:c.agenda,ceremonyOutcome:c.outcome};for(const [key,value] of Object.entries(map)){if(key==='ceremonyTime')populateMeetingTimePicker($(key),value||'09:30');else $(key).value=value??'';}$('ceremonyRepeat').value=c.repeat||'none';$('ceremonyInterval').value=c.repeatInterval||2;$('ceremonyRepeatEnd').value=c.repeatEnd||'';document.querySelectorAll('#ceremonyWeekdays input').forEach(x=>x.checked=(c.repeatDays||[]).includes(x.value));referenceCalendarMonth=(c.date||'').slice(0,7);renderMeetingReferenceCalendar();renderRecurrenceExplanation();$('ceremonyEditStatus').textContent=selectedWorkspaceMeeting?'Editing workspace schedule meeting':'Editing saved ceremony';$('saveCeremony').textContent=c.outlook?.state==='booked'?'Update ceremony & Outlook':'Update ceremony';$('ceremonyPanel').scrollIntoView({block:'start',behavior:'smooth'});}
function findWorkspaceMeeting(id){for(const sc of activeScheduleWorkspace()?.meetingSchedules||[]){const record=(sc.meetings||[]).find(m=>m.id===id);if(record)return {record,scheduleId:sc.id};}return null;}
async function saveCeremony(){const linked=selectedCeremonyId?outlookCeremonyRecord(selectedCeremonyId,selectedWorkspaceMeeting):null;if(linked?.outlook?.state==='booked')return outlookUpdateCeremony(selectedCeremonyId,selectedWorkspaceMeeting,ceremonyForm());if(linked?.outlook?.state)return notify('This Outlook operation needs review before editing.',true);const sp=currentSprint(),w=activeScheduleWorkspace();if(!sp&&!selectedWorkspaceMeeting)return notify('Select a sprint or existing meeting.',true);const c=ceremonyForm();if(c.date&&c.time){try{outlookLocalTime(c.date,c.time,c.duration);}catch(e){return notify(String(e.message||e),true);}}if(c.secondary===c.type)return notify('Choose a different secondary ceremony purpose.',true);if(c.duration<5||c.duration>480)return notify('Duration must be 5–480 minutes.',true);if(c.status==='Scheduled externally'&&!c.date)return notify('Enter a date for an externally scheduled meeting.',true);const id=selectedCeremonyId||crypto.randomUUID();const scheduleId=selectedWorkspaceMeeting;const now=new Date().toISOString();const ok=await persist(r=>{if(scheduleId){const target=r.workspaces.find(x=>x.id===w.id)?.meetingSchedules?.find(x=>x.id===scheduleId)?.meetings?.find(x=>x.id===id);if(!target)throw Error('Workspace meeting no longer exists.');Object.assign(target,c,{updatedAt:now,manuallyEdited:true});}else{const target=r.sprints.find(x=>x.id===sp.id);target.ceremonies ||= [];const existing=target.ceremonies.find(x=>x.id===id);if(existing)Object.assign(existing,c,{updatedAt:now});else target.ceremonies.push({...c,id,createdAt:now,updatedAt:now});}},false);if(ok){resetCeremony();renderCeremonies();renderWorkspaceSchedules();renderCeremonyInsights();renderPmAssistance();notify('Meeting record saved. No Outlook event was created.');}}
async function deleteCeremony(id,scheduleId=null){const linked=outlookCeremonyRecord(id,scheduleId);if(linked?.outlook?.state&&linked.outlook.state!=='cancelled')return notify('Cancel the Outlook meeting and confirm cancellation before removing this record. Unresolved Outlook operations must be reviewed first.',true);const sp=currentSprint(),w=activeScheduleWorkspace();if(!confirm(linked?.outlook?.state==='cancelled'?'Remove this cancelled meeting from Global Sprints? Its Outlook event has already been cancelled.':'Remove this meeting record from Global Sprints?'))return;const ok=await persist(r=>{if(scheduleId){const sc=r.workspaces.find(x=>x.id===w.id)?.meetingSchedules?.find(x=>x.id===scheduleId);if(!sc)throw Error('Schedule missing.');const meeting=(sc.meetings||[]).find(x=>x.id===id);if(!meeting)throw Error('Meeting no longer exists.');if(meeting.outlook?.state&&meeting.outlook.state!=='cancelled')throw Error('Outlook event is not cancelled.');sc.meetings=(sc.meetings||[]).filter(x=>x.id!==id);}else{const target=r.sprints.find(x=>x.id===sp?.id);if(!target)throw Error('Sprint missing.');const meeting=(target.ceremonies||[]).find(x=>x.id===id);if(!meeting)throw Error('Meeting no longer exists.');if(meeting.outlook?.state&&meeting.outlook.state!=='cancelled')throw Error('Outlook event is not cancelled.');target.ceremonies=(target.ceremonies||[]).filter(x=>x.id!==id);}},false);if(ok){if(selectedCeremonyId===id)resetCeremony();renderCeremonies();renderWorkspaceSchedules();renderCeremonyInsights();renderPmAssistance();notify('Meeting record removed from Planning.');}}

// Outlook event creation is intentionally explicit. The internal ceremony is saved first.
// A pending operation is persisted BEFORE calling Graph, so an uncertain response cannot
// cause an accidental second invitation. Do not automatically retry an uncertain POST.
let outlookBookingBusy=false;
function outlookCeremonyRecord(id,scheduleId=null){
 const w=activeScheduleWorkspace(),sp=currentSprint();
 return scheduleId
  ? w?.meetingSchedules?.find(x=>x.id===scheduleId)?.meetings?.find(x=>x.id===id)
  : sp?.ceremonies?.find(x=>x.id===id);
}
function outlookAttendees(raw){
 const values=String(raw||'').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
 const unique=[...new Set(values.map(s=>s.toLowerCase()))];
 if(unique.some(s=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))
  throw Error('Participants must be email addresses separated by commas or semicolons. Remove names without email addresses.');
 return unique.map(address=>({emailAddress:{address},type:'required'}));
}
function outlookLocalTime(date,time,duration){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{2}:\d{2}$/.test(time||''))throw Error('Enter a meeting date and time.');
 const hour=Number(time.slice(0,2)),minute=Number(time.slice(3,5));
 if(hour>23||minute>59)throw Error('Invalid meeting time.');
 const start=new Date(`${date}T${time}:00`);
 if(!Number.isFinite(start.getTime())||start.getFullYear()!==Number(date.slice(0,4))||start.getMonth()+1!==Number(date.slice(5,7))||start.getDate()!==Number(date.slice(8,10))||start.getHours()!==hour||start.getMinutes()!==minute)throw Error('Invalid or nonexistent local meeting date/time (check daylight saving time).');
 const mins=Number(duration);
 if(!Number.isFinite(mins)||mins<5||mins>480)throw Error('Meeting duration must be 5–480 minutes.');
 const end=new Date(start.getTime()+mins*60000);
 // Graph accepts ISO UTC; the user's browser timezone determines the local meeting time.
 return {start:{dateTime:start.toISOString().replace(/\.\d{3}Z$/,'Z'),timeZone:'UTC'},end:{dateTime:end.toISOString().replace(/\.\d{3}Z$/,'Z'),timeZone:'UTC'}};
}
const OUTLOOK_DAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function outlookNativeRecurrence(c){
 if(!c.repeat||c.repeat==='none')return null;
 if(!['weekly','sprint'].includes(c.repeat))throw Error('Unsupported Outlook recurrence pattern.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(c.repeatEnd||''))throw Error('Choose a recurrence end date.');
 const first=new Date(c.date+'T12:00:00'),last=new Date(c.repeatEnd+'T12:00:00');
 if(!Number.isFinite(first.getTime())||!Number.isFinite(last.getTime())||last<first)throw Error('Recurrence end date must be on or after the first meeting.');
 const interval=c.repeat==='weekly'?1:Number(c.repeatInterval);
 if(!Number.isInteger(interval)||interval<1||interval>52)throw Error('Repeat interval must be 1–52 weeks.');
 const days=c.repeat==='weekly'?[...new Set(c.repeatDays||[])]:[OUTLOOK_DAYS[first.getDay()]];
 if(!days.length||days.some(d=>!OUTLOOK_DAYS.includes(d)))throw Error('Select at least one valid recurring weekday.');
 if(!days.includes(OUTLOOK_DAYS[first.getDay()]))throw Error('The first meeting date must fall on a selected recurrence weekday.');
 // Graph recurrence uses the Outlook mailbox timezone; explicit timezone conversion
 // requires a verified Windows timezone mapping, not an assumed browser locale.
 const browserTz=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const windowsTz={'America/Toronto':'Eastern Standard Time','America/New_York':'Eastern Standard Time','America/Detroit':'Eastern Standard Time','America/Chicago':'Central Standard Time','America/Winnipeg':'Central Standard Time','America/Denver':'Mountain Standard Time','America/Edmonton':'Mountain Standard Time','America/Los_Angeles':'Pacific Standard Time','America/Vancouver':'Pacific Standard Time','UTC':'UTC','Etc/UTC':'UTC'};
 const tz=windowsTz[browserTz];
 if(!tz)throw Error('Outlook recurrence timezone is not yet mapped for '+(browserTz||'this browser')+'. Choose a supported timezone before scheduling.');
 return {pattern:{type:'weekly',interval,daysOfWeek:days,firstDayOfWeek:'monday'},range:{type:'endDate',startDate:c.date,endDate:c.repeatEnd,recurrenceTimeZone:tz}};
}
function outlookEventPayload(c){
 const recurrence=outlookNativeRecurrence(c);
 let times=outlookLocalTime(c.date,c.time,c.duration||30);
 if(recurrence){
  // A recurring series must retain the selected WALL-CLOCK time through DST.
  // Sending UTC start/end with a local recurrence zone can shift future instances.
  const start=new Date(`${c.date}T${c.time}:00`);
  const end=new Date(start.getTime()+Number(c.duration||30)*60000);
  const localStamp=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
  const zone=recurrence.range.recurrenceTimeZone;
  times={start:{dateTime:localStamp(start),timeZone:zone},end:{dateTime:localStamp(end),timeZone:zone}};
 }
 return {subject:(c.title||c.type||'Global Sprints meeting').slice(0,120),
  body:{contentType:'Text',content:[c.agenda||'',c.secondary?'Combined ceremony: '+c.secondary:'','Scheduled from PNPC Global Sprints'].filter(Boolean).join('\n\n')},
  ...times,attendees:outlookAttendees(c.participants),...(recurrence?{recurrence}:{})};
}
function outlookTarget(r,id,scheduleId,workspaceId,sprintId){
 return scheduleId?r.workspaces.find(x=>x.id===workspaceId)?.meetingSchedules?.find(x=>x.id===scheduleId)?.meetings?.find(x=>x.id===id):r.sprints.find(x=>x.id===sprintId)?.ceremonies?.find(x=>x.id===id);
}
async function outlookGraph(method,path,body){
 const token=await m365GraphToken();
 const response=await fetch('https://graph.microsoft.com/v1.0'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw serviceHttpError('Microsoft Graph',response.status);
 return response.status===204?null:response.json();
}
async function outlookReconcile(id,scheduleId=null){
 const c=outlookCeremonyRecord(id,scheduleId),o=c?.outlook;
 if(!o||!['pending','sync-pending','cancel-pending'].includes(o.state))return notify('This meeting has no pending Outlook operation.',true);
 if(!m365Account||!o.calendarId)return notify('Connect the Outlook account associated with this meeting.',true);
 if(o.accountId!==(m365Account.homeAccountId||m365Account.username))return notify('Reconnect the Microsoft 365 account used to book this meeting.',true);
 if(outlookBookingBusy)return notify('Another Outlook operation is in progress.',true);
 outlookBookingBusy=true;
 try{
  let event=null;
  if(o.eventId){try{event=await outlookGraph('GET','/me/calendars/'+encodeURIComponent(o.calendarId)+'/events/'+encodeURIComponent(o.eventId));}catch(e){if(!String(e).includes('404'))throw e;}}
  else if(o.operationId){
   // transactionId is a Graph idempotency key, but not a query filter.
   // Do not guess by subject/time: multiple events may share those fields.
   notify('The original booking result is uncertain. Check Outlook for the event; automatic matching without an event ID would risk linking the wrong meeting.',true);return;
  }
  if(o.state==='cancel-pending'&&!event){
   const ok=await persist(r=>{const t=outlookTarget(r,id,scheduleId,activeWorkspaceId,currentSprint()?.id);if(!t||t.outlook?.operationId!==o.operationId)throw Error('Meeting changed.');t.outlook={...o,state:'cancelled',cancelledAt:new Date().toISOString()};t.status='Cancelled';},false);
   if(ok)notify('Outlook cancellation reconciled.');return;
  }
  if(!event)return notify('The Outlook event could not be located. No changes were made.',true);
  if(o.state==='sync-pending'){
   if(!o.pendingChanges)return notify('Pending update details are unavailable. Verify the Outlook event manually before changing the ceremony.',true);
   const expected=outlookEventPayload(o.pendingChanges);
   const sameTime=(a,b)=>Number.isFinite(Date.parse(a))&&Number.isFinite(Date.parse(b))&&Math.abs(Date.parse(a)-Date.parse(b))<1000;
   const actualAttendees=(event.attendees||[]).map(x=>(x.emailAddress?.address||'').toLowerCase()).sort();
   const wantedAttendees=expected.attendees.map(x=>x.emailAddress.address.toLowerCase()).sort();
   const matches=event.subject===expected.subject&&sameTime((event.start?.dateTime||'').replace(/Z?$/,'Z'),expected.start.dateTime)&&sameTime((event.end?.dateTime||'').replace(/Z?$/,'Z'),expected.end.dateTime)&&JSON.stringify(actualAttendees)===JSON.stringify(wantedAttendees);
   if(!matches)return notify('Outlook does not yet match the requested update (title, time, or attendees). The operation remains pending. Review the Outlook event before proceeding.',true);
   const ok=await persist(r=>{const t=outlookTarget(r,id,scheduleId,activeWorkspaceId,currentSprint()?.id);if(!t||t.outlook?.operationId!==o.operationId)throw Error('Meeting changed.');Object.assign(t,o.pendingChanges,{updatedAt:new Date().toISOString(),outlook:{...o,state:'booked',pendingChanges:null,eventId:event.id,webLink:event.webLink||o.webLink||'',syncedAt:new Date().toISOString()}});},false);
   if(ok)notify('Outlook update verified and ceremony changes recovered.');return;
  }
  const ok=await persist(r=>{const t=outlookTarget(r,id,scheduleId,activeWorkspaceId,currentSprint()?.id);if(!t||t.outlook?.operationId!==o.operationId)throw Error('Meeting changed.');t.outlook={...o,state:'booked',eventId:event.id,webLink:event.webLink||o.webLink||'',syncedAt:new Date().toISOString()};t.status='Scheduled externally';},false);
  if(ok)notify('Outlook event confirmed and meeting link restored.');
 }catch(e){notify('Reconciliation failed: '+String(e.message||e),true);}finally{outlookBookingBusy=false;renderCeremonies();renderWorkspaceSchedules();}
}
async function outlookUpdateCeremony(id,scheduleId,c){
 const previous=outlookCeremonyRecord(id,scheduleId),o=previous?.outlook;
 if(!o||o.state!=='booked'||!o.eventId)return notify('This meeting is not ready for Outlook updates.',true);
 if(!m365Account||o.accountId!==(m365Account.homeAccountId||m365Account.username))return notify('Connect the Microsoft 365 account that owns this booking.',true);
 let payload;try{payload=outlookEventPayload(c);}catch(e){return notify(String(e.message||e),true);}
 if(outlookBookingBusy)return notify('An Outlook operation is in progress.',true);
 if(!confirm(o.recurring?'Update the ENTIRE recurring Outlook series? Outlook may send updated invitations for future occurrences.':'Update this existing Outlook event? Outlook may send updated invitations to attendees.'))return;
 outlookBookingBusy=true;
 const w=activeScheduleWorkspace(),sp=currentSprint(),operationId=crypto.randomUUID();
 try{
  const marked=await persist(r=>{const t=outlookTarget(r,id,scheduleId,w?.id,sp?.id);if(t?.outlook?.state!=='booked'||t.outlook.eventId!==o.eventId)throw Error('Meeting was modified.');t.outlook={...t.outlook,state:'sync-pending',operationId,pendingChanges:c};},false);
  if(!marked)return;
  await outlookGraph('PATCH','/me/calendars/'+encodeURIComponent(o.calendarId)+'/events/'+encodeURIComponent(o.eventId),payload);
  const saved=await persist(r=>{const t=outlookTarget(r,id,scheduleId,w?.id,sp?.id);if(t?.outlook?.operationId!==operationId)throw Error('Meeting changed during synchronization.');Object.assign(t,c,{updatedAt:new Date().toISOString(),outlook:{...o,state:'booked',syncedAt:new Date().toISOString()}});},false);
  if(saved){resetCeremony();notify('Existing Outlook event updated and meeting saved.');}
  else notify('Outlook accepted the update, but saving the ceremony failed. Reconcile before retrying.',true);
 }catch(e){notify('Outlook update is uncertain: '+String(e.message||e)+'. Use Review Outlook status before retrying.',true);}finally{outlookBookingBusy=false;renderCeremonies();renderWorkspaceSchedules();}
}
function meetingActionFeedback(id,scheduleId,message,error=false){
 const node=[...document.querySelectorAll('[data-ceremony-booking-id]')].find(el=>el.dataset.ceremonyBookingId===String(id)&&el.dataset.ceremonyScheduleId===String(scheduleId||''));
 if(node&&contextualMessage(node,message,error))return;
 notify(message,error);
}
async function outlookCancelCeremony(id,scheduleId=null){
 const c=outlookCeremonyRecord(id,scheduleId),o=c?.outlook;
 if(o?.state!=='booked'||!o.eventId)return notify('Only confirmed Outlook bookings can be cancelled.',true);
 if(!m365Account||o.accountId!==(m365Account.homeAccountId||m365Account.username))return notify('Connect the Microsoft 365 account that owns this booking.',true);
 if(outlookBookingBusy)return notify('An Outlook operation is in progress.',true);
 if(!confirm(o.recurring?'Cancel the ENTIRE recurring Outlook meeting series and notify attendees? This cancels all remaining occurrences. The workspace ceremony record will be retained as Cancelled.':'Cancel this Outlook meeting and notify attendees? This cannot be undone. The ceremony record will be retained as Cancelled.'))return;
 outlookBookingBusy=true;const w=activeScheduleWorkspace(),sp=currentSprint(),operationId=crypto.randomUUID();
 try{
  const marked=await persist(r=>{const t=outlookTarget(r,id,scheduleId,w?.id,sp?.id);if(t?.outlook?.state!=='booked')throw Error('Meeting changed.');t.outlook={...t.outlook,state:'cancel-pending',operationId};},false);
  if(!marked)return;
  // DELETE is appropriate for organizer-owned events; Graph notifies attendees.
  try{await outlookGraph('DELETE','/me/calendars/'+encodeURIComponent(o.calendarId)+'/events/'+encodeURIComponent(o.eventId));}
  catch(e){if(!String(e.message||e).includes('Microsoft Graph 404:'))throw e; /* Already absent: treat as cancelled. */}
  const saved=await persist(r=>{const t=outlookTarget(r,id,scheduleId,w?.id,sp?.id);if(t?.outlook?.operationId!==operationId)throw Error('Meeting changed.');t.outlook={...o,state:'cancelled',cancelledAt:new Date().toISOString()};t.status='Cancelled';},false);
  if(saved)notify('Outlook meeting cancelled. You may now remove its Global Sprints record.');else notify('Outlook cancellation succeeded, but registry confirmation failed. Use Review Outlook status.',true);
 }catch(e){notify('Cancellation result uncertain: '+String(e.message||e)+'. Review Outlook status before retrying.',true);}finally{outlookBookingBusy=false;renderCeremonies();renderWorkspaceSchedules();}
}
function nextFutureCeremonyDate(c){
 const now=new Date(),day=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
 const original=new Date(String(c.date||'')+'T12:00:00');
 if(!Number.isFinite(original.getTime()))return '';
 const weekday=original.getDay();
 for(let i=0;i<8;i++){
  const candidate=new Date(day.getFullYear(),day.getMonth(),day.getDate()+i);
  if(candidate.getDay()===weekday)return [candidate.getFullYear(),String(candidate.getMonth()+1).padStart(2,'0'),String(candidate.getDate()).padStart(2,'0')].join('-');
 }
 return '';
}
async function proposeMissedCeremonyDate(id,scheduleId){
 const c=outlookCeremonyRecord(id,scheduleId);if(!c||c.outlook?.state)return ceremonyBookingFeedback(id,scheduleId,'This meeting cannot be rescheduled until its Outlook status is resolved.');
 const next=nextFutureCeremonyDate(c);if(!next)return ceremonyBookingFeedback(id,scheduleId,'Unable to calculate the next suitable date. Open Edit to choose a future date.');
 if(!confirm(`Move "${c.title||c.type}" from ${c.date} to ${next} at ${c.time}? The original date will be retained in the meeting record. No Outlook invitation will be sent until you book it.`))return;
 const w=activeScheduleWorkspace(),sp=currentSprint();
 const ok=await persist(r=>{
  const target=outlookTarget(r,id,scheduleId,w?.id,sp?.id);
  if(!target||target.outlook?.state)throw Error('Meeting changed or has an Outlook operation. Reload before rescheduling.');
  target.originalPlannedDate ||=target.date;
  target.date=next;target.updatedAt=new Date().toISOString();target.manuallyEdited=true;
 },false);
 if(ok){renderWorkspaceSchedules();renderCeremonies();notify('Meeting moved to '+next+'. Review and select Schedule in Outlook when ready.');}
}
// The date decision belongs to the meeting being booked, not a page-wide notification.
function ceremonyPastDateChoices(id,scheduleId,c){
 const row=[...document.querySelectorAll('[data-ceremony-booking-id]')].find(el=>el.dataset.ceremonyBookingId===String(id)&&el.dataset.ceremonyScheduleId===String(scheduleId||''));
 if(!row)return ceremonyBookingFeedback(id,scheduleId,'This meeting has a past start date. Open its meeting record to review the booking date.');
 row.querySelector('.ceremony-past-choices')?.remove();
 const panel=document.createElement('div');panel.className='ceremony-past-choices';panel.style.cssText='width:100%;padding:12px;border:1px solid #d2dce7;border-radius:8px;background:#f0f6fc;';
 const title=document.createElement('strong');title.textContent='Review past-date Outlook booking';panel.append(title);
 const note=document.createElement('p');note.className='muted';
 note.textContent=c.repeat&&c.repeat!=='none'?'This recurring series starts in the past. Outlook can represent its original dates, but historical occurrences and attendee notifications have not been verified in your tenant. Choose whether to preserve the original series or invite only future occurrences.':'This one-time ceremony is dated in the past. Outlook can record historical meetings, but attendees may receive an invitation for an event that has already ended. Choose deliberately.';
 panel.append(note);
 const actions=document.createElement('div');actions.className='row';actions.style.flexWrap='wrap';
 const add=(label,mode)=>{const b=document.createElement('button');b.type='button';b.className=mode==='future'?'':'secondary';b.textContent=label;b.onclick=()=>{panel.remove();void scheduleCeremonyInOutlook(id,scheduleId,mode);};actions.append(b);};
 if(c.repeat&&c.repeat!=='none'){
  const next=nextFutureRecurringOccurrence(c);
  if(next)add('Begin with next occurrence ('+next+')','future');
  add('Preserve original series dates','original');
  if(!next){const msg=document.createElement('p');msg.className='muted';msg.textContent='No future occurrence remains. Edit the series end date to extend it before choosing future-only booking.';panel.append(msg);}
 }else{
  const next=nextFutureCeremonyDate(c);if(next)add('Move to '+next+' (review first)','move');
  add('Book historical date ('+c.date+')','original');
 }
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancel';cancel.onclick=()=>panel.remove();actions.append(cancel);panel.append(actions);row.append(panel);
}
function nextFutureRecurringOccurrence(c){
 if(!c.repeatEnd)return '';
 const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const selected=c.repeat==='weekly'?new Set(c.repeatDays||[]):new Set([OUTLOOK_DAYS[new Date(c.date+'T12:00:00').getDay()]]);
 const interval=c.repeat==='sprint'?Number(c.repeatInterval)||2:1;
 const origin=new Date(c.date+'T12:00:00');
 for(let i=0;i<370;i++){
  const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i),date=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
  if(date>c.repeatEnd)break;
  const weeks=Math.floor((new Date(date+'T12:00:00')-origin)/(7*86400000));
  if(weeks<0||weeks%interval!==0||!selected.has(OUTLOOK_DAYS[day.getDay()]))continue;
  if(date>today||(date===today&&c.time>`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`))return date;
 }
 return '';
}
function ceremonyBookingFeedback(id,scheduleId,message){
 // Keep the error beside the attempted booking control, not in a distant notification.
 const rows=[...document.querySelectorAll('[data-ceremony-booking-id]')];
 const row=rows.find(el=>el.dataset.ceremonyBookingId===String(id)&&el.dataset.ceremonyScheduleId===String(scheduleId||''));
 if(row){let status=row.querySelector('.ceremony-booking-feedback');if(!status){status=document.createElement('p');status.className='ceremony-booking-feedback';status.setAttribute('role','alert');status.style.cssText='color:#a52828;width:100%;margin:4px 0;';row.append(status);}status.textContent=message;

 }
 if(!row)notify(message,true);
}
async function scheduleCeremonyInOutlook(id,scheduleId=null,pastMode=null){
 if(outlookBookingBusy)return notify('Another Outlook booking is in progress.',true);
 const c=outlookCeremonyRecord(id,scheduleId);
 if(!c)return notify('Meeting record is no longer available. Reload before scheduling.',true);
 if(c.outlook?.state==='booked')return notify('This meeting is already linked to an Outlook event. Duplicate booking prevented.',true);
 if(c.outlook?.state==='pending')return notify('An earlier Outlook request has an unresolved result. Check the selected Outlook calendar before attempting any further booking.',true);
 if(c.status==='Cancelled'||c.status==='Completed')return notify('Cancelled or completed meetings cannot be newly booked.',true);
 const calendarId=m365ReadCalendarPreference();
 if(m365Account&&calendarId&&!m365CalendarsVerified)await m365RefreshCalendars({silent:true});
 if(!m365Account||!calendarId||!m365Calendars.some(x=>x.id===calendarId)||!m365CalendarsVerified){
  const reason=!m365Account?'Connect your own Microsoft 365 account in Configuration before scheduling.':
   !m365CalendarsVerified?'Your saved calendar is retained, but current access could not be verified. Reconnect Outlook or check calendars before booking.':
   !calendarId?'Select and save an Outlook calendar in Configuration for your Microsoft 365 account.':
   'Your saved Outlook calendar is no longer available to this account. Refresh calendars and save a new selection in Configuration.';
  diagnostic('m365.booking.preflight',{reason,connected:!!m365Account,calendarsLoaded:m365Calendars.length,calendarPreferencePresent:!!calendarId},'warn');
  return ceremonyBookingFeedback(id,scheduleId,reason);
 }
 let payload;
 const now=new Date();const localToday=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 let booking=c;
 const isPast=c.date<localToday||(c.date===localToday&&c.time<=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
 if(isPast){
  if(!pastMode){ceremonyPastDateChoices(id,scheduleId,c);return;}
  if(pastMode==='move')return proposeMissedCeremonyDate(id,scheduleId);
  if(pastMode==='future'){
   if(!c.repeat||c.repeat==='none')return ceremonyBookingFeedback(id,scheduleId,'Future-only booking requires a recurring series. Choose a new date for this one-time meeting.');
   const next=nextFutureRecurringOccurrence(c);
   if(!next)return ceremonyBookingFeedback(id,scheduleId,'No future occurrence remains. Edit the recurrence end date to extend the series.');
   booking={...c,date:next};
  }else if(pastMode!=='original')return ceremonyBookingFeedback(id,scheduleId,'Choose how to handle the past meeting date before booking.');
 }

 try{payload=outlookEventPayload(booking);}catch(e){return ceremonyBookingFeedback(id,scheduleId,String(e.message||e));}
 const calendar=m365Calendars.find(x=>x.id===calendarId);
 if(calendar.canEdit===false)return ceremonyBookingFeedback(id,scheduleId,'The selected Outlook calendar is read-only. Choose a writable calendar in Configuration.');
 const accountId=m365Account.homeAccountId||m365Account.username;
 if(!confirm(`Create "${payload.subject}"${payload.recurrence?' as ONE recurring Outlook series':''}${booking.date!==c.date?' beginning '+booking.date+' (past occurrences skipped)':isPast&&pastMode==='original'?' with its original past start date; historical calendar occurrences may be created':''} in Outlook calendar "${calendar.name}"${payload.attendees.length?' and send invitations to '+payload.attendees.length+' attendee(s)':''}?`))return;
 outlookBookingBusy=true;
 const operationId=crypto.randomUUID();
 const sp=currentSprint(),w=activeScheduleWorkspace();
 const mark=await persist(r=>{
  const target=scheduleId
   ? r.workspaces.find(x=>x.id===w?.id)?.meetingSchedules?.find(x=>x.id===scheduleId)?.meetings?.find(x=>x.id===id)
   : r.sprints.find(x=>x.id===sp?.id)?.ceremonies?.find(x=>x.id===id);
  if(!target||target.outlook?.state==='booked'||target.outlook?.state==='pending')throw Error('Meeting changed or is already being booked.');
  target.outlook={state:'pending',operationId,calendarId,accountId,startedAt:new Date().toISOString()};
 },false);
 if(!mark){outlookBookingBusy=false;return;}
 renderCeremonies();renderWorkspaceSchedules();
 try{
  const accessToken=await m365GraphToken();
  const response=await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`,{
   method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({...payload,transactionId:operationId})});
  if(!response.ok)throw serviceHttpError('Microsoft Graph',response.status);
  const event=await response.json();
  if(!event.id)throw Error('Microsoft Graph did not return an event identifier.');
  const saved=await persist(r=>{
   const target=scheduleId
    ? r.workspaces.find(x=>x.id===w?.id)?.meetingSchedules?.find(x=>x.id===scheduleId)?.meetings?.find(x=>x.id===id)
    : r.sprints.find(x=>x.id===sp?.id)?.ceremonies?.find(x=>x.id===id);
   if(!target||target.outlook?.operationId!==operationId)throw Error('Meeting changed during Outlook booking.');
   target.outlook={state:'booked',operationId,calendarId,accountId,eventId:event.id,seriesMasterId:event.seriesMasterId||event.id,recurring:!!payload.recurrence,webLink:event.webLink||'',syncedAt:new Date().toISOString()};
   target.status='Scheduled externally';
  },false);
  if(saved)notify('Outlook event created and linked to the ceremony. Invitations are handled by Microsoft Outlook.');
  else notify('Outlook event was created, but saving its link failed. Do not book again; reconcile the calendar event first.',true);
 }catch(e){
  // A network failure can occur after Graph has created the event.
  // Preserve the pending marker for manual reconciliation, never blindly retry.
  notify('Outlook booking result needs verification: '+String(e.message||e)+'. Check Outlook before retrying. The meeting is marked pending to prevent duplicates.',true);
 }finally{outlookBookingBusy=false;renderCeremonies();renderWorkspaceSchedules();}
}
function renderCeremonies(){renderMeetingReferenceCalendar();const list=$('ceremonyList');if(!list)return;list.replaceChildren();const sp=currentSprint(),w=activeScheduleWorkspace();const records=[...(w?.meetingSchedules||[]).flatMap(sc=>(sc.meetings||[]).map(c=>({...c,_scheduleId:sc.id}))),...(sp?.ceremonies||[])].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'').localeCompare(b.time||''));if(!records.length){list.textContent='No meeting records yet. Use Meeting Schedule Setup or create a meeting above.';return;}for(const c of records){const box=document.createElement('div');box.className='ceremony-record';box.dataset.ceremonyBookingId=String(c.id);box.dataset.ceremonyScheduleId=String(c._scheduleId||'');const h=document.createElement('strong');h.textContent=(c.title||c.type)+(c.secondary?' + '+c.secondary:'');const info=document.createElement('p');info.className='muted';info.textContent=[c.originalPlannedDate?'Originally planned '+c.originalPlannedDate:'',c.status||'Proposed',c.date,c.time,c.duration?c.duration+' min':'',c.repeat&&c.repeat!=='none'?'Repeats '+(c.repeat==='weekly'?(c.repeatDays||[]).join(', '):'every '+(c.repeatInterval||2)+' weeks')+' through '+(c.repeatEnd||'unspecified end'):'One-time',c.participants,c._scheduleId?'Workspace schedule':'Sprint record'].filter(Boolean).join(' · ');box.append(h,info);for(const [label,key] of [['Agenda','agenda'],['Decisions / follow-up','outcome']])if(c[key]){const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=label+': ';p.append(strong,document.createTextNode(c[key]));box.append(p);}if(c.secondary){const completion=document.createElement('div');completion.className='row';for(const [purpose,key] of [[c.type,'primary'],[c.secondary,'secondary']]){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=!!c.ceremonyCompletion?.[key];check.onchange=async()=>{const ok=await persist(r=>{const m=c._scheduleId?r.workspaces.find(x=>x.id===w.id)?.meetingSchedules?.find(x=>x.id===c._scheduleId)?.meetings?.find(x=>x.id===c.id):(r.sprints.find(x=>x.id===sp.id)?.ceremonies||[]).find(x=>x.id===c.id);if(!m)throw Error('Meeting missing.');m.ceremonyCompletion||={primary:false,secondary:false};m.ceremonyCompletion[key]=check.checked;},false);if(!ok)check.checked=!check.checked;else renderCeremonyInsights();};label.append(check,document.createTextNode(' '+purpose+' complete'));completion.append(label);}box.append(completion);}const actions=document.createElement('div');actions.className='row';const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.onclick=()=>editCeremony(c.id,c._scheduleId||null);const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.onclick=()=>void deleteCeremony(c.id,c._scheduleId||null);actions.append(edit);
 const outlook=document.createElement('button');outlook.type='button';outlook.className='secondary';
 outlook.textContent=c.outlook?.state==='booked'?'Booked in Outlook':c.outlook?.state==='pending'?'Booking needs review':c.outlook?.state==='cancelled'?'Cancelled in Outlook':c.outlook?.state?'Outlook sync needs review':'Schedule in Outlook';
 outlook.disabled=!!c.outlook?.state||c.status==='Cancelled'||c.status==='Completed';
 outlook.onclick=()=>void scheduleCeremonyInOutlook(c.id,c._scheduleId||null);
 actions.append(outlook);
 if(c.outlook?.state==='booked'){
  const cancel=document.createElement('button');cancel.type='button';cancel.className='danger';cancel.textContent='Cancel Outlook meeting';cancel.onclick=()=>void outlookCancelCeremony(c.id,c._scheduleId||null);actions.append(cancel);
 }else if(['pending','sync-pending','cancel-pending'].includes(c.outlook?.state)){
  const review=document.createElement('button');review.type='button';review.className='secondary';review.textContent='Review Outlook status';review.onclick=()=>void outlookReconcile(c.id,c._scheduleId||null);actions.append(review);
 }
 actions.append(remove);
 if(c.outlook?.state==='booked'&&c.outlook.webLink){const link=document.createElement('a');link.href=c.outlook.webLink;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open Outlook event';actions.append(link);}
 box.append(actions);list.append(box);}}
$('saveCeremony').onclick=()=>void saveCeremony();$('clearCeremony').onclick=resetCeremony;
// v0.5.0: Azure DevOps-backed reporting and editable auto-timeline.
let reportProjectFilter='',reportPersonFilter='',timelineBusy=false,lastReportRefresh=0;
const reportIsClosed=w=>workflowColumn(w)==='Closed';
const reportIsDone=w=>workflowColumn(w)==='Done';
const reportWork=()=>{const s=currentSprint();const all=new Map([...items,...assignedItems].map(w=>[Number(w.id),w]));return (s?.itemIds||[]).map(id=>all.get(Number(id))).filter(w=>w&&!isPlanningContextType(w)&&!isRemoved(w));};
// Every report and PM warning uses the same resolution of assigned sprint IDs.
function reportCoverage(){const s=currentSprint();const ids=[...new Set((s?.itemIds||[]).map(Number))];const resolved=new Map([...items,...assignedItems].map(w=>[Number(w.id),w]));const missing=ids.filter(id=>!resolved.has(id));const context=ids.filter(id=>resolved.has(id)&&isPlanningContextType(resolved.get(id)));const executable=ids.filter(id=>resolved.has(id)&&!isPlanningContextType(resolved.get(id))&&!isRemoved(resolved.get(id)));return {assigned:ids.length,missing,context,executable};}
let observationInFlight=false;
function observationItems(s,found){const byId=new Map(found.map(w=>[Number(w.id),w]));return [...new Set((s.itemIds||[]).map(Number))].map(id=>{const w=byId.get(id);return w&&{id:w.id,project:w.project,title:w.title,type:w.type,state:w.state,effort:w.effort,storyPoints:w.storyPoints};}).filter(Boolean);}
function observationFingerprint(rows){return JSON.stringify(rows.map(w=>[w.id,w.type,w.state,w.effort,w.storyPoints]));}
async function autoReportObservation(s,found){
 if(observationInFlight||!s||!found||found.length!==new Set((s.itemIds||[]).map(Number)).size||sprintDirty()||projectsDirty())return;
 const rows=observationItems(s,found),previous=(s.snapshots||[]).at(-1);
 if(previous&&observationFingerprint(previous.items||[])===observationFingerprint(rows))return;
 observationInFlight=true;
 try{
  const saved=await persist(r=>{const sp=r.sprints.find(x=>x.id===s.id);if(!sp)throw Error('Sprint no longer exists');sp.snapshots ||= [];
   const last=sp.snapshots.at(-1);if(last&&observationFingerprint(last.items||[])===observationFingerprint(rows))return;
   sp.snapshots.push({at:new Date().toISOString(),automatic:true,items:rows});if(sp.snapshots.length>150)sp.snapshots=sp.snapshots.slice(-150);
  },false);
  diagnostic(saved?'reports.observation.saved':'reports.observation.failed',{sprintId:s.id,workItemCount:rows.length,automatic:true},saved?'info':'warn');
  if(saved&&currentSprint()?.id===s.id){renderSprintHealth();renderTimeline();}
 }catch(e){diagnostic('reports.observation.failed',{reason:String(e.message||e)},'error');}finally{observationInFlight=false;}
}
function reportFiltered(){return reportWork().filter(w=>(!reportProjectFilter||w.project===reportProjectFilter)&&(!reportPersonFilter||w.assignee===reportPersonFilter));}
function reportNode(tag,className,textValue){const n=document.createElement(tag);if(className)n.className=className;if(textValue!==undefined)n.textContent=String(textValue);return n;}
function reportMetric(parent,label,value,description=''){const n=reportNode('div','gs-metric');n.append(reportNode('span','muted',label),reportNode('strong','',value));if(description)n.append(reportNode('small','muted',description));parent.append(n);}
function reportVisualBars(parent,rows,labels=['Closed','Done','Open']){const graph=reportNode('div','gs-visual-bars');const max=Math.max(1,...rows.map(r=>r.values.reduce((a,b)=>a+b,0)));const legend=reportNode('div','gs-chart-legend');labels.forEach((label,i)=>{const item=reportNode('span','gs-legend-item');const swatch=reportNode('i','gs-swatch gs-swatch-'+i);item.append(swatch,document.createTextNode(label));legend.append(item);});graph.append(legend);if(!rows.length){graph.append(reportNode('p','muted','No work items match these filters.'));parent.append(graph);return;}for(const row of rows){const line=reportNode('div','gs-visual-row');line.append(reportNode('span','gs-visual-name',row.name));const track=reportNode('div','gs-visual-track');track.setAttribute('role','img');track.setAttribute('aria-label',row.name+': '+row.values.map((n,i)=>n+' '+labels[i]).join(', '));row.values.forEach((n,i)=>{if(n<=0)return;const segment=reportNode('span','gs-visual-segment gs-fill-'+i);segment.style.width=(n/max*100)+'%';segment.title=n+' '+labels[i];track.append(segment);});line.append(track,reportNode('strong','gs-visual-count',String(row.values.reduce((a,b)=>a+b,0))));graph.append(line);}parent.append(graph);}
function reportEmptyChart(parent,heading,description){const empty=reportNode('div','gs-chart-empty');empty.append(reportNode('div','gs-chart-empty-icon','▥'),reportNode('strong','',heading),reportNode('p','muted',description));parent.append(empty);}
function reportVelocityChart(parent,rows){const graph=reportNode('div','gs-velocity-chart');const max=Math.max(1,...rows.map(r=>r.value));for(const row of rows){const item=reportNode('div','gs-velocity-column');const area=reportNode('div','gs-velocity-area');const bar=reportNode('div','gs-velocity-bar');bar.style.height=Math.max(row.value?6:0,row.value/max*100)+'%';bar.title=row.name+': '+row.value+' completed points';area.append(bar);item.append(reportNode('strong','',String(row.value)),area,reportNode('span','',row.name));graph.append(item);}parent.append(graph);}
function reportDate(v){return v?String(v).slice(0,10):'';}
// Snapshot timestamps may be ISO strings or legacy numeric epoch values.
// Normalize before sorting/charting so one legacy record cannot crash Reports.
function reportSnapshotTimestamp(value){
 if(typeof value==='string'){
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?new Date(parsed).toISOString():'';
 }
 if(typeof value==='number'&&Number.isFinite(value)){
  const parsed=new Date(value<1e11?value*1000:value);
  return Number.isFinite(parsed.getTime())?parsed.toISOString():'';
 }
 return '';
}
function reportToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function reportDay(v){return Date.parse(v+'T12:00:00Z')/86400000;}
function reportSafeDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(reportDay(v));}
function reportExport(){const s=currentSprint();if(!s)return notify('Select a sprint.',true);const data=reportFiltered();const header=['ID','Project','Title','State','Assigned to','Start','Target','Due','Priority','Effort'];const csv=[header,...data.map(w=>[w.id,w.project,w.title,w.state,w.assignee,w.startDate,w.targetDate,w.dueDate,w.priority??'',w.effort??''])].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='global-sprint-'+String(s.name||'report').replace(/[^a-z0-9-]/gi,'-')+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function reportSelectors(){const p=$('reportProject'),u=$('reportPerson');if(!p||!u)return;const work=reportWork();const projects=[...new Set(work.map(w=>w.project).filter(Boolean))].sort(),people=[...new Set(work.map(w=>w.assignee).filter(Boolean))].sort();p.replaceChildren(new Option('All projects',''),...projects.map(v=>new Option(v,v)));u.replaceChildren(new Option('All team members',''),...people.map(v=>new Option(v,v)));if(!projects.includes(reportProjectFilter))reportProjectFilter='';if(!people.includes(reportPersonFilter))reportPersonFilter='';p.value=reportProjectFilter;u.value=reportPersonFilter;}
function renderReportDashboard(){const host=$('reportDashboard');if(!host)return;host.replaceChildren();const sprint=currentSprint();if(!sprint){host.append(reportNode('p','muted','Select a global sprint to view its reports.'));return;}const all=reportWork(),work=reportFiltered(),closed=work.filter(reportIsClosed),done=work.filter(reportIsDone),active=work.filter(w=>!reportIsClosed(w)&&!reportIsDone(w));const today=reportToday(),overdue=active.filter(w=>reportSafeDate(w.dueDate||w.targetDate)&&reportDate(w.dueDate||w.targetDate)<today),blocked=work.filter(w=>sprint.blockedItems?.[w.id]);const coverage=reportCoverage(),missing=coverage.missing.length;
 const title=reportNode('h3','',sprint.name+' · Delivery overview');host.append(title);const cards=reportNode('div','gs-metrics');reportMetric(cards,'Accepted / Closed',closed.length,work.length+' executable items');reportMetric(cards,'Done / Awaiting validation',done.length);reportMetric(cards,'Active or New',active.length);reportMetric(cards,'Overdue',overdue.length);reportMetric(cards,'Blocked',blocked.length);reportMetric(cards,'Not loaded',missing);host.append(cards);host.append(reportNode('p','muted',`${coverage.assigned} assigned · ${coverage.executable.length} executable · ${coverage.context.length} planning context · ${missing} unavailable. Filters apply to the figures above.`));
 const health=reportNode('section','gs-report-block');health.append(reportNode('h3','','Sprint Health'));const total=work.length;const accepted=total?Math.round(closed.length/total*100):0;const tested=total?Math.round(done.length/total*100):0;const bar=reportNode('div','gs-progress');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuenow',String(accepted));bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-label','Accepted work');const a=reportNode('span','gs-progress-closed'),d=reportNode('span','gs-progress-done');a.style.width=accepted+'%';d.style.width=tested+'%';bar.append(a,d);const summary=reportNode('div','gs-health-score');summary.append(reportNode('strong','',accepted+'%'),reportNode('span','muted','Accepted / Closed'));health.append(summary,bar,reportNode('p','muted',`${accepted}% accepted · ${tested}% awaiting validation · ${Math.max(0,100-accepted-tested)}% remaining. Done is not accepted.`));const status=sprintHealthData();const healthState=missing?'Insufficient data':status.label;health.append(reportNode('p','gs-health-note',healthState+' · '+(missing?'Some assigned items could not be loaded. ':status.reason)));if(missing)health.append(reportNode('p','muted','Health and completion are incomplete because '+missing+' assigned items could not be loaded.'));host.append(health);
 const byProject=reportNode('section','gs-report-block');byProject.append(reportNode('h3','','Project delivery'));const projectTable=reportNode('table');projectTable.innerHTML='<thead><tr><th>Project</th><th>Work</th><th>Closed</th><th>Done</th><th>Open</th></tr></thead>';const body=reportNode('tbody');for(const project of [...new Set(work.map(w=>w.project))].sort()){const list=work.filter(w=>w.project===project),row=reportNode('tr');for(const value of [project,list.length,list.filter(reportIsClosed).length,list.filter(reportIsDone).length,list.filter(w=>!reportIsClosed(w)&&!reportIsDone(w)).length])row.append(reportNode('td','',value));body.append(row);}projectTable.append(body);reportVisualBars(byProject,[...new Set(work.map(w=>w.project))].sort().map(project=>{const list=work.filter(w=>w.project===project);return {name:project,values:[list.filter(reportIsClosed).length,list.filter(reportIsDone).length,list.filter(w=>!reportIsClosed(w)&&!reportIsDone(w)).length]};}));const projectDetail=reportNode('details','gs-chart-details');projectDetail.append(reportNode('summary','','View project data table'),projectTable);byProject.append(projectDetail);host.append(byProject);
 const workload=reportNode('section','gs-report-block');workload.append(reportNode('h3','','Team workload'));const table=reportNode('table');table.innerHTML='<thead><tr><th>Assigned to</th><th>Open</th><th>Awaiting validation</th><th>Closed</th></tr></thead>';const tbody=reportNode('tbody');for(const person of [...new Set(work.map(w=>w.assignee||'Unassigned'))].sort()){const list=work.filter(w=>(w.assignee||'Unassigned')===person),tr=reportNode('tr');for(const v of [person,list.filter(w=>!reportIsClosed(w)&&!reportIsDone(w)).length,list.filter(reportIsDone).length,list.filter(reportIsClosed).length])tr.append(reportNode('td','',v));tbody.append(tr);}table.append(tbody);reportVisualBars(workload,[...new Set(work.map(w=>w.assignee||'Unassigned'))].sort().map(person=>{const list=work.filter(w=>(w.assignee||'Unassigned')===person);return {name:person,values:[list.filter(reportIsClosed).length,list.filter(reportIsDone).length,list.filter(w=>!reportIsClosed(w)&&!reportIsDone(w)).length]};}));const teamDetail=reportNode('details','gs-chart-details');teamDetail.append(reportNode('summary','','View workload data table'),table);workload.append(teamDetail,reportNode('p','muted','Assignment counts are not capacity or time estimates.'));host.append(workload);
 const issues=reportNode('section','gs-report-block');issues.append(reportNode('h3','','Management attention'));const attention=[...new Map([...overdue,...blocked,...done].map(w=>[w.id,w])).values()];if(!attention.length)issues.append(reportNode('p','muted','No overdue, blocked or validation-pending work among loaded items.'));for(const w of attention.slice(0,30)){const line=reportNode('div','gs-attention');const link=document.createElement('a');link.href=w.url||`${organizationApiBase()}/${encodeURIComponent(w.project)}/_workitems/edit/${w.id}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent='#'+w.id+' · '+w.title;line.append(link,reportNode('span','muted',w.project+' · '+w.state+(overdue.includes(w)?' · Overdue':'')));issues.append(line);}host.append(issues);
 renderVelocityBurndown();}
function reportCompletedState(w){return /^(done|closed|accepted|tested and approved|completed|resolved)$/i.test(String(w?.state||'').trim());}
function reportEstimate(w){const raw=w?.effort??w?.storyPoints;return raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))&&Number(raw)>=0?Number(raw):0;}
function reportCommittedProgress(baseline,observed){const executable=baseline.filter(w=>!isPlanningContextType(w));const latest=new Map(observed.map(w=>[Number(w.id),w]));let total=0,completed=0,completedItems=0,remaining=0;for(const original of executable){const now=latest.get(Number(original.id));const estimate=reportEstimate(now||original);total+=estimate;if(now&&reportCompletedState(now)){completed+=estimate;completedItems++;}else remaining+=estimate;}return {total,completed,remaining,completedItems,totalItems:executable.length};}
function renderVelocityBurndown(){
 const velocity=$('reportVelocity'),burn=$('reportBurndown');if(!velocity||!burn)return;velocity.replaceChildren();burn.replaceChildren();const s=currentSprint();if(!s)return;
 const siblings=workspaceSprints().filter(x=>x.start).sort((a,b)=>a.start.localeCompare(b.start));const table=reportNode('table');table.innerHTML='<thead><tr><th>Sprint</th><th>Committed items</th><th>Completed items</th><th>Completed points</th><th>Remaining points</th></tr></thead>';const tb=reportNode('tbody');const velocityRows=[];
 for(const sp of siblings.slice(-8)){
  const snaps=(sp.snapshots||[]).filter(x=>reportSnapshotTimestamp(x.at)&&Array.isArray(x.items)).sort((a,b)=>reportSnapshotTimestamp(a.at).localeCompare(reportSnapshotTimestamp(b.at)));if(!snaps.length)continue;
  const progress=reportCommittedProgress(snaps[snaps.length-1].items,snaps[snaps.length-1].items);velocityRows.push({name:sp.name,value:progress.completed});const row=reportNode('tr');for(const v of [sp.name,progress.totalItems,progress.completedItems,progress.completed,progress.remaining])row.append(reportNode('td','',v));tb.append(row);
 }
 table.append(tb);if(velocityRows.length)reportVelocityChart(velocity,velocityRows);else reportEmptyChart(velocity,'Velocity history not yet available','No recorded sprint baseline is available yet. Live progress for the selected sprint is shown separately below.');
 const coverage=reportCoverage(),liveWork=reportWork();
 if(!coverage.missing.length&&coverage.assigned){const live=reportCommittedProgress(liveWork,liveWork);velocity.append(reportNode('p','gs-health-note',`Selected sprint live completion (${s.name}): ${live.completed} completed points, ${live.remaining} remaining points; ${live.completedItems} of ${live.totalItems} executable items completed. This is not historical velocity.`));}
 else if(coverage.missing.length)velocity.append(reportNode('p','muted',`${coverage.missing.length} committed items are not loaded; live completion cannot be verified.`));
 const detail=reportNode('details','gs-chart-details');detail.append(reportNode('summary','','View completed-effort data'),table);velocity.append(detail,reportNode('p','muted','Completed points use normalized Effort or Story Points. Done, Completed and Closed count as completed execution; each item counts once. Each historical bar reflects its last recorded observation, not necessarily its final sprint result.' ));
 const snaps=(s.snapshots||[]).filter(x=>reportSnapshotTimestamp(x.at)&&Array.isArray(x.items)).sort((a,b)=>reportSnapshotTimestamp(a.at).localeCompare(reportSnapshotTimestamp(b.at)));
 if(!snaps.length){
  const live=reportWork(),committed=(s.itemIds||[]).length;
  if(committed&&!reportCoverage().missing.length){const progress=reportCommittedProgress(live,live);burn.append(reportNode('p','gs-health-note',`Live sprint progress: ${progress.completed} completed points, ${progress.remaining} remaining points (${progress.completedItems}/${progress.totalItems} executable items).`));}
  reportEmptyChart(burn,'Burndown history not yet available','Live progress is shown above when all committed work items are loaded. A dated historical trend needs a baseline and subsequent observations.');return;
 }
 const base=snaps[0].items;const data=snaps.map(x=>({day:reportSnapshotTimestamp(x.at).slice(0,10),...reportCommittedProgress(x.items,x.items)}));const unique=[...new Map(data.map(x=>[x.day,x])).values()];const latest=data[data.length-1];
 const live=reportWork();if(live.length===new Set((s.itemIds||[]).map(Number)).size || (s.itemIds||[]).every(id=>[...items,...assignedItems].some(w=>Number(w.id)===Number(id)))){const current=reportCommittedProgress(live,live);burn.append(reportNode('p','gs-health-note',`Live sprint progress: ${current.completed} completed points, ${current.remaining} remaining points (${current.completedItems}/${current.totalItems} executable items). Historical charts update only from saved observations.`));}
 burn.append(reportNode('p','muted',`Last recorded observation: ${latest.completed} completed points, ${latest.remaining} remaining points (${latest.completedItems} of ${latest.totalItems} executable items completed).`));
 if(data.some(p=>p.total!==data[0].total||p.totalItems!==data[0].totalItems))burn.append(reportNode('p','gs-health-note','Sprint membership or estimates changed between recorded observations. The actual line reflects each dated observation; the ideal line is based on the earliest recorded baseline and is not a fixed-scope comparison.')); 
 if(unique.length<2){reportEmptyChart(burn,'Waiting for a second observation day','Current completed and remaining effort is shown above. A dated trend line requires observations from at least two days.');return;}
 const max=Math.max(1,...unique.map(x=>x.total));const start=s.start&&reportSafeDate(s.start)?s.start:unique[0].day,end=s.end&&reportSafeDate(s.end)?s.end:unique[unique.length-1].day,span=Math.max(1,reportDay(end)-reportDay(start));const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 700 220');svg.setAttribute('role','img');svg.setAttribute('aria-label','Remaining estimated effort compared with ideal burndown');svg.style.width='100%';svg.style.maxHeight='270px';const ns='http://www.w3.org/2000/svg';const add=(tag,attrs)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));svg.append(el);return el;};const x=d=>40+Math.max(0,Math.min(1,(reportDay(d)-reportDay(start))/span))*640,y=n=>190-(n/max)*160;add('line',{x1:40,y1:190,x2:680,y2:190,stroke:'currentColor','stroke-opacity':'.4'});add('line',{x1:40,y1:30,x2:40,y2:190,stroke:'currentColor','stroke-opacity':'.4'});add('line',{x1:x(start),y1:y(unique[0].total),x2:x(end),y2:y(0),stroke:'#8a9bab','stroke-dasharray':'7 5','stroke-width':2});add('polyline',{points:unique.map(p=>`${x(p.day)},${y(p.remaining)}`).join(' '),fill:'none',stroke:'#287fc1','stroke-width':3});for(const p of unique)add('circle',{cx:x(p.day),cy:y(p.remaining),r:4,fill:'#287fc1'});burn.append(svg,reportNode('p','muted',`Actual remaining estimated points across ${unique.length} recorded dates. No historical states have been inferred.`));
}

async function captureReportObservation(){const s=currentSprint();if(!s)return notify('Select a sprint.',true);const all=new Map([...items,...assignedItems].map(w=>[Number(w.id),w]));const missing=(s.itemIds||[]).filter(id=>!all.has(Number(id)));if(missing.length)return notify('Cannot capture incomplete observation: '+missing.length+' work items not loaded.',true);const snap={at:new Date().toISOString(),items:s.itemIds.map(id=>{const w=all.get(Number(id));return {id:w.id,project:w.project,title:w.title,type:w.type,state:w.state,effort:w.effort,storyPoints:w.storyPoints};})};const ok=await persist(r=>{const target=r.sprints.find(x=>x.id===s.id);target.snapshots||=[];target.snapshots.push(snap);if(target.snapshots.length>150)target.snapshots=target.snapshots.slice(-150);},false);if(ok){renderSprintHealth();notify('Dated work-item observation captured.');}}
async function updateTimelineTicket(w,changes){if(timelineBusy)return;const entries=Object.entries(changes).filter(([,v])=>v!==undefined);if(!entries.length)return;timelineBusy=true;const button=$('timelineSave');if(button)button.disabled=true;try{diagnostic('ado.timeline_update_attempt',{workItemId:w.id,fieldCount:entries.length,revision:w.rev,fields:entries.map(([path])=>path.split('.').at(-1)).join(',')});const patch=[{op:'test',path:'/rev',value:w.rev},...entries.map(([path,value])=>value?{op:'add',path:'/fields/'+path,value}: {op:'remove',path:'/fields/'+path})];const result=await api(`/_apis/wit/workitems/${w.id}?api-version=7.1`,{method:'PATCH',headers:{'Content-Type':'application/json-patch+json'},body:JSON.stringify(patch)});diagnostic('ado.timeline_update_success',{workItemId:w.id,fieldCount:entries.length,revisionBefore:w.rev,revisionAfter:result.rev,fields:entries.map(([path])=>path.split('.').at(-1)).join(',')});const fresh=normalizeItem(result);for(const item of [...items,...assignedItems,...ancestorItems])if(item.id===w.id)Object.assign(item,fresh);renderBoard();renderSprintHealth();renderTimeline();void autoReportObservation(currentSprint(),reportWork());notify('Saved ticket #'+w.id+' directly to Azure DevOps.');}catch(e){diagnostic('ado.timeline_update_failure',{workItemId:w.id,reason:String(e.message||e)},'error');notify('Ticket update rejected. No local changes saved: '+e.message,true);await reportRefresh();}finally{timelineBusy=false;if(button)button.disabled=false;}}
let timelineSelectedId=null;
function reportTimelineAxis(min,max){
 const axis=reportNode('div','gs-timeline-row gs-timeline-axis-row');axis.append(reportNode('strong','gs-timeline-axis-title','Calendar dates'));
 const scale=reportNode('div','gs-timeline-axis');const span=Math.max(1,max-min),step=Math.max(1,Math.ceil(span/7));
 for(let day=min;day<=max;day+=step){const tick=reportNode('span','gs-timeline-tick',new Date(day*86400000).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'}));tick.style.left=(day-min)/span*100+'%';scale.append(tick);}
 const today=reportDay(reportToday());if(today>=min&&today<=max){const marker=reportNode('span','gs-timeline-axis-today','Today');marker.style.left=(today-min)/span*100+'%';scale.append(marker);}
 axis.append(scale);return axis;
}
function reportBlockerList(host,work,onSelect){const blocked=work.filter(w=>w.blocked&&!['Done','Closed'].includes(w.state));if(!blocked.length)return;
 const details=reportNode('details','gs-blocker-list');details.append(reportNode('summary','',`${blocked.length} blocked ticket(s) · View affected work`));
 for(const w of blocked){const btn=reportNode('button','secondary gs-blocker-link',`${w.id||'#'+w.id} · ${w.title} (${w.project})`);btn.onclick=()=>onSelect(w);details.append(btn);}host.append(details);
}
function renderTimeline(){const host=$('timelineCanvas'),editor=$('timelineEditor');if(!host||!editor)return;host.replaceChildren();editor.replaceChildren();const work=reportFiltered(),s=currentSprint();if(!s){host.append(reportNode('p','muted','Select a sprint.'));return;}const today=reportToday(),dated=work.filter(w=>reportSafeDate(w.startDate||w.targetDate||w.dueDate)&&reportSafeDate(w.dueDate||w.targetDate||w.startDate)),unscheduled=work.filter(w=>!dated.includes(w));const starts=dated.map(w=>reportDay(w.startDate||w.targetDate||w.dueDate)),ends=dated.map(w=>reportDay(w.dueDate||w.targetDate||w.startDate));const min=Math.min(reportSafeDate(s.start)?reportDay(s.start):Infinity,...starts,reportDay(today)),max=Math.max(reportSafeDate(s.end)?reportDay(s.end): -Infinity,...ends,reportDay(today)+1),span=Math.max(1,max-min);const todayLine=((reportDay(today)-min)/span*100).toFixed(2)+'%';const groups=[...new Set(work.map(w=>w.project))].sort();for(const group of groups){const details=reportNode('details','gs-timeline-group');details.open=true;const summary=reportNode('summary','',group+' · '+work.filter(w=>w.project===group).length+' tickets');details.append(summary,reportTimelineAxis(min,max));for(const w of work.filter(x=>x.project===group).sort((a,b)=>(a.parentId||0)-(b.parentId||0)||a.id-b.id)){const row=reportNode('div','gs-timeline-row');const link=reportNode('button','secondary gs-timeline-label','#'+w.id+' '+w.title);link.title=w.title;link.onclick=()=>{timelineSelectedId=w.id;renderTimeline();};row.append(link);const track=reportNode('div','gs-timeline-track');const marker=reportNode('div','gs-today-marker');marker.style.left=todayLine;track.append(marker);if(dated.includes(w)){const begin=reportDay(w.startDate||w.targetDate||w.dueDate),finish=Math.max(begin,reportDay(w.dueDate||w.targetDate||w.startDate));const bar=reportNode('button','gs-timeline-bar'+(reportIsClosed(w)?' gs-timeline-closed':'')+(reportIsDone(w)?' gs-timeline-done':''),'');bar.style.left=((begin-min)/span*100)+'%';bar.style.width=Math.max(1.2,(finish-begin+1)/span*100)+'%';bar.title=`#${w.id}: ${w.startDate||'No start'} to ${w.dueDate||w.targetDate||'No end'} · ${w.state}`;bar.onclick=()=>{timelineSelectedId=w.id;renderTimeline();};track.append(bar);}else{const none=reportNode('span','muted','No scheduling dates');track.append(none);}row.append(track);details.append(row);}host.append(details);}if(unscheduled.length)host.append(reportNode('p','muted',unscheduled.length+' work items have no usable dates. Select a ticket to schedule it.'));const w=work.find(x=>x.id===timelineSelectedId);if(!w){editor.append(reportNode('p','muted','Select a ticket bar or title to edit the original Azure DevOps work item.'));return;}editor.append(reportNode('h3','',`#${w.id} · ${w.title}`));const fields=reportNode('div','gs-timeline-fields');const definitions=[['Start Date','Microsoft.VSTS.Scheduling.StartDate',w.startDate],['Target Date','Microsoft.VSTS.Scheduling.TargetDate',w.targetDate],['Due Date','Microsoft.VSTS.Scheduling.DueDate',w.dueDate]];const inputs=[];for(const [label,path,value] of definitions){const wrapper=reportNode('label','',label),input=document.createElement('input');input.type='date';input.value=value||'';wrapper.append(input);fields.append(wrapper);inputs.push({input,path,original:value||''});}editor.append(fields);const buttons=reportNode('div','row');const save=reportNode('button','','Save dates to Azure DevOps');save.id='timelineSave';save.onclick=async()=>{const values=inputs.map(x=>({...x,value:x.input.value}));const start=values[0].value,end=values[2].value||values[1].value;if(start&&end&&start>end)return notify('Start Date must not follow the final target/due date.',true);const changes=Object.fromEntries(values.filter(x=>x.value!==x.original).map(x=>[x.path,x.value?x.value+'T12:00:00Z':'']));if(!Object.keys(changes).length)return notify('No date changes to save.');await updateTimelineTicket(w,changes);};const open=document.createElement('a');open.href=w.url||`${organizationApiBase()}/${encodeURIComponent(w.project)}/_workitems/edit/${w.id}`;open.target='_blank';open.rel='noopener noreferrer';open.textContent='Open original ticket';buttons.append(save,open);editor.append(buttons,reportNode('p','muted','Date field availability depends on the home project process. Azure DevOps permissions and revision checks apply.'));}

async function refreshTrackedWorkItemsQuietly(){
 if(!registry||busy||timelineBusy||sprintDirty()||projectsDirty()||document.hidden)return;
 const selected=currentSprint();if(!selected?.itemIds?.length)return;
 const focused=document.activeElement;if(focused&&$('timelineEditor')?.contains(focused)&&['INPUT','SELECT','TEXTAREA'].includes(focused.tagName))return;
 const ids=[...new Set(selected.itemIds.map(Number))],fresh=[];
 try{
  for(let i=0;i<ids.length;i+=200){const response=await api('/_apis/wit/workitemsbatch?api-version=7.1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids.slice(i,i+200),errorPolicy:'Omit'})});fresh.push(...(response.value||[]).map(normalizeItem));}
  if(currentSprint()?.id!==selected.id||busy||timelineBusy)return;
  const existing=new Map(assignedItems.map(w=>[w.id,w]));let changed=false;
  for(const item of fresh){const prior=existing.get(item.id);if(prior?.rev!==item.rev){changed=true;existing.set(item.id,{...prior,...item});}}
  if(changed){assignedItems=[...existing.values()];renderBoard();renderSprintHealth();renderTimeline();notify('Azure DevOps work-item changes synchronized.');}
  diagnostic('ado.refresh.completed',{sprintId:selected.id,requested:ids.length,received:fresh.length,changed,missing:ids.length-fresh.length});
 }catch(e){diagnostic('ado.refresh.failed',{reason:String(e.message||e)},'warn');console.warn('Background work-item refresh failed',e);}
}
window.setInterval(()=>void refreshTrackedWorkItemsQuietly(),120000);

$('reportProject')?.addEventListener('change',e=>{reportProjectFilter=e.target.value;renderSprintHealth();renderTimeline();});
$('reportPerson')?.addEventListener('change',e=>{reportPersonFilter=e.target.value;renderSprintHealth();renderTimeline();});
async function reportRefresh(){
 if(sprintDirty()||projectsDirty())return notify('Save or discard unsaved planning changes before refreshing reports.',true);
 const sprintId=currentSprint()?.id;
 try{
  await refreshSharedRegistryForExecution();
  if(sprintId&&!registry.sprints.some(x=>x.id===sprintId))throw Error('Selected sprint is no longer available.');
  await loadAssignedItems();
  renderSprintHealth();renderTimeline();
  diagnostic('reports.refresh.completed',{sprintId,loaded:assignedItems.length});
  notify('Reports refreshed from shared sprint membership and Azure DevOps work items.');
 }catch(e){diagnostic('reports.refresh.failed',{reason:String(e.message||e)},'warn');notify('Report refresh failed: '+String(e.message||e),true);}
}
$('reportRefresh')?.addEventListener('click',()=>void reportRefresh());
$('reportObserve')?.addEventListener('click',()=>void captureReportObservation());
$('reportExport')?.addEventListener('click',reportExport);

function sprintHealthData(){const s=currentSprint();if(!s)return {label:'No sprint selected',reason:'Select a sprint to assess its health.',metrics:[]};const ids=(s.itemIds||[]).map(Number),byId=new Map([...items,...assignedItems].map(w=>[Number(w.id),w]));const missing=ids.filter(id=>!byId.has(id)).length;const work=ids.map(id=>byId.get(id)).filter(Boolean).filter(w=>!isPlanningContextType(w));const completed=work.filter(w=>/^(done|closed|resolved|accepted|completed)$/i.test(w.state||'')).length;const blocked=work.filter(w=>!!s.blockedItems?.[w.id]).length;const today=new Date().toISOString().slice(0,10);const overdue=work.filter(w=>{const date=w.dueDate||w.targetDate||w.due||'';return date&&String(date).slice(0,10)<today&&!/^(done|closed|resolved|accepted|completed)$/i.test(w.state||'');}).length;const remaining=work.length-completed;const end=s.end||'';let label='On track',reason='No blockers or overdue items are visible in the loaded work.';if(!work.length||missing||!s.start||!s.end||(!work.some(w=>w.startDate||w.targetDate||w.dueDate)&&!s.snapshots?.length)){label='Insufficient data';reason=missing?`${missing} assigned work items have not loaded; the assessment is incomplete.`:!work.length?'No executable assigned work is loaded yet.':!s.start||!s.end?'Sprint start/end dates are required for a reliable assessment.':'No work-item dates or recorded progress observations are available to establish schedule health.';}else if(blocked||overdue||(end&&end<today&&remaining)){label='At risk';reason=[blocked?`${blocked} blocked`:null,overdue?`${overdue} overdue`:null,end&&end<today&&remaining?`${remaining} incomplete after sprint end`:null].filter(Boolean).join(' · ');}else if(end&&remaining&&((planDate(end)-planDate(today))/86400000)<=2){label='Needs attention';reason=`${remaining} unfinished items with two days or fewer remaining.`;}return {label,reason,metrics:[['Loaded work',work.length],['Completed',completed],['Blocked',blocked],['Overdue (known dates)',overdue],['Not loaded',missing]]};}
function renderSprintHealth(){const data=sprintHealthData();const node=$('sprintHealthReport');if(node){node.replaceChildren();const heading=document.createElement('p');heading.className='health-indicator';heading.textContent=data.label+' — '+data.reason;node.append(heading);const row=document.createElement('div');row.className='health-metrics';for(const [label,n] of data.metrics){const el=document.createElement('div');el.className='health-metric';const strong=document.createElement('strong');strong.textContent=String(n);const span=document.createElement('span');span.textContent=label;el.append(strong,span);row.append(el);}node.append(row);}const compact=$('planningHealthIndicator');if(compact)compact.textContent=data.label+' · '+data.reason;renderReportCatalogue();renderCeremonyInsights();reportSelectors();renderReportDashboard();}
function openReport(id){activateTab('reports');const detail=$('reportDetail');if(!detail)return;const data=sprintHealthData();const w=activeScheduleWorkspace();const meetings=(w?.meetingSchedules||[]).flatMap(sc=>sc.meetings||[]);const s=currentSprint();const text={health:data.label+' — '+data.reason,progress:`${data.metrics.find(m=>m[0]==='Completed')?.[1]||0} completed work items among ${data.metrics.find(m=>m[0]==='Loaded work')?.[1]||0} loaded executable items.`,blockers:`${data.metrics.find(m=>m[0]==='Blocked')?.[1]||0} blocked items; ${data.metrics.find(m=>m[0]==='Overdue (known dates)')?.[1]||0} overdue items with known dates.`,ceremonies:`${meetings.length} workspace schedule records; ${meetings.filter(m=>m.status==='Completed').length} marked completed. Sprint-specific ceremony records: ${(s?.ceremonies||[]).length}.`,people:'Select By person in Ceremony Insights for participant commitments and meeting records. Individual workload depends on loaded Azure DevOps assignments.',workspace:`Workspace: ${w?.name||'none'} · ${(w?.meetingSchedules||[]).length} saved meeting schedules · ${(registry?.sprints||[]).filter(x=>x.workspaceId===activeWorkspaceId).length} sprints.`};detail.textContent=text[id]||'Select a report.';detail.scrollIntoView({block:'nearest'});}
function renderReportCatalogue(){const node=$('reportCatalogue');if(!node)return;node.replaceChildren();for(const [id,title] of [['health','Sprint Health'],['progress','Work Progress'],['blockers','Blockers & Overdue'],['ceremonies','Ceremony Insights'],['people','Individual Workload'],['workspace','Workspace Overview']]){const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=()=>openReport(id);node.append(b);}}
function renderCeremonyInsights(){const node=$('ceremonyInsightsContent');if(!node)return;node.replaceChildren();const w=activeScheduleWorkspace(),s=currentSprint(),meetings=[...(w?.meetingSchedules||[]).flatMap(sc=>sc.meetings||[]),...(s?.ceremonies||[])];const mode=$('insightMode')?.value||'overview';$('insightDateWrap')?.classList.toggle('hidden',mode!=='date');$('insightPersonWrap')?.classList.toggle('hidden',mode!=='person');const personSelect=$('insightPerson');if(personSelect){const previous=personSelect.value;const names=[...new Set(meetings.flatMap(m=>(m.participants||'').split(/[,;]+/).map(v=>v.trim()).filter(Boolean)))].sort();personSelect.replaceChildren(new Option('Choose participant',''),...names.map(n=>new Option(n,n)));personSelect.value=names.includes(previous)?previous:'';}const metric=(label,value)=>{const div=document.createElement('div');div.className='insight-metric';const strong=document.createElement('strong');strong.textContent=String(value);const caption=document.createElement('span');caption.textContent=label;div.append(strong,caption);return div;};const cards=document.createElement('div');cards.className='insight-metrics';cards.append(metric('Meeting records',meetings.length),metric('Marked completed',meetings.filter(m=>m.status==='Completed').length),metric('Outcomes recorded',meetings.filter(m=>!!m.outcome?.trim()).length),metric('Sprint health',sprintHealthData().label));node.append(cards);const filtered=meetings.filter(m=>mode==='date'?m.date===$('insightDate').value:mode==='person'?(personSelect.value&&m.participants?.split(/[,;]+/).some(v=>v.trim()===personSelect.value)):true).sort((a,b)=>(a.date||'').localeCompare(b.date||''));const description=document.createElement('p');description.className='muted';description.textContent=mode==='person'&&!personSelect.value?'Choose a participant to see their meeting commitments.':`${filtered.length} matching meeting records. Only recorded completion and outcomes count.`;node.append(description);for(const m of filtered.slice(0,35)){const row=document.createElement('p');row.textContent=`${m.date||'Undated'} · ${m.type||'Meeting'} · ${m.status||'Proposed'}${m.outcome?' · Outcome recorded':''}`;node.append(row);}if(filtered.length>35){const p=document.createElement('p');p.className='muted';p.textContent=`Showing first 35 of ${filtered.length} records.`;node.append(p);}}
$('planningHealthDetails')?.addEventListener('click',()=>openReport('health'));$('insightsFullReport')?.addEventListener('click',()=>openReport('ceremonies'));for(const id of ['insightMode','insightDate','insightPerson'])$(id)?.addEventListener('change',renderCeremonyInsights);


// v0.3.22: editable, confirmation-only ceremony schedule proposals.
let proposedCeremonies=[];let proposedSprintId='';
const planDate=(date)=>{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));};
const planISO=d=>d.toISOString().slice(0,10);
function planAgenda(type){return ({'Sprint Planning':'Review goals, capacity, candidate work, dependencies and commitments.','Standup':'Progress since last check-in; next steps; blockers requiring action.','Sprint Review':'Review delivered work, outcomes, feedback and remaining commitments.','Retrospective':'What worked, what did not, and improvement actions.','Backlog Refinement':'Review carryovers, clarify candidates, acceptance criteria and priorities.'})[type]||'';}
function clearCeremonyProposal(){proposedCeremonies=[];proposedSprintId='';proposalWorkspaceId='';proposalRange=null;const el=$('ceremonyPreview');if(el)el.replaceChildren();if($('proposalCalendar'))$('proposalCalendar').replaceChildren();if($('confirmCeremonies'))$('confirmCeremonies').disabled=true;if($('ceremonyPreviewStatus'))$('ceremonyPreviewStatus').textContent='';}
let wizardStep=1;let proposalWorkspaceId='';let proposalRange=null;
function renderOutlookPlanningReadiness(){
 const wizard=$('ceremonyAssistant');if(!wizard)return;
 let status=$('outlookPlanningReadiness');
 if(!status){status=document.createElement('div');status.id='outlookPlanningReadiness';status.className='muted';status.style.cssText='padding:8px 12px;margin:8px 0;border-radius:6px;background:#eef4fa;';wizard.insertBefore(status,$('wizardStepHelp'));}
 status.replaceChildren();const label=document.createElement('strong');const saved=m365ReadCalendarPreference();const calendar=m365Calendars.find(x=>x.id===saved);
 label.textContent=!m365Account?'Outlook: Disconnected':!saved?'Outlook: Connected, calendar not selected':calendar?(m365CalendarsVerified?'Outlook: Connected · '+calendar.name:'Outlook: Connected · '+calendar.name+' (checking access)'):'Outlook: Connected · saved calendar awaiting verification';status.append(label);
 const detail=document.createElement('span');detail.textContent=!m365Account?' · You can save a plan without Outlook. Reconnect before booking.':!saved?' · Select a calendar before booking.':!calendar?' · Saved calendar selection retained; checking calendar access.':!m365CalendarsVerified?' · Saved calendar restored; verifying current access.':' · Ready for Outlook booking.';status.append(detail);
 if(!m365Account){const button=document.createElement('button');button.type='button';button.className='secondary';button.style.marginLeft='8px';button.textContent='Reconnect Outlook';button.onclick=()=>void m365Connect();status.append(button);}
 else if(!calendar){const button=document.createElement('button');button.type='button';button.className='secondary';button.style.marginLeft='8px';button.textContent='Check calendars';button.onclick=()=>void m365RefreshCalendars();status.append(button);}
}
function showWizardStep(n){renderOutlookPlanningReadiness();if(n===1&&wizardStep===1)restoreSavedMeetingPreferences();wizardStep=Math.max(1,Math.min(4,n));for(let i=1;i<=4;i++)$('wizardStep'+i).classList.toggle('hidden',i!==wizardStep);$('wizardStepLabel').textContent='Step '+wizardStep+' of 4';const hint=$('wizardStepHelp');if(hint)hint.textContent=['','Choose the sprint or project period. Past dates remain part of the plan, but must not be invited retroactively.','Choose ceremonies to include. Previously saved ceremonies remain in the schedule below and are never silently replaced.','Select weekdays and Outlook recurrence separately. Add recipients once, then check the resolved booking summary before continuing.','Review the proposed dates and recurrence. Save a draft first, then open its meetings to book Outlook invitations explicitly.'][wizardStep];$('wizardBack').disabled=wizardStep===1;$('wizardNext').classList.toggle('hidden',wizardStep===4);$('wizardNext').textContent=wizardStep===1?'Start':'Continue';$('wizardNext').classList.toggle('gs-start-action',wizardStep===1);if(wizardStep===3){renderPlanResolvedSummary();$('planContactEnable').textContent=peopleLookupEnabled?'Disable Outlook recipient suggestions':'Enable Outlook recipient suggestions';$('planContactEnable').setAttribute('aria-pressed',String(peopleLookupEnabled));}if(wizardStep===4)previewCeremonyPlan();}
function activeScheduleWorkspace(){return registry?.workspaces?.find(w=>w.id===activeWorkspaceId);}
function scheduleRange(){
 const scope=$('planScope').value;
 if(scope==='sprint'){
  const s=currentSprint();
  return {start:s?.start||'',end:s?.end||''};
 }
 return {start:$('planStart').value,end:$('planEnd').value};
}
function syncPlanScope(){
 const s=currentSprint(),sprintMode=$('planScope').value==='sprint';
 if(sprintMode){$('planStart').value=s?.start||'';$('planEnd').value=s?.end||'';}
 $('planStart').disabled=sprintMode;$('planEnd').disabled=sprintMode;
 const hint=$('planScopeHint');
 if(hint)hint.textContent=sprintMode?(s?`Using ${s.name}: ${s.start||'start date missing'} to ${s.end||'end date missing'}.`:'No sprint selected. Select an active sprint above, or use Defined project period.'):'Enter the project-period dates below.';
 clearCeremonyProposal();
}
function restoreSavedMeetingPreferences(){
 const w=activeScheduleWorkspace();const schedules=(w?.meetingSchedules||[]).filter(x=>x.preferences).sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||''));
 const sc=schedules[0];if(!sc)return;const p=sc.preferences;
 if(p.cadence)$('planCadence').value=p.cadence;
 if(p.standupRepeat)$('planStandupRepeat').value=p.standupRepeat;
 if(p.otherRepeat)$('planOtherRepeat').value=p.otherRepeat;
 if(p.standupDuration)$('planDuration').value=p.standupDuration;
 if(p.time)populateMeetingTimePicker($('planTime'),p.time);
 if(p.participants!==undefined)$('planParticipants').value=p.participants;
 if(Array.isArray(p.weekdays))$('planDays').querySelectorAll('input[type=checkbox]').forEach(el=>el.checked=p.weekdays.includes(Number(el.value)));
 if(Array.isArray(p.types))for(const [id,type] of [['planPlanning','Planning'],['planStandup','Standup'],['planReview','Review'],['planRetro','Retro'],['planGroom','Groom']])$(id).checked=p.types.includes(type);
 if(p.combine!==undefined)$('planCombine').checked=!!p.combine;
 const note=$('wizardSavedPreferences');if(note)note.textContent='Restored choices from '+sc.name+'. Existing meetings are listed below; they will not be duplicated.';
}
function resolvePlanStandupDays(range,existing=[],proposed=[]){
 const checked=[...$('planDays').querySelectorAll('input:checked')].map(x=>Number(x.value)).filter(d=>d>=1&&d<=5);
 const mode=$('planCadence').value;
 if(mode!=='unoccupied')return checked.sort((a,b)=>a-b);
 // Only actual occupied dates within the selected period matter. A review on one Friday
 // must not eliminate every Friday in a multi-week standup series.
 const occupied=new Set(existing.concat(proposed).filter(c=>c.type!=='Standup'&&c.status!=='Cancelled'&&c.date>=range.start&&c.date<=range.end).map(c=>c.date));
 const start=planDate(range.start),end=planDate(range.end),counts=new Map();
 for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){
  const day=d.getUTCDay(),date=planISO(d);
  if(checked.includes(day)&&!occupied.has(date))counts.set(day,(counts.get(day)||0)+1);
 }
 return checked.filter(day=>counts.has(day)).sort((a,b)=>a-b);
}
function renderPlanResolvedSummary(){
 const node=$('planResolvedSummary');if(!node)return;
 const range=scheduleRange();if(!range.start||!range.end||range.end<range.start){node.textContent='Choose a valid period in Step 1.';return;}
 const w=activeScheduleWorkspace(),existing=scheduleMeetingRecords(w);
 const days=resolvePlanStandupDays(range,existing),names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const enabled=$('planStandup').checked;
 const dates=[];for(let d=planDate(range.start);d<=planDate(range.end);d.setUTCDate(d.getUTCDate()+1))if(days.includes(d.getUTCDay()))dates.push(planISO(d));
 const count=dates.length,repeat=$('planStandupRepeat').value;
 node.textContent=enabled?(count?`Standups: ${days.map(d=>names[d]).join(', ')} · ${$('planTime').value} · ${$('planDuration').value} minutes · ${repeat==='weekly'?'one recurring Outlook series':count+' individual Outlook meetings'} · ${count} eligible occurrence(s) in this period. The preview excludes dates occupied by saved ceremonies when using Unoccupied weekdays.`:'No eligible standup weekdays. Select weekdays or change cadence before continuing.'):'Standups are not selected in Step 2. Other ceremonies follow their selected recurrence setting.';
}
let planLookupTimer=null,planLookupSequence=0;
async function planRecipientSearch(){
 const status=$('planContactStatus'),results=$('planContactResults'),term=($('planParticipants').value.split(/[,;\n]/).pop()||'').trim(),seq=++planLookupSequence;
 results.replaceChildren();if(term.length<2){status.textContent='Type at least two characters to search; manual email entry is available.';return;}
 if(!peopleLookupEnabled||!m365Account||!m365Client){status.textContent='Enable Outlook recipient suggestions or enter email addresses manually.';return;}
 try{
  const token=(await m365Client.acquireTokenSilent({account:m365Account,scopes:['People.Read']})).accessToken;
  const params=new URLSearchParams({'$search':'"'+term.replace(/"/g,'')+'"','$top':'12'});
  const response=await fetch('https://graph.microsoft.com/v1.0/me/people?'+params,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  if(!response.ok)throw Error('Directory lookup unavailable ('+response.status+').');
  const data=await response.json();if(seq!==planLookupSequence)return;
  const seen=new Set();for(const person of data.value||[]){
   const email=[person.scoredEmailAddresses?.[0]?.address,person.emailAddresses?.[0]?.address,person.emailAddress,person.userPrincipalName].find(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x||'')));
   if(!email||seen.has(email.toLowerCase()))continue;seen.add(email.toLowerCase());
   const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=(person.displayName||email)+' · '+email;
   b.onclick=()=>{const parts=$('planParticipants').value.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);if(parts.length&&parts.at(-1).toLowerCase()===term.toLowerCase())parts.pop();if(!parts.some(x=>x.toLowerCase()===email.toLowerCase()))parts.push(email);$('planParticipants').value=parts.join(', ');results.replaceChildren();status.textContent='Recipient selected. Type to add another.';};results.append(b);
  }
  status.textContent=results.children.length?`${results.children.length} matching Outlook recipient(s). Select to add.`:'No matches. Enter an email address manually.';
 }catch(e){if(seq===planLookupSequence)status.textContent='Outlook suggestions unavailable. Manual email entry still works.';}
}
$('planContactEnable')?.addEventListener('click',async()=>{
 const button=$('planContactEnable'),status=$('planContactStatus');
 if(!m365Client||!m365Account){status.textContent='Connect your Microsoft 365 account in Configuration before enabling recipient suggestions. Manual addresses still work.';return;}
 button.disabled=true;status.textContent='Requesting Outlook recipient lookup permission…';
 try{
  if(peopleLookupEnabled){peopleLookupEnabled=false;const key=peopleLookupPreferenceKey();if(key)localStorage.removeItem(key);$('planContactResults').replaceChildren();status.textContent='Suggestions disabled for this account. Microsoft 365 consent is managed separately.';}
  else{await m365Client.acquireTokenPopup({account:m365Account,scopes:['People.Read']});peopleLookupEnabled=true;const key=peopleLookupPreferenceKey();if(key)localStorage.setItem(key,'enabled');status.textContent='Recipient suggestions enabled. Type two or more characters in Participants.';void planRecipientSearch();}
  peopleLookupSetUI();button.textContent=peopleLookupEnabled?'Disable Outlook recipient suggestions':'Enable Outlook recipient suggestions';button.setAttribute('aria-pressed',String(peopleLookupEnabled));
 }catch(e){status.textContent='Microsoft 365 recipient lookup could not be enabled: '+String(e?.message||e)+'. You can enter addresses manually.';diagnostic('m365.plan_recipients.permission_error',{message:String(e?.message||e)},'warn');}
 finally{button.disabled=false;}
});
$('planParticipants')?.addEventListener('input',()=>{clearTimeout(planLookupTimer);planLookupTimer=setTimeout(()=>void planRecipientSearch(),350);});
for(const id of ['planCadence','planDuration','planTime','planStandupRepeat','planOtherRepeat','planStandup'])$(id)?.addEventListener('change',renderPlanResolvedSummary);
$('planDays')?.addEventListener('change',renderPlanResolvedSummary);
function scheduleMeetingRecords(w){return (w?.meetingSchedules||[]).flatMap(sc=>sc.meetings||[]);}
function previewCeremonyPlan(){
 clearCeremonyProposal();const w=activeScheduleWorkspace();if(!w)return notify('Select a workspace first.',true);const range=scheduleRange();if(!range.start||!range.end)return notify('Select start and end dates.',true);
 const start=planDate(range.start),end=planDate(range.end),span=Math.round((end-start)/86400000);if(!Number.isFinite(span)||span<0||span>730)return notify('Choose a date range between 1 day and 24 months.',true);
 const checked=id=>$(id).checked,duration=Number($('planDuration').value);if(!Number.isInteger(duration)||duration<5||duration>120)return notify('Standup duration must be 5–120 minutes.',true);
 const time=$('planTime').value||'09:30',participants=$('planParticipants').value.trim(),existing=scheduleMeetingRecords(w).concat((registry.sprints||[]).filter(s=>s.workspaceId===w.id).flatMap(s=>s.ceremonies||[]));
 const has=(date,type)=>existing.some(c=>(c.date===date||(c.repeat&&c.repeat!=='none'&&c.date<=date&&c.repeatEnd>=date))&&(c.type===type||c.secondary===type)&&c.status!=='Cancelled')||proposedCeremonies.some(c=>c.date===date&&(c.type===type||c.secondary===type));
 // Derive a regular sprint cadence from the workspace's actual selected sprint dates.
 // Irregular or non-whole-week sprints cannot be represented by a native Outlook weekly rule.
 const sprint=currentSprint();
 const sprintDays=sprint?.start&&sprint?.end?Math.round((planDate(sprint.end)-planDate(sprint.start))/86400000)+1:0;
 const sprintWeeks=sprintDays>=7&&sprintDays%7===0?sprintDays/7:0;
 const cadenceRange=span+1>sprintDays&&sprintWeeks>0;
 const add=(type,date,minutes,secondary='')=>{
  if(!date||has(date,type)||(secondary&&has(date,secondary)))return;
  const meeting={type,secondary,title:'',date,time,duration:minutes,participants,status:'Proposed',agenda:planAgenda(type)+(secondary?'\n\n'+planAgenda(secondary):''),outcome:''};
  if(type!=='Standup'&&$('planOtherRepeat').value!=='single'&&cadenceRange)Object.assign(meeting,{repeat:'sprint',repeatInterval:sprintWeeks,repeatEnd:range.end});
  proposedCeremonies.push(meeting);
 };
 // Place major ceremonies as a coordinated sequence, leaving room for work between them.
 const weekday=i=>{const d=new Date(start.getTime()+i*86400000).getUTCDay();return d>0&&d<6;};
 const valid=Array.from({length:span+1},(_,i)=>i).filter(weekday);
 const nearest=(target,min=0,max=span)=>{const options=valid.filter(i=>i>=min&&i<=max);return options.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b)[0]??Math.max(0,Math.min(span,Math.round(target)));};
 const asDate=i=>planISO(new Date(start.getTime()+i*86400000));
 const cycleSpan=cadenceRange?Math.min(span,sprintDays-1):span;
 const planning=nearest(0),review=nearest(cycleSpan>=10?cycleSpan-5:cycleSpan>=7?cycleSpan-3:cycleSpan-1,planning+1,cycleSpan),retroDay=nearest(cycleSpan>=7?cycleSpan-1:cycleSpan,review+1,cycleSpan),refine=nearest(cycleSpan*0.55,planning+1,Math.max(planning+1,review-1));
 if(checked('planPlanning'))add('Sprint Planning',asDate(planning),60);
 if(checked('planReview'))add('Sprint Review',asDate(review),45);
 const retro=checked('planRetro'),groom=checked('planGroom');
 if(retro&&groom&&checked('planCombine'))add('Retrospective',asDate(retroDay),60,'Backlog Refinement');
 else{if(retro)add('Retrospective',asDate(retroDay),30);if(groom)add('Backlog Refinement',asDate(refine),30);}
 if(checked('planStandup')){
  const selected=resolvePlanStandupDays(range,existing,proposedCeremonies);
  const dates=Array.from({length:span+1},(_,i)=>asDate(i)).filter(date=>selected.includes(planDate(date).getUTCDay()));
  const previous=existing.filter(c=>c.type==='Standup'&&c.status!=='Cancelled'&&c.date<=range.end&&(c.repeatEnd||c.date)>=range.start);
  if($('planStandupRepeat').value==='weekly'){
   // One native Graph series, not an event per weekday.
   const first=dates.find(date=>!previous.some(c=>c.repeat==='weekly'&&c.date<=date&&c.repeatEnd>=date));
   if(first)proposedCeremonies.push({type:'Standup',title:'',date:first,time,duration,participants,status:'Proposed',agenda:planAgenda('Standup'),outcome:'',repeat:'weekly',repeatDays:selected.map(d=>OUTLOOK_DAYS[d]),repeatEnd:range.end});
  }else{
   for(const date of dates){if(previous.some(c=>c.repeat==='weekly'&&c.date<=date&&c.repeatEnd>=date)||has(date,'Standup'))continue;
    proposedCeremonies.push({type:'Standup',title:'',date,time,duration,participants,status:'Proposed',agenda:planAgenda('Standup'),outcome:'',repeat:'none'});
   }
  }
  if(!dates.length){$('ceremonyPreviewStatus').textContent='No eligible standup weekdays. Return to Step 3 and adjust cadence or selected weekdays.';}

 }
 proposedCeremonies.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));proposalWorkspaceId=w.id;proposalRange=range;
 const table=document.createElement('table'),header=document.createElement('tr');for(const label of ['Include','Ceremony','Outlook booking','Date','Time','Minutes']){const th=document.createElement('th');th.textContent=label;header.append(th);}table.append(header);
 for(const c of proposedCeremonies){const tr=document.createElement('tr');const cell=()=>{const td=document.createElement('td');tr.append(td);return td;};const include=document.createElement('input');include.type='checkbox';include.checked=true;include.onchange=()=>{c.excluded=!include.checked;proposalCalendar();};cell().append(include);cell().textContent=c.type+(c.secondary?' + '+c.secondary:'');cell().textContent=c.repeat==='weekly'?'One weekly series · '+(c.repeatDays||[]).join(', '):c.repeat==='sprint'?'One series · every '+c.repeatInterval+' weeks':'One-time event';for(const [key,type] of [['date','date'],['time','time'],['duration','number']]){const input=document.createElement('input');if(type==='time'){input.type='time';input.step='60';input.setAttribute('list','gsTimePresets');populateMeetingTimePicker(input,c[key]);}else{input.type=type;input.value=c[key];}if(type==='number'){input.min='5';input.max='480';}input.onchange=()=>{c[key]=type==='number'?Number(input.value):input.value;proposalCalendar();};cell().append(input);}table.append(tr);}
 $('ceremonyPreview').replaceChildren(table);$('confirmCeremonies').disabled=!proposedCeremonies.length;const included=proposedCeremonies.filter(c=>!c.excluded);
 const standups=included.filter(c=>c.type==='Standup'&&c.repeat==='weekly');const existingStandups=scheduleMeetingRecords(w).filter(c=>c.type==='Standup'&&c.status!=='Cancelled'&&c.repeatEnd>=range.start&&c.date<=range.end);
 const distinctDays=[...new Set(standups.flatMap(c=>c.repeatDays||[OUTLOOK_DAYS[planDate(c.date).getUTCDay()]]))];
 const nonStandups=included.length-standups.length;
 $('ceremonyPreviewStatus').textContent=`${existingStandups.length} existing standup series retained; ${included.length} proposed meeting records (${standups.length} recurring standup series across ${distinctDays.length} selected weekdays; ${included.filter(c=>c.type==='Standup'&&c.repeat!=='weekly').length} individual standups; ${included.filter(c=>c.type!=='Standup').length} other ceremonies). Regular sprint ceremonies use one Outlook series when a whole-week sprint cadence and a longer workspace period are available; irregular dates require manual scheduling. Booking each standup record creates one Outlook series. Calendar availability has not been checked.`;
 proposalCalendar();
}
async function confirmCeremonyPlan(){const w=activeScheduleWorkspace();if(!w||w.id!==proposalWorkspaceId||!proposalRange)return notify('Workspace changed. Regenerate the proposal.',true);const selected=proposedCeremonies.filter(c=>!c.excluded);if(!selected.length)return notify('Select at least one meeting.',true);if(selected.some(c=>!c.date||c.date<proposalRange.start||c.date>proposalRange.end||!c.time||!Number.isInteger(c.duration)||c.duration<5||c.duration>480))return notify('Selected meetings need valid dates, times and durations within the chosen period.',true);
 const keys=new Set();for(const c of selected){const k=[c.date,c.type,c.secondary||''].join('|');if(keys.has(k))return notify('Duplicate meetings in preview.',true);keys.add(k);}
 const existing=scheduleMeetingRecords(w).concat((registry.sprints||[]).filter(s=>s.workspaceId===w.id).flatMap(s=>s.ceremonies||[]));const unique=selected.filter(c=>!existing.some(e=>e.status!=='Cancelled'&&e.date===c.date&&e.type===c.type&&e.secondary===c.secondary));if(!unique.length)return notify('These meetings already exist.',true);
 if(!confirm(`CONFIRM MEETING SCHEDULE\n\nWorkspace: ${w.name}\nPeriod: ${proposalRange.start} to ${proposalRange.end}\nMeetings: ${unique.length}\nParticipants: ${$('planParticipants').value||'Not specified'}\n\nSave this draft schedule and open its overview?\nNo Outlook invitations will be sent.`))return;const now=new Date().toISOString();const scheduleId=crypto.randomUUID();const ok=await persist(r=>{const target=r.workspaces.find(x=>x.id===w.id);target.meetingSchedules||=[];target.meetingSchedules.push({id:scheduleId,name:'Meeting schedule '+proposalRange.start+' – '+proposalRange.end,start:proposalRange.start,end:proposalRange.end,createdAt:now,updatedAt:now,lifecycle:'Draft',preferences:{standupDuration:Number($('planDuration').value),cadence:$('planCadence').value,standupRepeat:$('planStandupRepeat').value,otherRepeat:$('planOtherRepeat').value,weekdays:[...$('planDays').querySelectorAll('input:checked')].map(x=>Number(x.value)),time:$('planTime').value,participants:$('planParticipants').value,types:['Planning','Standup','Review','Retro','Groom'].filter((x,i)=>[$('planPlanning'),$('planStandup'),$('planReview'),$('planRetro'),$('planGroom')][i].checked),combine:$('planCombine').checked},meetings:unique.map(c=>{const {excluded,...meeting}=c;return {...meeting,id:crypto.randomUUID(),createdAt:now,updatedAt:now};})});},false);
 if(ok){diagnostic('workspace.schedule.created',{workspaceId:w.id,scheduleId,count:unique.length});clearCeremonyProposal();expandedScheduleId=scheduleId;renderWorkspaceSchedules();renderCeremonies();renderCeremonyInsights();showWizardStep(1);const saved=$('scheduleSavedNotice');if(saved)saved.textContent=`Saved ${unique.length} meetings as an internal schedule. Review saved meetings below, then select Schedule in Outlook for each meeting or series. No invitations have been sent.`;const section=$('workspaceSchedules');section?.scrollIntoView({behavior:'smooth',block:'start'});notify(`${unique.length} meetings saved as a draft. No Outlook events created.`);}}
function renderWorkspaceSchedules(){const list=$('workspaceSchedules');if(!list)return;list.replaceChildren();const w=activeScheduleWorkspace();if(!w)return;const schedules=w.meetingSchedules||[];if(!schedules.length){list.textContent='No workspace meeting schedules yet.';return;}for(const sc of schedules){const box=document.createElement('div');box.className='ceremony-record';const heading=document.createElement('strong');heading.textContent=sc.name;const info=document.createElement('p');info.className='muted';info.textContent=`${sc.start} to ${sc.end} · ${(sc.meetings||[]).length} meeting record(s) · ${(sc.meetings||[]).filter(m=>m.outlook?.state==='booked').length} Outlook booking(s) · ${sc.lifecycle||'Draft'}${sc.retirementReason?' · '+sc.retirementReason:''}`;box.append(heading,info);const actions=document.createElement('div');actions.className='row';const extend=document.createElement('button');extend.textContent='Extend';extend.onclick=()=>{const date=prompt('New end date (YYYY-MM-DD)',sc.end);if(date!==null)void extendWorkspaceSchedule(sc.id,date);};const details=document.createElement('button');details.className='secondary';details.textContent=expandedScheduleId===sc.id?'Hide meetings':'View meetings';details.onclick=()=>{expandedScheduleId=expandedScheduleId===sc.id?null:sc.id;renderWorkspaceSchedules();};actions.append(extend,details);
 const calendarButton=document.createElement('button');calendarButton.className='secondary';calendarButton.textContent='Calendar';calendarButton.onclick=()=>{expandedScheduleId=sc.id;calendarScheduleId=calendarScheduleId===sc.id?null:sc.id;renderWorkspaceSchedules();};actions.append(calendarButton);
 const lifecycle=sc.lifecycle||'Draft';
 if(lifecycle==='Draft'){const commit=document.createElement('button');commit.textContent='Commit schedule';commit.onclick=()=>void changeScheduleLifecycle(sc.id,'commit');const discard=document.createElement('button');discard.className='secondary';discard.textContent='Discard draft';discard.onclick=()=>void changeScheduleLifecycle(sc.id,'discard');actions.append(commit,discard);}
 if(lifecycle==='Committed'){const end=document.createElement('button');end.className='secondary';end.textContent='End schedule…';end.onclick=()=>void changeScheduleLifecycle(sc.id,'retire');actions.append(end);}
 if(lifecycle==='Retired')extend.disabled=true;
 box.append(actions);if(calendarScheduleId===sc.id){const calendar=document.createElement('div');renderMeetingCalendar(calendar,sc.meetings||[],sc.start);box.append(calendar);}if(expandedScheduleId===sc.id){const panel=document.createElement('div');panel.className='schedule-meetings';for(const c of [...(sc.meetings||[])].sort((a,b)=>(a.date||'').localeCompare(b.date||''))){const line=document.createElement('div');line.className='row';const label=document.createElement('span');label.textContent=`${c.originalPlannedDate?'Originally '+c.originalPlannedDate+' → ':''}${c.date} ${c.time} · ${c.title||c.type}${c.secondary?' + '+c.secondary:''} · ${c.duration||30} min · ${c.status||'Proposed'}`;const edit=document.createElement('button');edit.className='secondary';edit.textContent='Edit';edit.onclick=()=>editCeremony(c.id,sc.id);line.append(label,edit);
 const outlook=document.createElement('button');outlook.type='button';outlook.className='secondary';
 outlook.textContent=c.outlook?.state==='booked'?'Booked in Outlook':c.outlook?.state==='pending'?'Booking needs review':c.outlook?.state==='cancelled'?'Cancelled in Outlook':c.outlook?.state?'Outlook sync needs review':'Schedule in Outlook';
 outlook.disabled=!!c.outlook?.state||c.status==='Cancelled'||c.status==='Completed';
 outlook.onclick=()=>void scheduleCeremonyInOutlook(c.id,sc.id);
 line.dataset.ceremonyBookingId=String(c.id);line.dataset.ceremonyScheduleId=String(sc.id);
 line.append(outlook);
 const removeMeeting=document.createElement('button');removeMeeting.type='button';removeMeeting.className='secondary';removeMeeting.textContent='Remove';
 removeMeeting.disabled=!!c.outlook?.state&&c.outlook.state!=='cancelled';
 removeMeeting.title=removeMeeting.disabled?'Cancel the Outlook meeting first. Uncertain operations require reconciliation.':'Remove this saved meeting record';
 removeMeeting.onclick=()=>void deleteCeremony(c.id,sc.id);
 if(c.outlook?.state==='booked'){const cancel=document.createElement('button');cancel.type='button';cancel.className='danger';cancel.textContent='Cancel Outlook meeting';cancel.onclick=()=>void outlookCancelCeremony(c.id,sc.id);line.append(cancel);}
 else if(['pending','sync-pending','cancel-pending'].includes(c.outlook?.state)){const review=document.createElement('button');review.type='button';review.className='secondary';review.textContent='Review Outlook status';review.onclick=()=>void outlookReconcile(c.id,sc.id);line.append(review);}
 line.append(removeMeeting);panel.append(line);}box.append(panel);}list.append(box);}}


async function changeScheduleLifecycle(id,action){
 const w=activeScheduleWorkspace(),sc=w?.meetingSchedules?.find(x=>x.id===id);if(!sc)return;
 const state=sc.lifecycle||'Draft';const now=new Date().toISOString();
 if((action==='discard'||action==='retire')&&(sc.meetings||[]).some(m=>m.outlook?.state))return notify('This schedule contains Outlook bookings or unresolved requests. Cancel or reconcile the linked Outlook meetings before retiring or discarding this schedule.',true);
 if(action==='discard'&&state!=='Draft')return notify('Only draft schedules can be discarded.',true);
 if(action==='commit'&&state!=='Draft')return notify('Only drafts can be committed.',true);
 if(action==='retire'&&state==='Retired')return;
 let reason='';
 if(action==='retire'){reason=prompt('Reason for ending schedule (completed, pivot, paused, cancelled or other):','Project pivot');if(reason===null)return;reason=reason.trim()||'Not specified';}
 const count=(sc.meetings||[]).filter(m=>m.status!=='Completed'&&m.status!=='Cancelled').length;
 const question=action==='discard'?`Discard draft schedule and its ${sc.meetings.length} proposed records? This cannot be undone.`:action==='commit'?`Commit this internal schedule with ${sc.meetings.length} meetings? This does not book Outlook events.`:`End this schedule and cancel ${count} unfinished meeting records? Completed meetings and notes remain in history. No Outlook events will be changed.`;
 if(!confirm(question))return;
 const ok=await persist(r=>{const ws=r.workspaces.find(x=>x.id===w.id);const item=ws.meetingSchedules.find(x=>x.id===id);if(action==='discard'){ws.meetingSchedules=ws.meetingSchedules.filter(x=>x.id!==id);return;}if(action==='commit'){item.lifecycle='Committed';item.committedAt=now;}else{item.lifecycle='Retired';item.retiredAt=now;item.retirementReason=reason;for(const m of item.meetings||[]){if(m.status!=='Completed'&&m.status!=='Cancelled'){m.status='Cancelled';m.cancelledBySchedule=true;m.updatedAt=now;}}}item.updatedAt=now;},false);
 if(ok){if(action==='discard'&&expandedScheduleId===id)expandedScheduleId=null;renderWorkspaceSchedules();renderCeremonies();renderCeremonyInsights();notify(action==='discard'?'Draft discarded.':action==='commit'?'Schedule committed internally. No Outlook bookings made.':'Schedule retired; history retained. No Outlook bookings changed.');}
}
function renderMeetingCalendar(host,meetings,initialDate){host.replaceChildren();const dates=meetings.map(m=>m.date).filter(Boolean).sort();let anchor=initialDate||dates[0]||new Date().toISOString().slice(0,10);let [yy,mm]=anchor.split('-').map(Number);let view=new Date(Date.UTC(yy,mm-1,1));const toolbar=document.createElement('div');toolbar.className='row';const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('strong');prev.className=next.className='secondary';prev.textContent='‹';next.textContent='›';toolbar.append(prev,label,next);const grid=document.createElement('div');grid.className='meeting-calendar-grid';host.append(toolbar,grid);
 const draw=()=>{label.textContent=view.toLocaleDateString('en-CA',{month:'long',year:'numeric',timeZone:'UTC'});grid.replaceChildren();for(const name of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']){const h=document.createElement('div');h.className='meeting-calendar-heading';h.textContent=name;grid.append(h);}const y=view.getUTCFullYear(),m=view.getUTCMonth(),first=new Date(Date.UTC(y,m,1)).getUTCDay(),days=new Date(Date.UTC(y,m+1,0)).getUTCDate();for(let i=0;i<first;i++){const blank=document.createElement('div');blank.className='meeting-calendar-day empty';grid.append(blank);}for(let d=1;d<=days;d++){const iso=planISO(new Date(Date.UTC(y,m,d))),cell=document.createElement('div');cell.className='meeting-calendar-day';const num=document.createElement('strong');num.textContent=d;cell.append(num);for(const item of meetings.filter(x=>x.date===iso)){const entry=document.createElement('div');entry.className='meeting-calendar-entry';entry.textContent=`${item.time||''} ${item.title||item.type}${item.secondary?' + '+item.secondary:''}`;entry.title=`${item.duration||30} min · ${item.status||'Proposed'}`;cell.append(entry);}grid.append(cell);}};
 prev.onclick=()=>{view=new Date(Date.UTC(view.getUTCFullYear(),view.getUTCMonth()-1,1));draw();};next.onclick=()=>{view=new Date(Date.UTC(view.getUTCFullYear(),view.getUTCMonth()+1,1));draw();};draw();}
function proposalCalendar(){const host=$('proposalCalendar');if(host)renderMeetingCalendar(host,proposedCeremonies.filter(m=>!m.excluded),proposalRange?.start);}
async function editWorkspaceMeeting(scheduleId,meetingId){editCeremony(meetingId,scheduleId);}
async function extendWorkspaceSchedule(id,newEnd){const w=activeScheduleWorkspace(),sc=w?.meetingSchedules?.find(x=>x.id===id);if(!sc)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(newEnd)||!Number.isFinite(planDate(newEnd).getTime())||newEnd<=sc.end||Math.round((planDate(newEnd)-planDate(sc.start))/86400000)>730)return notify('Choose a later valid end date, within 24 months of the start.',true);
 const p=sc.preferences||{},days=new Set(p.weekdays||[1,2,3,4,5]),existing=scheduleMeetingRecords(w),extra=[];const begin=planDate(sc.end),end=planDate(newEnd);for(let i=1;i<=Math.round((end-begin)/86400000);i++){const date=planISO(new Date(begin.getTime()+i*86400000));if(!days.has(planDate(date).getUTCDay())||!p.types?.includes('Standup'))continue;if(p.cadence==='unoccupied'&&existing.some(c=>c.date===date&&c.status!=='Cancelled'))continue;extra.push({id:crypto.randomUUID(),type:'Standup',secondary:'',title:'',date,time:p.time||'09:30',duration:p.standupDuration||15,participants:p.participants||'',status:'Proposed',agenda:planAgenda('Standup'),outcome:'',createdAt:new Date().toISOString()});}
 if(!confirm(`Extend to ${newEnd} and add ${extra.length} new standup(s)? Existing meetings remain unchanged. Other ceremony types can be added individually.`))return;const ok=await persist(r=>{const target=r.workspaces.find(x=>x.id===w.id).meetingSchedules.find(x=>x.id===id);target.end=newEnd;target.meetings.push(...extra);target.updatedAt=new Date().toISOString();},false);if(ok){renderWorkspaceSchedules();notify(`Schedule extended; ${extra.length} new standup(s).`);}}
// Persistent deletion audit is intentionally separate from browser diagnostics.
function renderDeletionAudit(){const el=$('sprintDeletionAudit');if(!el)return;el.replaceChildren();const records=(registry?.sprintDeletionAudit||[]).slice(-100).reverse();if(!records.length){el.textContent='No sprint deletions recorded.';return;}for(const a of records){const p=document.createElement('p');p.textContent=`${a.at} · ${a.actor} · ${a.workspaceName} / ${a.sprintName} · ${a.itemCount} assigned items, ${a.ceremonyCount} ceremonies · ${a.id}`;el.append(p);}}
async function deleteSprintSafely(){const s=currentSprint();if(!s)return notify('Select a saved sprint to delete.',true);
 if(!(await guardSprint()))return;const w=activeWorkspace();const details=`Sprint: ${s.name}\nWorkspace: ${w?.name||'Unknown'}\nAssigned work items: ${(s.itemIds||[]).length}\nCeremonies: ${(s.ceremonies||[]).length}\n\nThis permanently deletes Global Sprints coordination records. Azure DevOps work items, states and iteration paths remain untouched.`;
 if(!confirm('DELETE SPRINT — WARNING\n\n'+details+'\n\nContinue to explicit acceptance?'))return;
 const typed=prompt(`To accept permanent deletion, type the exact sprint name:\n${s.name}`);if(typed!==s.name)return notify('Deletion cancelled: sprint name acknowledgement did not match.',true);
 const actor=context?.user?.uniqueName||context?.user?.name||sdk?.getUser?.()?.name||'Unknown user';const at=new Date().toISOString();const audit={id:crypto.randomUUID(),at,actor,workspaceId:s.workspaceId,workspaceName:w?.name||'',sprintId:s.id,sprintName:s.name,itemCount:(s.itemIds||[]).length,ceremonyCount:(s.ceremonies||[]).length};
 const ok=await persist(r=>{if(!r.sprints.some(x=>x.id===s.id&&x.workspaceId===activeWorkspaceId))throw Error('Sprint no longer exists in this workspace.');r.sprints=r.sprints.filter(x=>x.id!==s.id);r.sprintDeletionAudit||=[];r.sprintDeletionAudit.push(audit);r.sprintDeletionAudit=r.sprintDeletionAudit.slice(-100);},false);
 if(ok){diagnostic('sprint.deleted',{sprintId:s.id,workspaceId:s.workspaceId,auditId:audit.id});renderSprintPicker('');clearWorkspaceViews();renderWorkspacePicker(activeWorkspaceId);renderDeletionAudit();rememberContext();notify('Sprint deleted. Native Azure DevOps work items were not changed.');}
}
// v0.3.23: PM assistance. Derived summaries never change native ADO state.
function pmSprintItems(){
 const s=currentSprint();if(!s)return {loaded:[],missing:[]};
 const all=new Map([...items,...assignedItems].map(w=>[Number(w.id),w]));
 return {loaded:(s.itemIds||[]).map(Number).map(id=>all.get(id)).filter(Boolean).filter(w=>!isPlanningContextType(w)),missing:(s.itemIds||[]).map(Number).filter(id=>!all.has(id))};
}
function pmIsComplete(w){return ['Done','Closed'].includes(workflowColumn(w));}
function pmDay(date){return date?new Date(date+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}):'Unscheduled';}
function pmActionRow(parent,title,detail,action){
 const box=document.createElement('div');box.className='ceremony-record';
 const heading=document.createElement('strong');heading.textContent=title;
 const p=document.createElement('p');p.className='muted';p.textContent=detail;
 box.append(heading,p);
 if(action){const b=document.createElement('button');b.type='button';b.textContent=action.label;b.onclick=action.run;box.append(b);}
 parent.append(box);
}
function renderPmAssistance(){
 const target=$('pmActionQueue');if(!target)return;target.replaceChildren();const s=currentSprint();
 if(!s){target.textContent='Select a sprint to see management actions.';return;}
 const {loaded}=pmSprintItems(),missing=reportCoverage().missing;const today=new Date().toISOString().slice(0,10);
 const blocked=loaded.filter(w=>s.blockedItems?.[w.id]&&!pmIsComplete(w));
 for(const w of blocked)pmActionRow(target,'Blocked: #'+w.id+' '+w.title,(w.project||'')+' · '+(w.assignee||'Unassigned')+' · '+w.state,{label:'Open work item',run:()=>{if(w.url)window.open(w.url,'_blank','noopener,noreferrer');else notify('No Azure DevOps link available for this item.',true);}});
 const upcoming=[...(s.ceremonies||[]),...scheduleMeetingRecords(activeScheduleWorkspace())].filter(c=>c.date&&c.date>=today&&c.status!=='Cancelled'&&c.status!=='Completed').sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time)).slice(0,8);
 for(const c of upcoming)pmActionRow(target,'Ceremony: '+(c.title||c.type)+(c.secondary?' + '+c.secondary:''),pmDay(c.date)+' '+(c.time||'')+' · '+(c.status||'Proposed'),{label:'Review in Planning',run:()=>{activateTab('planning');editCeremony(c.id);}});
 for(const c of (s.ceremonies||[]).filter(c=>c.outcome&&c.status!=='Completed'&&c.status!=='Cancelled').slice(0,5))pmActionRow(target,'Follow-up: '+(c.title||c.type),c.outcome,{label:'Review meeting',run:()=>{activateTab('planning');editCeremony(c.id);}});
 if(missing.length)pmActionRow(target,'Incomplete work-item data',missing.length+' assigned item(s) are not loaded. Load sprint work before interpreting health metrics.');
 if(!target.children.length)target.textContent='No currently identified blockers, upcoming ceremonies or saved meeting follow-ups.';
}
function standupText(){
 const s=currentSprint();if(!s)return 'Select a sprint first.';
 const {loaded}=pmSprintItems(),missing=reportCoverage().missing;const blocked=loaded.filter(w=>s.blockedItems?.[w.id]&&!pmIsComplete(w));
 const active=loaded.filter(w=>!pmIsComplete(w)&&!s.blockedItems?.[w.id]);
 const lines=['Standup preparation — '+s.name,'Generated '+new Date().toLocaleString(),'','BLOCKERS ('+blocked.length+')'];
 for(const w of blocked)lines.push('• #'+w.id+' '+w.title+' — '+(w.assignee||'Unassigned')+' ['+w.state+']');
 if(!blocked.length)lines.push('• No blocked loaded executable items.');
 lines.push('','OTHER OPEN WORK ('+active.length+')');
 for(const w of active.slice(0,30))lines.push('• #'+w.id+' '+w.title+' — '+(w.assignee||'Unassigned')+' ['+w.state+']');
 if(active.length>30)lines.push('• '+(active.length-30)+' additional items not shown.');
 lines.push('',''+missing.length+' assigned item(s) not loaded. This is a preparation snapshot, not a complete status history.','Discuss: What changed? What is next? What help is needed?');
 return lines.join('\n');
}
function prepareStandup(){const node=$('standupSummary');if(node){node.textContent=standupText();diagnostic('standup.prepared',{sprintId:currentSprint()?.id||'',at:new Date().toISOString()});}}
$('prepareStandup')?.addEventListener('click',prepareStandup);
$('copyStandup')?.addEventListener('click',()=>{const summary=standupText();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(summary).then(()=>notify('Standup summary copied.')).catch(()=>notify('Clipboard unavailable; select and copy the displayed summary.',true));else notify('Clipboard unavailable; select and copy the displayed summary.',true);});

$('wizardBack').onclick=()=>showWizardStep(wizardStep-1);$('wizardReset').onclick=()=>{
 const hasProposal=proposedCeremonies.length>0;
 if(hasProposal&&!confirm('Discard the unsaved meeting proposal? Saved workspace schedules and Outlook meetings will remain unchanged.'))return;
 clearCeremonyProposal();
 $('planScope').value='period';$('planStart').value='';$('planEnd').value='';
 for(const id of ['planPlanning','planStandup','planReview','planRetro','planGroom'])$(id).checked=true;
 $('planCombine').checked=false;$('planCadence').value='unoccupied';$('planStandupRepeat').value='weekly';$('planOtherRepeat').value='auto';$('planDuration').value='15';
 populateMeetingTimePicker($('planTime'),'09:30');$('planParticipants').value='';
 document.querySelectorAll('#planDays input[type=checkbox]').forEach(el=>{el.checked=el.value!=='0'&&el.value!=='6';});
 syncPlanScope();showWizardStep(1);
 $('wizardResetStatus').textContent='New proposal form ready. Saved workspace schedules and Outlook meetings were not changed.';
 notify('Unsaved proposal and form selections cleared. Saved meetings unchanged.');
};
$('wizardNext').onclick=()=>{if(wizardStep===1){const r=scheduleRange();if(!r.start||!r.end||r.end<r.start)return notify($('planScope').value==='sprint'?'Select a saved sprint with valid start and end dates, or choose Defined project period.':'Choose a valid schedule period.',true);}if(wizardStep===3&&$('planStandup').checked){const range=scheduleRange();if(!resolvePlanStandupDays(range,scheduleMeetingRecords(activeScheduleWorkspace())).length)return notify('No eligible standup weekdays. Adjust the cadence or weekday selection before continuing.',true);}showWizardStep(wizardStep+1);};
$('planScope').onchange=syncPlanScope;
$('planScope').value='sprint';
$('confirmCeremonies').onclick=()=>void confirmCeremonyPlan();
$('deleteSprint').onclick=()=>void deleteSprintSafely();
$('sprintPicker').addEventListener('change',syncPlanScope);
$('workspacePicker').addEventListener('change',()=>{clearCeremonyProposal();renderWorkspaceSchedules();syncPlanScope();restoreSavedMeetingPreferences();});
$('planCombine').addEventListener('change',()=>{if($('planCombine').checked){$('planRetro').checked=true;$('planGroom').checked=true;}});
// Initialization-dependent views render after organization data loads.

// Begin asynchronous initialization only after all module-level state and handlers are initialized.

// Sprint cadence: UTC calendar arithmetic avoids daylight-saving drift. Sprint end is inclusive.
function cadenceDate(value,offset){const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return '';d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function cadenceRows(){const start=$('cadenceStart')?.value||'',weeks=Number($('cadenceWeeks')?.value||2),count=Number($('cadenceCount')?.value||3);if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!cadenceDate(start,0))return [];return Array.from({length:count},(_,i)=>({index:i+1,start:cadenceDate(start,i*weeks*7),end:cadenceDate(start,(i+1)*weeks*7-1),turnover:cadenceDate(start,(i+1)*weeks*7)}));}
function renderCadence(){const host=$('cadencePreview');if(!host)return;const rows=cadenceRows();host.replaceChildren();if(!rows.length){host.textContent='Select a valid start date.';return;}const table=document.createElement('table');const header=document.createElement('tr');for(const name of ['Cycle','Start','Last day','Next turnover']){const cell=document.createElement('th');cell.textContent=name;header.append(cell);}table.append(header);for(const r of rows){const tr=document.createElement('tr');for(const value of [`Sprint ${r.index}`,r.start,r.end,r.turnover]){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}host.append(table);}
function applyCadence(){const row=cadenceRows()[0];if(!row)return notify('Select a valid cadence start date.',true);if($('sprintPicker').value&&!confirm('Replace the selected sprint form dates with the calculated window? Save Sprint to commit the change.'))return;$('start').value=row.start;$('end').value=row.end;updateDirty();syncPlanScope();notify('Calculated dates applied to sprint form. Save Sprint when ready.');}
const demoCases=[{name:'Normal cadence',description:'Three consecutive two-week sprints, 4 executable commitments, review and retrospective before turnover.',health:'On track',meetings:6},{name:'At-risk sprint',description:'Four unfinished commitments, two blockers and an overdue dependency near the sprint end.',health:'At risk',meetings:5},{name:'Project pivot',description:'A retired meeting schedule, cancelled future ceremonies and preserved completed outcomes.',health:'Needs attention',meetings:4},{name:'Insufficient evidence',description:'Missing work-item data and unconfirmed sprint dates; do not infer a healthy sprint.',health:'Insufficient data',meetings:2}];
function renderCadenceDemo(){const host=$('cadenceDemoData');if(!host)return;host.classList.toggle('hidden');if(host.classList.contains('hidden'))return;host.replaceChildren();for(const scenario of demoCases){const block=document.createElement('div');block.className='ceremony-record';const heading=document.createElement('strong');heading.textContent=scenario.name;const p=document.createElement('p');p.className='muted';p.textContent=scenario.description;const meta=document.createElement('p');meta.className='muted';meta.textContent=`Expected health: ${scenario.health} · ${scenario.meetings} synthetic meetings · no Azure DevOps writes`;block.append(heading,p,meta);host.append(block);}}
for(const id of ['cadenceStart','cadenceWeeks','cadenceCount'])$(id)?.addEventListener('change',renderCadence);
$('cadenceApply')?.addEventListener('click',applyCadence);
$('cadenceDemo')?.addEventListener('click',renderCadenceDemo);
renderCadence();

// Unified sprint creation. Uses the same workspace sprint collection as Save Sprint.
function openNewSprintDialog(){
 const sprints=workspaceSprints().filter(s=>s.start).sort((a,b)=>a.start.localeCompare(b.start));
 const latest=sprints.reduce((best,s)=>!best||((s.end||s.start)>(best.end||best.start))?s:best,null);
 const nextStart=latest?.end?cadenceDate(latest.end,1):new Date().toISOString().slice(0,10);
 const duration=latest?.start&&latest?.end?Math.max(1,Math.min(4,Math.round((Date.parse(latest.end+'T12:00:00Z')-Date.parse(latest.start+'T12:00:00Z'))/86400000/7+1/7))):2;
 $('newSprintName').value='Sprint '+(workspaceSprints().length+1);
 $('newSprintStart').value=nextStart;
 $('newSprintWeeks').value=String(duration);
 $('newSprintMethod').value='cadence';
 $('newSprintGoal').value='';
 $('newSprintEnd').value=cadenceDate(nextStart,duration*7-1);
 updateNewSprintPreview();
 $('newSprintDialog').classList.remove('hidden');
 guideShowIntro(false);
 $('sprintGuideHide').checked=guideHidden();
 $('newSprintName').focus();
}
function closeNewSprintDialog(){$('newSprintDialog').classList.add('hidden');}
function updateNewSprintPreview(){
 const manual=$('newSprintMethod').value==='manual';
 $('newSprintWeeksWrap').classList.toggle('hidden',manual);
 $('newSprintEndWrap').classList.toggle('hidden',!manual);
 const start=$('newSprintStart').value, weeks=Number($('newSprintWeeks').value);
 const end=manual?$('newSprintEnd').value:(start?cadenceDate(start,weeks*7-1):'');
 const turnover=end?cadenceDate(end,1):'';
 $('newSprintDatesPreview').textContent=start&&end?`Sprint: ${start} to ${end} (inclusive). Next turnover: ${turnover}. Dates may be edited later.`:'Choose valid sprint dates.';
}
async function createNewSprintFromDialog(){
 const name=$('newSprintName').value.trim(),start=$('newSprintStart').value,manual=$('newSprintMethod').value==='manual';
 const end=manual?$('newSprintEnd').value:cadenceDate(start,Number($('newSprintWeeks').value)*7-1);
 if(!activeWorkspaceId)return notify('Select a workspace first.',true);
 if(!name||!start||!end||end<start)return notify('Enter a name and valid sprint dates.',true);
 if(workspaceSprints().some(s=>s.name.toLowerCase()===name.toLowerCase()))return notify('A sprint with this name already exists in this workspace.',true);
 const id=crypto.randomUUID(),goal=$('newSprintGoal').value.trim();
 const ok=await persist(r=>{r.sprints.push({id,workspaceId:activeWorkspaceId,name,start,end,goal,status:'Planning',itemIds:[],snapshots:[]});},false);
 if(!ok)return;
 const wasGuided=sprintGuideInUse;
 closeNewSprintDialog();
 renderSprintPicker(id);
 await loadAssignedItems();
 rememberContext();
 notify(`Sprint "${name}" created (${start} to ${end}).`);
 if(wasGuided)guideNext();
}
$('headerNewSprint').addEventListener('click',openNewSprintDialog);
$('newSprintClose').addEventListener('click',closeNewSprintDialog);
$('newSprintCancel').addEventListener('click',closeNewSprintDialog);
$('newSprintCreate').addEventListener('click',()=>void createNewSprintFromDialog());
for(const id of ['newSprintMethod','newSprintStart','newSprintWeeks','newSprintEnd'])$(id).addEventListener('change',updateNewSprintPreview);

// v0.8.3: Lightweight, repeatable guidance; never creates additional records or changes workflow.
let sprintGuideInUse=false;
const sprintGuidePref='pnpc-gs-guide-hide-v1';
function guideHidden(){try{return localStorage.getItem(sprintGuidePref)==='yes';}catch{return false;}}
function guideShowIntro(on){sprintGuideInUse=on;$('sprintGuideIntro').classList.toggle('hidden',!on);$('sprintUseGuide').setAttribute('aria-expanded',String(on));$('sprintUseGuide').textContent=on?'Hide Guide':'Use Guide';}
$('sprintUseGuide').addEventListener('click',()=>guideShowIntro(!sprintGuideInUse));
$('sprintGuideHide').addEventListener('change',e=>{try{if(e.target.checked)localStorage.setItem(sprintGuidePref,'yes');else localStorage.removeItem(sprintGuidePref);}catch{}});
function guideNext(){const box=$('sprintGuideNext');box.classList.remove('hidden');$('guideNextHint').textContent='You can do both, in either order. The other option stays here until you dismiss this message.';}
$('guideAddWork').addEventListener('click',()=>{activateTab('board');$('guideNextHint').textContent='Open Sprint Backlog to browse or search work and add items directly. You can still select Plan Ceremonies here later.';const backlog=$('sprintBacklogPanel')||document.querySelector('.sprint-backlog-panel');if(backlog){backlog.open=true;backlog.scrollIntoView({block:'start'});}});
$('guideCeremonies').addEventListener('click',()=>{activateTab('planning');$('guideNextHint').textContent='Follow Meeting Schedule Setup to create a proposal. You can return here to add work whenever you like.';$('ceremonyAssistant')?.scrollIntoView({block:'start'});});
$('guideFinish').addEventListener('click',()=>$('sprintGuideNext').classList.add('hidden'));


// Synthetic demo data is deliberately isolated from organization storage and ADO mutation APIs.
const DEMO_KEY='pnpc-gs-demo-v039';
let demoActive=false, demoState=null;
function demoSeed(kind){
 const config={healthy:[30,22,0],risk:[30,16,4],pivot:[30,18,2],empty:[12,0,0]}[kind]||[30,16,4];
 const [count,completed,blocked]=config;
 const projects=['Sample Platform','Client Portal','Service Desk','Reporting API'];
 const people=['Alex Chen','Morgan Lee','Taylor Brooks','Jordan Patel'];
 const titles=['Implement authentication','Build project dashboard','Integrate service API','Verify acceptance criteria','Review client feedback','Document release workflow','Resolve data mapping','Run accessibility checks','Prepare deployment','Validate report metrics'];
 const start='2026-10-05',end='2026-10-23';
 const dateOffset=n=>{const d=new Date('2026-10-05T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const work=Array.from({length:count},(_,i)=>{
  const state=i<completed?(i%5===0?'Done':'Closed'):i<completed+Math.max(3,Math.floor((count-completed)/2))?'Active':'New';
  return {id:'DEMO-'+(i+1),title:titles[i%titles.length]+' '+(Math.floor(i/10)+1),project:projects[i%4],assignee:i%11===0?'':people[i%4],state,blocked:i>=completed&&i<completed+blocked,inSprint:true,type:i%7===0?'Feature':i%3===0?'Task':'User Story',effort:[1,2,3,5,8][i%5],priority:i%4+1,startDate:i%9===0?'':dateOffset(i%14),targetDate:i%9===0?'':dateOffset(3+i%16),dueDate:i%9===0?'':dateOffset(5+i%17),parentId:i%7===0?null:'DEMO-'+(Math.floor(i/7)*7+1)};
 });
 const history=[{name:'Sprint Alpha',points:24,items:10},{name:'Sprint Beta',points:31,items:12},{name:'Sprint Gamma',points:28,items:11},{name:'Sprint Delta',points:36,items:14}];
 const observations=Array.from({length:10},(_,i)=>({day:dateOffset(i*2),remaining:Math.max(0,count-Math.round(completed*i/9)),pointsRemaining:Math.max(0,work.reduce((a,w)=>a+w.effort,0)-Math.round(work.filter(w=>w.state==='Closed').reduce((a,w)=>a+w.effort,0)*i/9))}));
 return {kind,work,history,observations,meetings:[{id:'m1',type:'Sprint Planning',status:'Completed'},{id:'m2',type:'Standup',status:'Completed'},{id:'m3',type:'Review',status:'Proposed'},{id:'m4',type:'Retrospective + Refinement',status:'Proposed'}],decisions:[],start,end,createdAt:new Date().toISOString()};
}
function saveDemo(){try{localStorage.setItem(DEMO_KEY,JSON.stringify(demoState));}catch(e){diagnostic('demo.local_save_failed',{message:String(e)},'warn');}}
function demoHealth(){
 const work=demoState.work.filter(w=>w.inSprint),done=work.filter(w=>['Done','Closed'].includes(w.state)).length,blocked=work.filter(w=>w.blocked&&!['Done','Closed'].includes(w.state)).length;
 const remaining=work.length-done;
 const label=demoState.kind==='empty'&&!done&&!blocked?'Insufficient data':blocked>=3?'At risk':blocked>0?'Needs attention':remaining===0?'Completed':done===0?'Insufficient data':'On track';
 const reason=blocked?`${blocked} unresolved blockers`:`${done} of ${work.length} assigned items completed`;
 return {label,reason,count:work.length,done,blocked,remaining};
}
function demoReportRender(){
 const host=$('demoReports');if(!host||!demoState)return;host.replaceChildren();
 const work=demoState.work.filter(w=>w.inSprint&&w.type!=='Feature');
 const closed=work.filter(w=>w.state==='Closed'),done=work.filter(w=>w.state==='Done'),active=work.filter(w=>!['Closed','Done'].includes(w.state));
 const blocked=active.filter(w=>w.blocked),overdue=active.filter(w=>w.dueDate&&w.dueDate<reportToday());
 const summary=reportNode('section','gs-report-block');summary.append(reportNode('h3','','Sprint Health · '+demoState.kind.toUpperCase()));
 const metrics=reportNode('div','gs-metrics');for(const [name,value,detail] of [['Accepted',closed.length,work.length+' executable tickets'],['Awaiting validation',done.length,'Done is not Closed'],['Blocked',blocked.length,'Active blockers'],['Overdue',overdue.length,'Past due date'],['Story points accepted',closed.reduce((a,w)=>a+Number(w.effort||0),0),'Synthetic story points'],['Unscheduled',work.filter(w=>!w.startDate).length,'Missing start dates']])reportMetric(metrics,name,value,detail);summary.append(metrics);
 const percent=work.length?Math.round(closed.length/work.length*100):0,donePercent=work.length?Math.round(done.length/work.length*100):0;
 summary.append(reportNode('strong','gs-demo-big',percent+'% accepted'));
 const progress=reportNode('div','gs-progress');const accepted=reportNode('span','gs-progress-closed'),awaiting=reportNode('span','gs-progress-done');accepted.style.width=percent+'%';awaiting.style.width=donePercent+'%';progress.append(accepted,awaiting);summary.append(progress,reportNode('p','muted',`${closed.length} Closed · ${done.length} Done · ${active.length} open. This is fictional demo data.`));reportBlockerList(summary,work,w=>{demoEditTicket(w.id);});host.append(summary);
 const project=reportNode('section','gs-report-block');project.append(reportNode('h3','','Delivery by project'));reportVisualBars(project,[...new Set(work.map(w=>w.project))].map(name=>{const list=work.filter(w=>w.project===name);return {name,values:[list.filter(w=>w.state==='Closed').length,list.filter(w=>w.state==='Done').length,list.filter(w=>!['Closed','Done'].includes(w.state)).length]};}));host.append(project);
 const people=reportNode('section','gs-report-block');people.append(reportNode('h3','','Team workload'));reportVisualBars(people,[...new Set(work.map(w=>w.assignee||'Unassigned'))].map(name=>{const list=work.filter(w=>(w.assignee||'Unassigned')===name);return {name,values:[list.filter(w=>w.state==='Closed').length,list.filter(w=>w.state==='Done').length,list.filter(w=>!['Closed','Done'].includes(w.state)).length]};}));host.append(people);
 const charts=reportNode('div','gs-demo-charts');const velocity=reportNode('section','gs-report-block'),burn=reportNode('section','gs-report-block');velocity.append(reportNode('h3','','Historical velocity · Story points'));reportVelocityChart(velocity,demoState.history.map(x=>({name:x.name,value:x.points})));velocity.append(reportNode('p','muted','Four fictional completed global sprints.'));burn.append(reportNode('h3','','Sprint burndown · Executable tickets'));
 const obs=demoState.observations||[],svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 700 240');svg.setAttribute('role','img');svg.setAttribute('aria-label','Synthetic actual versus ideal burndown');svg.style.width='100%';
 const ns='http://www.w3.org/2000/svg',add=(tag,attrs)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));svg.append(el);return el;};
 const max=Math.max(1,...obs.map(o=>o.remaining)),x=i=>44+i*620/Math.max(1,obs.length-1),y=v=>205-v/max*165;
 add('line',{x1:44,y1:205,x2:670,y2:205,stroke:'currentColor','stroke-opacity':'.4'});add('line',{x1:44,y1:40,x2:44,y2:205,stroke:'currentColor','stroke-opacity':'.4'});add('line',{x1:44,y1:y(max),x2:664,y2:205,stroke:'#8996a7','stroke-dasharray':'6 5','stroke-width':2});add('polyline',{points:obs.map((o,i)=>x(i)+','+y(o.remaining)).join(' '),fill:'none',stroke:'#287fc1','stroke-width':3});for(let tick=0;tick<=4;tick++){const val=Math.round(max*tick/4),yy=y(val);add('line',{x1:44,y1:yy,x2:664,y2:yy,stroke:'currentColor','stroke-opacity':'.08'});const label=add('text',{x:37,y:yy+4,'text-anchor':'end',fill:'currentColor','font-size':11});label.textContent=val;}
 obs.forEach((o,i)=>{const point=add('circle',{cx:x(i),cy:y(o.remaining),r:4,fill:'#287fc1'});const title=document.createElementNS(ns,'title');title.textContent=`${o.day}: ${o.remaining} remaining`;point.append(title);if(i===0||i===obs.length-1||i%Math.max(1,Math.ceil(obs.length/5))===0){const label=add('text',{x:x(i),y:226,'text-anchor':'middle',fill:'currentColor','font-size':10});label.textContent=String(o.day||'').slice(5);}});
 burn.append(svg,reportNode('p','muted','Remaining tickets by observation date · Blue: observed · Dashed: ideal'));charts.append(burn,velocity);host.append(charts);
 const timeline=reportNode('section','gs-report-block');timeline.append(reportNode('h3','','Interactive sample timeline'));timeline.append(reportNode('p','muted','Select a ticket to edit its dates, effort and state. Changes affect demo data only.'));
 const dated=work.filter(w=>reportSafeDate(w.startDate)&&reportSafeDate(w.dueDate)),days=dated.flatMap(w=>[reportDay(w.startDate),reportDay(w.dueDate)]),base=Math.min(...days,reportDay(reportToday())),end=Math.max(...days,reportDay(reportToday())+1),span=Math.max(1,end-base);timeline.append(reportTimelineAxis(base,end));
 for(const w of work.slice(0,30)){const row=reportNode('div','gs-timeline-row');const button=reportNode('button','secondary gs-timeline-label',w.id+' '+w.title);button.onclick=()=>demoEditTicket(w.id);row.append(button);const track=reportNode('div','gs-timeline-track');const todayMarker=reportNode('div','gs-today-marker');todayMarker.style.left=((reportDay(reportToday())-base)/span*100)+'%';track.append(todayMarker);if(dated.includes(w)){const bar=reportNode('button','gs-timeline-bar'+(w.state==='Closed'?' gs-timeline-closed':w.state==='Done'?' gs-timeline-done':''));bar.style.left=((reportDay(w.startDate)-base)/span*100)+'%';bar.style.width=Math.max(1.2,(reportDay(w.dueDate)-reportDay(w.startDate)+1)/span*100)+'%';bar.title=w.startDate+' to '+w.dueDate;bar.onclick=()=>demoEditTicket(w.id);track.append(bar);}else track.append(reportNode('small','muted','Unscheduled'));row.append(track);timeline.append(row);}host.append(timeline);
 const editor=reportNode('div','gs-report-block');editor.id='demoTicketEditor';host.append(editor);if(demoSelectedTicket)demoEditTicket(demoSelectedTicket,false);
}
let demoSelectedTicket=null;
function demoEditTicket(id,scroll=true){demoSelectedTicket=id;const w=demoState.work.find(x=>x.id===id),host=$('demoTicketEditor');if(!host||!w)return;host.replaceChildren();host.append(reportNode('h3','',w.id+' · '+w.title));const fields=reportNode('div','gs-timeline-fields'),inputs={};for(const [label,key,type] of [['Start','startDate','date'],['Target','targetDate','date'],['Due','dueDate','date'],['Story points / effort','effort','number']]){const wrapper=reportNode('label','',label),input=document.createElement('input');input.type=type;input.value=w[key]??'';if(type==='number'){input.min='0';input.step='1';}wrapper.append(input);fields.append(wrapper);inputs[key]=input;}const status=reportNode('label','','State'),sel=document.createElement('select');for(const v of ['New','Active','Done','Closed'])sel.add(new Option(v,v));sel.value=w.state;status.append(sel);fields.append(status);host.append(fields);const save=reportNode('button','','Save demo ticket');save.onclick=()=>{for(const key of ['startDate','targetDate','dueDate'])w[key]=inputs[key].value;w.effort=Math.max(0,Number(inputs.effort.value)||0);w.state=sel.value;if(['Closed','Done'].includes(w.state))w.blocked=false;saveDemo();diagnostic('demo.ticket.saved',{ticketId:w.id,state:w.state,blocked:w.blocked,effort:w.effort,hasStart:!!w.startDate,hasDue:!!w.dueDate});renderDemo();};host.append(save);if(scroll)host.scrollIntoView({block:'nearest'});}
function renderDemo(){if(!demoState)return;const m=demoHealth();$('demoStats').textContent=`Sprint health: ${m.label} · ${m.reason} · ${m.count} assigned · ${m.remaining} outstanding · ${demoState.meetings.filter(x=>x.status==='Completed').length} meetings completed`;
 const board=$('demoBoard');board.replaceChildren();for(const lane of ['New','Active','Done','Closed']){const section=document.createElement('section');section.className='panel';section.style.marginBottom='10px';const title=document.createElement('h4');title.textContent=lane;section.append(title);for(const w of demoState.work.filter(x=>x.state===lane)){const card=document.createElement('div');card.className='panel';card.style.margin='7px 0';const name=document.createElement('strong');name.textContent=`${w.id} · ${w.title}`;const info=document.createElement('p');info.className='muted';info.textContent=`${w.project} · ${w.assignee}`;const state=document.createElement('select');state.setAttribute('aria-label',`State for ${w.id}`);for(const value of ['New','Active','Done','Closed'])state.add(new Option(value,value));state.value=w.state;state.onchange=()=>{const previous=w.state;w.state=state.value;if(['Done','Closed'].includes(w.state))w.blocked=false;saveDemo();diagnostic('demo.state.changed',{ticketId:w.id,fromState:previous,toState:w.state});renderDemo();};const block=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=w.blocked;check.onchange=()=>{w.blocked=check.checked;saveDemo();diagnostic('demo.blocker.changed',{ticketId:w.id,blocked:w.blocked});renderDemo();};block.append(check,' Blocked');const included=document.createElement('label');const inc=document.createElement('input');inc.type='checkbox';inc.checked=w.inSprint;inc.onchange=()=>{w.inSprint=inc.checked;saveDemo();diagnostic('demo.membership.changed',{ticketId:w.id,inSprint:w.inSprint});renderDemo();};included.append(inc,' In sprint');const row=document.createElement('div');row.className='row';row.append(state,block,included);card.append(name,info,row);section.append(card);}board.append(section);}
 const meeting=$('demoMeetings');meeting.replaceChildren();for(const record of demoState.meetings){const row=document.createElement('div');row.className='row';row.style.marginBottom='8px';const label=document.createElement('span');label.textContent=record.type;const sel=document.createElement('select');sel.setAttribute('aria-label',record.type+' status');for(const v of ['Proposed','Completed','Postponed','Cancelled'])sel.add(new Option(v,v));sel.value=record.status;sel.onchange=()=>{record.status=sel.value;saveDemo();renderDemo();};row.append(label,sel);meeting.append(row);}
 demoReportRender();
 const decisions=$('demoDecisions');decisions.replaceChildren();for(const d of demoState.decisions){const p=document.createElement('p');p.textContent=d;decisions.append(p);}
}
function setDemoMode(enabled){diagnostic('demo.mode.changed',{enabled});demoActive=enabled;$('demoWorkspace').classList.toggle('hidden',!enabled);document.querySelector('.gs-tabs').classList.toggle('hidden',enabled);document.querySelectorAll('.gs-tab-panel').forEach(el=>el.classList.toggle('demo-hidden',enabled && el.id!=='tab-demo'));document.querySelector('.gs-context').classList.toggle('hidden',enabled);$('demoToggle').classList.toggle('hidden',enabled);if(enabled){if(!demoState){try{demoState=JSON.parse(localStorage.getItem(DEMO_KEY));}catch{}if(!demoState||!Array.isArray(demoState.history)||!Array.isArray(demoState.observations))demoState=demoSeed('risk');} $('demoScenario').value=demoState.kind;renderDemo();}else{document.querySelectorAll('.gs-tab-panel').forEach(el=>el.classList.remove('demo-hidden'));activateTab('demo');} }
$('demoToggle').addEventListener('click',()=>setDemoMode(true));
$('demoExit').addEventListener('click',()=>setDemoMode(false));
$('demoLoad').addEventListener('click',()=>{if(demoState&&demoState.decisions.length&&!confirm('Replace current demo scenario and its changes?'))return;demoState=demoSeed($('demoScenario').value);saveDemo();diagnostic('demo.scenario.loaded',{scenario:demoState.kind,ticketCount:demoState.work.length,observations:demoState.observations.length});renderDemo();notify('Synthetic demo scenario loaded.');});
$('demoReset').addEventListener('click',()=>{if(!confirm('Reset demo scenario to its original state? Production data is unaffected.'))return;demoState=demoSeed(demoState.kind);saveDemo();diagnostic('demo.scenario.reset',{scenario:demoState.kind});renderDemo();notify('Demo reset.');});
$('demoAddDecision').addEventListener('click',()=>{const v=$('demoDecision').value.trim();if(!v)return;demoState.decisions.push(v);$('demoDecision').value='';saveDemo();renderDemo();});


// Microsoft 365 identity is independent of the Azure DevOps identity.
function m365Identity(){
 try{const u=sdk?.getUser?.();const c=sdk?.getWebContext?.();const name=u?.displayName||u?.name||c?.user?.name||'Not available';
 $('m365AdoIdentity').textContent='Azure DevOps user: '+name+' (not necessarily the Microsoft 365 calendar owner).';}
 catch(e){$('m365AdoIdentity').textContent='Azure DevOps identity unavailable: '+String(e.message||e);}
}
const M365_CLIENT_ID='9b4b5cd6-4fb7-4e27-8424-e00abfc7a08e';
// Identity display is refreshed after SDK initialization in init().


// MSAL v4.25.1, official Microsoft browser distribution, loaded on demand as a local UMD script.
// Identity is distinct from Azure DevOps. Calendar discovery is read-only; no events are created.
const M365_SCOPES=['User.Read','Calendars.ReadWrite'];
let m365Client=null,m365Account=null,m365AuthKind='';
function m365ShowAccount(){
 const el=$('m365Status');
 el.textContent=m365Account?`Microsoft 365: Connected as ${m365Account.username||m365Account.name||'account'} (${m365AuthKind}). No Outlook events have been created.`:'Microsoft 365: Not connected. No Graph authorization has been requested.';
 $('m365Disconnect').disabled=!m365Account;renderOutlookPlanningReadiness();
}
async function m365GetClient(){
 if(m365Client)return m365Client;
 // Load the optional Microsoft authentication library only when Connect is selected.
 // Never block the Azure DevOps host readiness handshake on MSAL evaluation.
 if(!window.msal){
  // The bundled MSAL distribution is UMD, not an ES module. Load it as a
  // classic script so it can register window.msal in the Azure DevOps iframe.
  try{
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=new URL('./vendor/msal-browser.min.js',import.meta.url).href;
    script.async=true;
    script.onload=()=>window.msal?resolve():reject(Error('MSAL script loaded but did not register window.msal.'));
    script.onerror=()=>reject(Error('The MSAL script could not be loaded from the extension package.'));
    document.head.appendChild(script);
   });
  }catch(error){throw Error('Microsoft authentication library could not initialize: '+String(error.message||error));}
 }
 const msal=window.msal;
 if(!msal)throw Error('Microsoft authentication library loaded without exposing its API.');
 const cfg={auth:{clientId:M365_CLIENT_ID,authority:'https://login.microsoftonline.com/organizations',redirectUri:'https://dev.azure.com/_public/_MsalPopup'},cache:{cacheLocation:'localStorage'}};
 let instance;
 try{
  await sdk.enableNestedAppAuth();
  instance=await msal.createNestablePublicClientApplication(cfg);
  m365AuthKind='NAA';
 }catch(naaError){
  diagnostic('m365.naa.unavailable',{message:String(naaError.message||naaError)},'warn');
  instance=await msal.createStandardPublicClientApplication(cfg);
  m365AuthKind='MSAL popup fallback';
 }
 m365Client=instance;
 return instance;
}
// Restore an existing MSAL account without opening a login prompt. This runs only
// after Azure DevOps has acknowledged hub readiness, and never blocks startup.
async function m365RestoreSession(){
 if(m365Account)return;
 try{
  const client=await m365GetClient();
  const accounts=await Promise.resolve(client.getAllAccounts?.()||[]);
  if(!accounts.length){m365ShowAccount();return;}
  const active=client.getActiveAccount?.();
  const account=active&&accounts.some(a=>a.homeAccountId===active.homeAccountId)?active:accounts[0];
  // Validate the cached session silently. Never display a connected status on
  // the strength of a stale account record alone.
  await client.acquireTokenSilent({account,scopes:['User.Read']});
  m365Account=account;m365CalendarsVerified=false;
  m365RestoreCalendarCache();
  client.setActiveAccount?.(account);
  m365ShowAccount();void peopleLookupRestore();m365RenderCalendars('Microsoft 365 session restored. Refreshing Outlook calendars…');
  // The MSAL account and the Graph calendar list have separate lifecycles.
  // Restore the calendar list after silent account validation, without a popup.
  void m365RefreshCalendars({silent:true});
  diagnostic('m365.session.restored',{account:account.username||'account'});
 }catch(e){
  // Silent renewal can require interaction, or the browser may have cleared its
  // session cache. Neither condition should break the ADO hub.
  peopleLookupEnabled=false;++peopleLookupSerial;peopleLookupSetUI();m365Account=null;
  m365ShowAccount();m365RenderCalendars('Microsoft 365 session could not be restored silently. Select Connect Microsoft 365 to sign in again.');
  diagnostic('m365.session.restore_unavailable',{message:String(e.message||e)},'warn');
 }
}
async function m365Connect(){
 const btn=$('m365Connect');btn.disabled=true;btn.textContent='Connecting…';
 try{
  const client=await m365GetClient();
  // Always let the user choose an account on an explicit Connect action.
  const response=await client.loginPopup({scopes:M365_SCOPES,prompt:'select_account'});
  if(!response?.account)throw Error('Microsoft sign-in did not return an account.');
  m365Account=response.account;m365CalendarsVerified=false;m365RestoreCalendarCache();client.setActiveAccount?.(m365Account);
  m365ShowAccount();void peopleLookupRestore();m365RenderCalendars();notify('Microsoft 365 connected as '+(m365Account.username||m365Account.name)+'.');
 }catch(e){
  const message=String(e.message||e);diagnostic('m365.signin.failed',{message},'warn');
  $('m365Status').textContent='Microsoft 365 connection unsuccessful: '+message;
  notify('Microsoft 365 sign-in unsuccessful. See Configuration for details.',true);
 }finally{btn.disabled=false;btn.textContent='Connect Microsoft 365';}
}
async function m365Disconnect(){
 if(!m365Account)return;
 const btn=$('m365Disconnect');btn.disabled=true;
 try{
  // Clear the application account and its cached tokens; avoid signing the user out of Microsoft 365 globally.
  await m365Client.clearCache({account:m365Account});
  peopleLookupEnabled=false;++peopleLookupSerial;peopleLookupSetUI('Recipient suggestions unavailable while disconnected.');m365Account=null;m365Calendars=[];m365ShowAccount();m365RenderCalendars();notify('Global Sprints Microsoft 365 connection cleared.');
 }catch(e){$('m365Status').textContent='Disconnect failed: '+String(e.message||e);notify('Disconnect failed. See Configuration.',true);}
 finally{btn.disabled=!m365Account;}
}
// Calendar selection belongs to the connected user, not the organization-wide sprint registry.
// Never store access tokens or write Outlook events during calendar discovery.
let m365Calendars=[],m365CalendarsVerified=false;
const M365_CALENDAR_PREF='pnpc-gs-calendar-selection-v1';
const M365_CALENDAR_CACHE='pnpc-gs-calendar-list-v1';
function m365RestoreCalendarCache(){
 if(!m365Account)return;
 try{const raw=localStorage.getItem(M365_CALENDAR_CACHE+':'+m365CalendarPreferenceKey());const data=JSON.parse(raw||'null');
  if(data&&Array.isArray(data.calendars)&&data.calendars.every(x=>typeof x.id==='string'&&typeof x.name==='string'))m365Calendars=data.calendars;
 }catch(e){diagnostic('m365.calendar_cache_unavailable',{message:String(e.message||e)},'warn');}
}
function m365SaveCalendarCache(){
 try{localStorage.setItem(M365_CALENDAR_CACHE+':'+m365CalendarPreferenceKey(),JSON.stringify({calendars:m365Calendars,at:new Date().toISOString()}));}catch(e){diagnostic('m365.calendar_cache_write_failed',{message:String(e.message||e)},'warn');}
}

function m365CalendarPreferenceKey(){
 if(!m365Account)return '';
 const org=String(context?.account?.name||context?.collection?.name||location.hostname||'ado');
 const account=String(m365Account.homeAccountId||m365Account.username||'').toLowerCase();
 return M365_CALENDAR_PREF+':'+org+':'+account;
}
function m365ReadCalendarPreference(){
 try{return localStorage.getItem(m365CalendarPreferenceKey())||'';}catch{return '';}
}
function m365RenderCalendars(message=''){
 const picker=$('m365CalendarPicker'),refresh=$('m365RefreshCalendars'),save=$('m365SaveCalendar'),status=$('m365CalendarStatus');
 if(!picker||!refresh||!save||!status)return;
 picker.replaceChildren(new Option('Select an Outlook calendar',''));
 for(const cal of m365Calendars)picker.add(new Option(cal.name+(cal.isDefaultCalendar?' (default)':'')+(cal.canEdit===false?' (read-only)':''),cal.id));
 const pref=m365ReadCalendarPreference();
 picker.value=m365Calendars.some(c=>c.id===pref)?pref:'';
 const connected=!!m365Account;
 picker.disabled=!connected||!m365Calendars.length;
 refresh.disabled=!connected;
 save.disabled=!connected||!m365Calendars.length;
 status.textContent=message||(connected?(m365Calendars.length?`${m365Calendars.length} calendar(s) available. ${picker.value?'A calendar is selected.':'Choose a calendar and save your preference.'} No events have been created.`:'Select Refresh calendars to discover calendars for this account.'):'Connect Microsoft 365 to discover Outlook calendars.');renderOutlookPlanningReadiness();
}
async function m365GraphToken({silent=false}={}){
 if(!m365Client||!m365Account)throw Error('Connect Microsoft 365 first.');
 const request={account:m365Account,scopes:['Calendars.ReadWrite']};
 try{return (await m365Client.acquireTokenSilent(request)).accessToken;}
 catch(e){
  // A Graph consent or interaction-required response must be handled by MSAL, not hidden.
  if(!/interaction_required|consent_required|login_required|no_tokens_found|token_refresh_required/i.test(String(e.errorCode||'')+' '+String(e.message||e)))throw e;
  if(silent)throw Error('Calendar authorization needs renewed interaction. Select Refresh calendars to continue.');
  return (await m365Client.acquireTokenPopup(request)).accessToken;
 }
}
async function m365RefreshCalendars({silent=false}={}){
 const btn=$('m365RefreshCalendars');btn.disabled=true;btn.textContent='Loading calendars…';
 $('m365CalendarStatus').textContent='Requesting your calendars from Microsoft Graph…';
 try{
  const accountAtStart=m365Account;
  const token=await m365GraphToken({silent});
  let url='https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isDefaultCalendar,canEdit&$top=100';
  const calendars=[];
  for(let page=0;url&&page<10;page++){
   const response=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
   if(!response.ok)throw serviceHttpError('Microsoft Graph',response.status);
   const body=await response.json();
   if(!Array.isArray(body.value))throw Error('Microsoft Graph returned an unexpected calendar response.');
   calendars.push(...body.value.filter(c=>typeof c.id==='string'&&typeof c.name==='string'));
   const next=body['@odata.nextLink'];
   if(next&&!next.startsWith('https://graph.microsoft.com/'))throw Error('Unexpected Microsoft Graph pagination URL.');
   url=next||'';
  }
  if(m365Account!==accountAtStart)return; // Ignore a response after account change or disconnect.
  m365Calendars=calendars;m365CalendarsVerified=true;m365SaveCalendarCache();
  m365RenderCalendars(`${calendars.length} Outlook calendar(s) retrieved. ${m365ReadCalendarPreference()?'Saved preference restored when available.':'Choose a calendar and save your preference.'} No events have been created.`);
  if(!silent)notify(`${calendars.length} Outlook calendar(s) retrieved.`);
 }catch(e){m365RenderCalendars('Calendar discovery failed: '+String(e.message||e));diagnostic('m365.calendars.failed',{message:String(e.message||e)},'warn');if(!silent)notify('Unable to retrieve Outlook calendars. See Configuration.',true);}
 finally{btn.disabled=!m365Account;btn.textContent='Refresh calendars';}
}
function m365SaveCalendar(){
 const id=$('m365CalendarPicker').value;
 if(!m365Account||!m365Calendars.some(c=>c.id===id)){notify('Choose a calendar from the retrieved list.',true);return;}
 try{localStorage.setItem(m365CalendarPreferenceKey(),id);renderOutlookPlanningReadiness();m365RenderCalendars('Default calendar preference saved for this Microsoft 365 account in this browser. No Outlook events have been created.');notify('Outlook calendar preference saved.');}
 catch(e){notify('Unable to save calendar preference: '+String(e.message||e),true);}
}
$('m365RefreshCalendars')?.addEventListener('click',()=>void m365RefreshCalendars());
$('m365SaveCalendar')?.addEventListener('click',m365SaveCalendar);
$('m365CalendarPicker')?.addEventListener('change',()=>{$('m365CalendarStatus').textContent='Selection changed. Save calendar to retain this preference.';});

$('m365Connect').addEventListener('click',()=>void m365Connect());
$('m365Disconnect').addEventListener('click',()=>void m365Disconnect());
m365ShowAccount();
m365RenderCalendars();

for(const [id,op] of [['licenseRoomCheck','entitlement'],['licenseRoomTrial','trial'],['licenseRoomActivate','activate']]){
 if($(id))$(id).addEventListener('click',()=>void checkRoom(op));
}

init();

// Install static action help after all module initialization.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installActionHelp,{once:true});else installActionHelp();
