// v1.0.40 features share the existing Azure DevOps module scope.
// This file is inserted into the application module by build.py, before init().
let gs40BulkCancelBusy=false;
const gs40PackageLimit=150;

async function gs40EnrichBrowseParents(found,sequence){
 // Source WIQL is a recency window, not a complete hierarchy. Recover just
 // missing ancestor context so the search tree has real User Story/PBI parents.
 const byId=new Map(found.map(w=>[Number(w.id),w]));
 let frontier=found.filter(w=>w.parentId&&!byId.has(Number(w.parentId)));let recovered=0;
 const permitted=new Set(projects.filter(p=>workspaceProjectIds().includes(p.id)).map(p=>p.name));
 for(let depth=0;depth<3&&frontier.length&&recovered<50;depth++){
  const ids=[...new Set(frontier.map(w=>Number(w.parentId)).filter(id=>id&&!byId.has(id)))].slice(0,50-recovered);
  if(!ids.length)break;
  const next=[];
  for(let offset=0;offset<ids.length;offset+=6){
   const batch=ids.slice(offset,offset+6);
   const records=await Promise.allSettled(batch.map(id=>api(`/_apis/wit/workitems/${id}?$expand=Relations&api-version=7.1`)));
   if(sequence!==browserSequence)return found;
   for(const r of records){if(r.status!=='fulfilled')continue;
    const item=normalizeItem(r.value);if(!permitted.has(item.project)||byId.has(Number(item.id)))continue;
    item.parentId=GS40Core.relationIds(r.value,'System.LinkTypes.Hierarchy-Reverse')[0]||null;
    item.contextOnly=true;byId.set(Number(item.id),item);next.push(item);recovered++;
   }
  }
  frontier=next.filter(w=>w.parentId&&!byId.has(Number(w.parentId)));
 }
 return [...byId.values()];
}
async function gs40FetchPackage(rootId){
 const resolved=new Map(),visited=new Set(),stack=[{id:Number(rootId),parentId:null,depth:0}];
 const allowedProjects=new Set(projects.filter(p=>workspaceProjectIds().includes(p.id)).map(p=>p.name));
 let excluded=0;
 while(stack.length){
  if(resolved.size>=gs40PackageLimit)throw Error('Work package exceeds 150 work items. Narrow the selection before adding it.');
  const node=stack.shift();if(visited.has(node.id))continue;visited.add(node.id);
  const source=await api(`/_apis/wit/workitems/${node.id}?$expand=Relations&api-version=7.1`);
  const item=normalizeItem(source);item.parentId=node.parentId??GS40Core.relationIds(source,'System.LinkTypes.Hierarchy-Reverse')[0]??null;
  if(!allowedProjects.has(item.project)){excluded++;continue;}
  resolved.set(item.id,item);
  if(node.depth<12)for(const childId of GS40Core.relationIds(source,'System.LinkTypes.Hierarchy-Forward')){
   if(!visited.has(childId))stack.push({id:childId,parentId:item.id,depth:node.depth+1});
  }
 }
 return {items:[...resolved.values()],excluded};
}
// Work packages must be previewed before any membership changes. See gs41-runtime.js.
async function gs40AddWorkPackage(id){return gs41OpenPackagePreview(id);}
function gs40AppendCardChildren(card,item){
 const sprint=currentSprint();if(!sprint)return;
 const members=new Set((sprint.itemIds||[]).map(Number));
 const children=assignedItems.filter(w=>Number(w.parentId)===Number(item.id)&&members.has(Number(w.id)));
 if(children.length){
  const detail=document.createElement('details');detail.className='gs40-child-summary gs41-child-work';detail.open=true;
  const heading=document.createElement('summary');heading.textContent=`Work package · ${children.length} direct child item(s)`;
  detail.append(heading);
  for(const kid of children){
   const line=document.createElement('div');line.className='gs41-child-line';
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=`↳ #${kid.id} ${kid.title}`;
   button.onclick=()=>void openBoardItemDetail(kid);
   const state=document.createElement('small');state.textContent=`${kid.type} · ${kid.state} · ${kid.assignee||'Unassigned'}`;
   line.append(button,state);detail.append(line);
  }
  const footer=document.createElement('small');footer.className='muted';footer.textContent='Children keep their own ADO state, assignee and Board card.';detail.append(footer);
  card.append(detail);
 }else if(item.parentId){
  const parent=assignedItems.find(w=>Number(w.id)===Number(item.parentId))||ancestorItems.find(w=>Number(w.id)===Number(item.parentId));
  const context=document.createElement('small');context.className='gs41-parent-context';
  context.textContent=parent?`↳ Child of #${parent.id} · ${parent.title}`:`↳ Child of #${item.parentId}`;
  card.append(context);
 }
}
function gs40RenderReportDrilldown(host,work){
 const section=reportNode('section','gs-report-block');section.append(reportNode('h3','','Work packages · hierarchy and estimates'));
 section.append(reportNode('p','muted','Parent commitment estimates count once. Child task remaining work is shown independently where available. Select any item to inspect its Azure DevOps record.'));
 const rows=GS40Core.commitmentRows(work),points=rows.reduce((n,w)=>n+w.commitmentEffort,0),taskHours=work.filter(GS40Core.isTask).reduce((n,w)=>n+(Number(w.remainingWork)||0),0);
 section.append(reportNode('p','gs-health-note',`${points} committed points / effort · ${work.filter(GS40Core.isTask).length} task(s) · ${taskHours} remaining task-hours (where reported)`));
 const sprint=currentSprint(),shared=(sprint?.itemIds||[]).filter(id=>(registry?.sprints||[]).some(other=>other.id!==sprint.id&&other.workspaceId===sprint.workspaceId&&(other.itemIds||[]).some(otherId=>Number(otherId)===Number(id)))&&[...items,...assignedItems].some(w=>Number(w.id)===Number(id)&&GS40Core.isContext(w)&&GS40Core.metric(w)>0));
 if(shared.length)section.append(reportNode('p','gs-health-note',`${shared.length} shared Feature-level estimate(s) are excluded from this sprint's live total until effort is allocated to sprint-specific work items. This avoids counting a multi-sprint Feature repeatedly.`));
 const search=document.createElement('input');search.className='gs40-report-filter';search.type='search';search.placeholder='Filter by work item or project';search.setAttribute('aria-label','Filter work package drilldown');
 section.append(search);const list=reportNode('div','gs40-package-list');section.append(list);
 const render=()=>{list.replaceChildren();const q=search.value.trim().toLowerCase();const byId=new Map(work.map(w=>[Number(w.id),w]));
  const roots=work.filter(w=>!byId.has(Number(w.parentId)));
  for(const parent of roots){const family=GS40Core.packageGraph(work,parent.id);if(q&&!family.some(w=>`${w.id} ${w.title} ${w.project}`.toLowerCase().includes(q)))continue;
   const node=document.createElement('details');node.className='gs40-report-group';node.open=!!q||roots.length<5;
   const summary=document.createElement('summary');const weight=GS40Core.commitmentRows(family).reduce((n,w)=>n+w.commitmentEffort,0);
   summary.textContent=`#${parent.id} · ${parent.title} · ${weight} commitment points · ${family.length} work item(s)`;node.append(summary);
   for(const item of family){const line=reportNode('div','row');line.style.paddingLeft=(item.id===parent.id?0:20)+'px';
    const action=document.createElement('button');action.className='secondary';action.textContent='#'+item.id+' · '+item.title;
    action.onclick=()=>openBoardItemDetail(item);
    line.append(action,reportNode('small','muted',`${item.type} · ${item.state} · ${item.assignee}`));node.append(line);
   }list.append(node);
  }
  if(!list.children.length)list.append(reportNode('p','muted','No work packages match the filter.'));
 };search.addEventListener('input',render);render();host.append(section);
}
function gs40ScheduleCandidates(sc){return GS43Schedules.currentCandidates(GS40Core.cancellationCandidates([sc]),{meetingSchedules:[sc]},gs43Today());}
async function gs40CancelMeetingTargets(candidates,workspaceId){
 let cancelled=0;const failures=[];
 for(const candidate of candidates){const workspace=registry.workspaces.find(x=>x.id===workspaceId);
  const record=workspace?.meetingSchedules?.find(x=>x.id===candidate.scheduleId)?.meetings?.find(x=>x.id===candidate.meetingId);
  if(!record) {failures.push('#'+candidate.meetingId+' missing');break;}
  if(['finished','cancelled'].includes(GS43Schedules.outcome(record,gs43Today())))continue;
  if(candidate.state==='unresolved'){failures.push((record.title||record.type||candidate.meetingId)+' needs Outlook reconciliation');break;}
  if(candidate.state==='booked'){
   const success=await outlookCancelCeremony(candidate.meetingId,candidate.scheduleId,{bulk:true});
   if(!success){failures.push((record.title||record.type||candidate.meetingId)+' could not be confirmed cancelled');break;}
   cancelled++;
  }else if(candidate.state==='internal'){
   const ok=await persist(r=>{const target=outlookTarget(r,candidate.meetingId,candidate.scheduleId,workspaceId,currentSprint()?.id);
    if(!target||target.outlook?.state)throw Error('Meeting changed during cancellation');target.status='Cancelled';target.updatedAt=new Date().toISOString();
   },false);
   if(!ok){failures.push('Could not save internal cancellation for '+candidate.meetingId);break;}cancelled++;
  }
 }
 return {cancelled,failures};
}
async function gs40ClearSchedule(scheduleId,{confirmed=false}={}){
 if(gs40BulkCancelBusy)return notify('A bulk meeting operation is already running.',true);
 const w=activeScheduleWorkspace(),sc=w?.meetingSchedules?.find(x=>x.id===scheduleId);
 if(!sc)return notify('Schedule not found.',true);
 if(sc.lifecycle!=='Committed')return notify('Clear All Meetings is available for committed schedules only.',true);
 const targets=gs40ScheduleCandidates(sc);
 if(!targets.length)return notify('No active meeting records remain in this committed schedule.');
 if(!confirmed&&!confirm(`Clear ALL ${targets.length} remaining meeting(s) from "${sc.name}"? This cancels organizer-owned Outlook events and notifies attendees. The schedule and cancellation history are retained. This cannot be undone.`))return;
 gs40BulkCancelBusy=true;
 try{
  const result=await gs40CancelMeetingTargets(targets,w.id);
  if(result.failures.length)return notify(`${result.cancelled} meeting(s) cancelled; stopped with ${result.failures.length} unresolved: ${result.failures.join('; ')}. Reconcile before retrying.`,true);
  diagnostic('m365.bulk_schedule_cancelled',{scheduleId,count:result.cancelled});
  notify(`${result.cancelled} meeting(s) cancelled, including Outlook invitations. The committed schedule remains in history.`);
 }finally{gs40BulkCancelBusy=false;renderWorkspaceSchedules();renderCeremonies();}
}
async function gs40ClearSprintMeetings(){
 if(gs40BulkCancelBusy)return notify('A bulk meeting cancellation is already running.',true);
 const sprint=currentSprint(),workspace=activeScheduleWorkspace();
 if(!sprint||!workspace)return notify('Select a sprint and workspace first.',true);
 const included=[];const unsafe=[];
 for(const sc of workspace.meetingSchedules||[]){if(sc.lifecycle!=='Committed')continue;
  for(const meeting of sc.meetings||[]){
   const scoped=meeting.sprintId===sprint.id||(!meeting.sprintId&&meeting.date>=sprint.start&&meeting.date<=sprint.end);
   if(!scoped||['finished','cancelled'].includes(GS43Schedules.outcome(meeting,gs43Today())))continue;
   const end=meeting.repeatEnd||meeting.recurrenceEnd||'';
   if(end&&sprint.end&&end>sprint.end){unsafe.push(meeting.title||meeting.type||meeting.id);continue;}
   if(meeting.outlook?.state==='cancelled'||meeting.status==='Cancelled'||meeting.status==='Completed')continue;
   included.push({scheduleId:sc.id,meetingId:meeting.id,state:meeting.outlook?.state==='booked'?'booked':meeting.outlook?.state?'unresolved':'internal'});
  }
 }
 // Older sprint-native ceremonies can be cancelled individually. Bulk operations
 // must not guess the origin or identity of a saved Outlook meeting.
 const native=(sprint.ceremonies||[]).filter(m=>m.outlook?.state&&m.outlook?.state!=='cancelled');
 if(unsafe.length||native.length)return notify(`Sprint cancellation needs manual reconciliation: ${unsafe.length} series span beyond the sprint end, ${native.length} legacy sprint bookings. Use the existing per-event cancellation or the explicit schedule-wide action. Nothing was cancelled.`,true);
 if(!included.length)return notify('No active committed meetings belong to this sprint.');
 if(!confirm(`Cancel ${included.length} committed meeting(s) belonging to "${sprint.name}"? Outlook will notify attendees. Other sprints and workspace schedules will not be cleared.`))return;
 gs40BulkCancelBusy=true;
 try{const result=await gs40CancelMeetingTargets(included,workspace.id);
  if(result.failures.length)notify(`Cancelled ${result.cancelled}; ${result.failures.length} unresolved: ${result.failures.join('; ')}. Reconcile and retry.`,true);
  else notify(`${result.cancelled} meeting(s) cancelled for ${sprint.name}. Other sprint meetings were preserved.`);
 }finally{gs40BulkCancelBusy=false;renderWorkspaceSchedules();renderCeremonies();}
}
async function gs40CloseWorkspace(){
 const w=activeWorkspace();if(!w)return notify('Select a workspace.',true);
 // Even the original default workspace can close; replacement workspace is created atomically below.
 if(gs40BulkCancelBusy)return notify('Another bulk meeting cancellation is running.',true);
 const schedules=w.meetingSchedules||[];
 const targets=GS43Schedules.currentCandidates(GS40Core.cancellationCandidates(schedules),w,gs43Today());
 const legacy=registry.sprints.filter(sp=>sp.workspaceId===w.id).flatMap(sp=>(sp.ceremonies||[]).filter(m=>!['finished','cancelled'].includes(GS43Schedules.outcome(m,gs43Today()))&&(m.outlook?.state==='booked'||['pending','cancel-pending','sync-pending'].includes(m.outlook?.state))).map(m=>({sp,m})));
 if(!confirm(`Close out "${w.name}"? ${targets.length} workspace meeting record(s) and ${legacy.length} legacy sprint booking(s) must be cancelled or reconciled first. Future Outlook invitations will be cancelled, attendees notified, and the workspace archived. All sprint history stays intact; restoration requires new planning.`))return;
 if(legacy.length)return notify('Closeout is blocked by legacy sprint ceremony bookings. Cancel or reconcile these individually before closing the workspace. No workspace data was changed.',true);
 gs40BulkCancelBusy=true;
 try{
  const result=await gs40CancelMeetingTargets(targets,w.id);
  if(result.failures.length)return notify(`Closeout stopped after ${result.cancelled} cancellation(s). Resolve: ${result.failures.join('; ')}. Workspace remains active.`,true);
  const fresh=registry.workspaces.find(x=>x.id===w.id);
  const unresolved=GS43Schedules.currentCandidates(GS40Core.cancellationCandidates(fresh.meetingSchedules||[]),fresh,gs43Today()).filter(x=>x.state!=='internal');
  if(unresolved.length)return notify('Closeout blocked: some Outlook cancellations have not been confirmed.',true);
  const closedAt=new Date().toISOString();
  const replacementId=w.id===DEFAULT_WORKSPACE_ID?crypto.randomUUID():DEFAULT_WORKSPACE_ID;
  const ok=await persist(r=>{const ws=r.workspaces.find(x=>x.id===w.id);if(!ws||ws.archived)throw Error('Workspace was changed elsewhere.');
   const pending=GS43Schedules.currentCandidates(GS40Core.cancellationCandidates(ws.meetingSchedules||[]),ws,gs43Today()).filter(x=>x.state!=='internal');
   if(pending.length)throw Error('Unresolved Outlook meetings prevent closeout.');
   for(const sp of r.sprints||[])if(sp.workspaceId===w.id)for(const meeting of sp.ceremonies||[]){
    if(['finished','cancelled'].includes(GS43Schedules.outcome(meeting,gs43Today())))continue;
    if(meeting.outlook?.state&&meeting.outlook.state!=='cancelled')throw Error('Legacy sprint Outlook booking remains unresolved.');
    if(meeting.status!=='Completed')meeting.status='Cancelled';
   }
   for(const sc of ws.meetingSchedules||[])if(sc.lifecycle==='Committed'){
    sc.lifecycle='Retired';sc.retiredAt=closedAt;sc.retirementReason='Workspace closeout';
   }
   ws.archived=true;ws.closedOutAt=closedAt;ws.archivedAt=closedAt;ws.planningRequired=true;
   ws.closedSprintIds=(r.sprints||[]).filter(sp=>sp.workspaceId===w.id).map(sp=>sp.id);
   if(w.id===DEFAULT_WORKSPACE_ID)r.workspaces.push({id:replacementId,name:'New Workspace',description:'New planning cycle after default workspace closeout',projectIds:[...ws.projectIds],createdAt:closedAt,planningRequired:true});
  },false);
  if(ok){activeWorkspaceId=replacementId;renderWorkspacePicker();syncWorkspaceProjects();renderSprintPicker('');clearWorkspaceViews();rememberContext();
   notify('Workspace closed and archived. Historical records are preserved; restoring requires a new planning cycle.');
  }
 }catch(error){notify('Workspace closeout failed: '+String(error.message||error),true);}
 finally{gs40BulkCancelBusy=false;renderWorkspaceSchedules();}
}
function gs42CloseoutFeedback(message='',error=false){
 const node=$('gs42CloseoutFeedback');if(!node)return;
 node.textContent=message;node.classList.toggle('error',!!error);
}
function gs40ReadRetro(){const sprint=currentSprint(),retro=sprint?.retrospective;
 const status=$('gs40RetroStatus');if(!status)return;
 gs42CloseoutFeedback();
 for(const [id,key] of [['gs40RetroWell','wentWell'],['gs40RetroImprove','improve'],['gs40RetroLessons','lessons']])$(id).value=retro?.[key]||'';
 $('gs40RetroActions').value=(retro?.actions||[]).map(x=>[x.title,x.owner,x.due].join(' | ')).join('\n');
 const finalized=!!retro?.finalizedAt;
 for(const id of ['gs40RetroWell','gs40RetroImprove','gs40RetroLessons','gs40RetroActions'])$(id).disabled=!sprint||finalized;
 $('gs40RetroSave').disabled=!sprint||finalized;$('gs40RetroFinalize').disabled=!sprint||finalized;
 $('gs40RetroReopen').classList.toggle('hidden',!finalized);
 status.textContent=!sprint?'Select a sprint':finalized?'Finalized '+new Date(retro.finalizedAt).toLocaleDateString():'Draft · '+sprint.name;
 $('gs40RetroHistory').textContent=(sprint?.retrospectiveHistory||[]).length+' finalized historical version(s) retained.';
}
async function gs40SaveRetro(finalize){const sprint=currentSprint();if(!sprint)return gs42CloseoutFeedback('Select a sprint.',true);
 if(sprint.retrospective?.finalizedAt)return gs42CloseoutFeedback('These notes are finalized. Reopen them to create a tracked revision.',true);
 if(finalize&&!confirm('Finalize these Sprint Closeout Notes? This preserves an immutable history version and locks editing until reopened.'))return;
 const rows=$('gs40RetroActions').value.split(/\n/).filter(x=>x.trim()).map(x=>{const bits=x.split('|');return {title:(bits[0]||'').trim(),owner:(bits[1]||'').trim(),due:(bits[2]||'').trim()};});
 if(rows.some(x=>x.due&&!/^\d{4}-\d{2}-\d{2}$/.test(x.due)))return gs42CloseoutFeedback('Use YYYY-MM-DD for action due dates.',true);
 const clean=GS40Core.validateRetrospective({wentWell:$('gs40RetroWell').value,improve:$('gs40RetroImprove').value,lessons:$('gs40RetroLessons').value,actions:rows});
 gs42CloseoutFeedback('Saving closeout notes…');
 const now=new Date().toISOString();const ok=await persist(r=>{const sp=r.sprints.find(x=>x.id===sprint.id);if(!sp)throw Error('Sprint was removed.');
  const updated={...clean,updatedAt:now,finalizedAt:finalize?now:null};sp.retrospective=updated;
  if(finalize){sp.retrospectiveHistory||=[];sp.retrospectiveHistory.push(JSON.parse(JSON.stringify(updated)));}
 },false,false,gs42CloseoutFeedback);
 if(ok){gs40ReadRetro();gs42CloseoutFeedback(finalize?'Closeout notes finalized and saved to sprint history.':'Closeout notes draft saved.');}
}
async function gs40ReopenRetro(){const sp=currentSprint();if(!sp?.retrospective?.finalizedAt)return;
 if(!confirm('Reopen these Sprint Closeout Notes for a tracked revision? Earlier finalized history will remain unchanged.'))return;
 const ok=await persist(r=>{const record=r.sprints.find(x=>x.id===sp.id);record.retrospective={...record.retrospective,finalizedAt:null,updatedAt:new Date().toISOString()};},false,false,gs42CloseoutFeedback);
 if(ok){gs40ReadRetro();gs42CloseoutFeedback('Closeout notes reopened. Earlier finalized versions are preserved.');}
}
$('gs40RetroSave')?.addEventListener('click',()=>void gs40SaveRetro(false));
$('gs40RetroFinalize')?.addEventListener('click',()=>void gs40SaveRetro(true));
$('gs40RetroReopen')?.addEventListener('click',()=>void gs40ReopenRetro());
$('sprintPicker')?.addEventListener('change',()=>queueMicrotask(gs40ReadRetro));
$('workspacePicker')?.addEventListener('change',()=>queueMicrotask(gs40ReadRetro));
// Scheduling already changes sprint context programmatically; refresh the panel on focus.
// Sprint change and startup restore render this panel; do not overwrite in-progress drafts on focus.

$('gs40ClearSprintMeetings')?.addEventListener('click',()=>void gs40ClearSprintMeetings());
