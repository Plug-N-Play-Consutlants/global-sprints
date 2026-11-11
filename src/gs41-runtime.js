/* v1.0.41: explicit work-package preview, consent and atomic membership update.
   This module runs in the original app's Azure DevOps module scope. */
let gs41PreviewBusy=false;
function gs41SelectionPlan(pack,sprint){
 const root=pack.items[0];
 const existing=new Set((sprint.itemIds||[]).map(Number));
 const owners=new Map();
 for(const sp of registry.sprints||[]){
  if(sp.id===sprint.id||['Closed','Completed'].includes(sp.status))continue;
  for(const id of sp.itemIds||[])if(!owners.has(Number(id)))owners.set(Number(id),sp.name||'another sprint');
 }
 return pack.items.map((item,index)=>{
  const already=existing.has(Number(item.id));
  const otherSprint=owners.get(Number(item.id))||'';
  // Cross-sprint membership is permitted; only duplicate membership in THIS sprint is prevented.
  const conflict=otherSprint;
  const otherIteration=index>0&&!!root.iterationPath&&!!item.iterationPath&&root.iterationPath!==item.iterationPath;
  const depth=(()=>{let level=0,node=item,seen=new Set();const byId=new Map(pack.items.map(w=>[Number(w.id),w]));
   while(Number(node.id)!==Number(root.id)&&node.parentId&&byId.has(Number(node.parentId))&&!seen.has(Number(node.id))){seen.add(Number(node.id));node=byId.get(Number(node.parentId));level++;if(level>12)break;}
   return level;
  })();
  return {item,depth,already,conflict,otherIteration,selectable:!already,selected:!already&&!otherIteration};
 });
}
async function gs41CommitWorkPackage(pack,selectedIds,sprintId){
 const sprint=registry.sprints.find(sp=>sp.id===sprintId);
 if(!sprint||currentSprint()?.id!==sprintId)throw Error('The active sprint changed; reopen the work package.');
 const selected=new Set([...selectedIds].map(Number));
 const plan=gs41SelectionPlan(pack,sprint);
 for(const id of selected){const row=plan.find(x=>Number(x.item.id)===id);
  if(!row||(!row.selectable&&!row.already))throw Error('A selected work item is no longer eligible for this sprint. Refresh the preview.');
 }
 const ids=[...selected].filter(id=>!(sprint.itemIds||[]).some(current=>Number(current)===id));
 if(!ids.length)return 0;
 const ok=await persist(r=>{
  const target=r.sprints.find(sp=>sp.id===sprintId);
  if(!target)throw Error('Sprint no longer exists.');
  // A work item may be included in multiple sprints/workspaces. This does not change native ADO iterations.
  const permitted=new Set(projects.filter(p=>workspaceProjectIds().includes(p.id)).map(p=>p.name));
  for(const id of ids)if(!permitted.has(plan.find(x=>Number(x.item.id)===id)?.item.project))throw Error('Selected item is outside the workspace project scope.');
  target.itemIds=[...new Set([...(target.itemIds||[]).map(Number),...ids])];
 },false);
 if(!ok)throw Error('Sprint membership could not be saved; please retry.');
 const multiSprintCount=ids.filter(id=>(registry.sprints||[]).some(sp=>sp.id!==sprintId&&(sp.itemIds||[]).some(x=>Number(x)===id))).length;
 diagnostic('sprint.membership.package_added',{count:ids.length,otherSprintCount:multiSprintCount,operation:'save'});
 for(const item of pack.items){
  const index=browserItems.findIndex(x=>Number(x.id)===Number(item.id));
  if(index<0)browserItems.push(item);else browserItems[index]=item;
  browserSelection.delete(item.id);
 }
 await loadAssignedItems();
 renderBrowser();renderBacklog();renderSuggestions();renderBoard();updateBulkToolbar();
 return ids.length;
}
async function gs41OpenPackagePreview(rootId){
 const sprint=currentSprint();
 if(!sprint||gs41PreviewBusy||bulkBusy)return notify('Select a sprint before previewing work packages.',true);
 if(!(await guardSprint()))return;
 gs41PreviewBusy=true;let opened=false,dialogNode=null;
 try{
  const pack=await gs40FetchPackage(rootId);
  if(!pack.items.length)return notify('No accessible work items found for this package.',true);
  const plan=gs41SelectionPlan(pack,sprint);
  const dialog=document.createElement('dialog');dialogNode=dialog;dialog.className='gs41-package-dialog';
  dialog.setAttribute('aria-label','Review work package');
  const head=document.createElement('h2');head.textContent=`#${plan[0].item.id} · ${plan[0].item.title}`;
  const intro=document.createElement('p');intro.className='muted';intro.textContent=`${plan.length} linked work item(s) found from Azure DevOps. Review the hierarchy and choose exactly what to add to ${sprint.name}. Existing work-item states, parent links and native iterations will not be changed.`;
  const summary=document.createElement('p');summary.className='gs41-package-status';summary.setAttribute('role','status');
  const list=document.createElement('div');list.className='gs41-package-tree';
  const choices=[];
  for(const row of plan){
   const line=document.createElement('label');line.className='gs41-package-entry';
   line.style.paddingLeft=(10+row.depth*22)+'px';
   const check=document.createElement('input');check.type='checkbox';check.checked=row.selected;check.disabled=!row.selectable;
   const content=document.createElement('span');content.className='gs41-package-description';
   const name=document.createElement('strong');name.textContent=`${row.depth?'↳ ':''}#${row.item.id} · ${row.item.title}`;
   const meta=document.createElement('small');meta.textContent=`${row.item.type} · ${row.item.state} · ${row.item.assignee||'Unassigned'}`;
   content.append(name,meta);
   if(row.already){const status=document.createElement('small');status.textContent='Already on this sprint';status.className='gs41-package-warning';content.append(status);}
   if(row.conflict){const note=document.createElement('small');note.textContent=`Also in ${row.conflict} · inclusion in this sprint is allowed`;note.className='gs41-package-note';content.append(note);}
   if(row.otherIteration){const note=document.createElement('small');note.className='gs41-package-warning';note.textContent=`Other native iteration (${row.item.iterationPath}); unchecked by default. Select explicitly to include without changing ADO iteration.`;content.append(note);}
   line.append(check,content);list.append(line);choices.push({row,check});
  }
  if(pack.excluded){const excluded=document.createElement('p');excluded.className='gs41-package-warning';excluded.textContent=`${pack.excluded} linked item(s) belong to projects outside this workspace and cannot be added.`;list.append(excluded);}
  const footer=document.createElement('div');footer.className='gs41-package-footer';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancel';
  const add=document.createElement('button');add.type='button';add.className='primary';
  const update=()=>{const selected=choices.filter(x=>x.check.checked&&!x.check.disabled);const other=selected.filter(x=>x.row.otherIteration);
   summary.textContent=`${selected.length} item(s) selected${other.length?' · '+other.length+' from a different native iteration (explicitly included)':''}`;
   add.textContent=`Add ${selected.length} selected item(s) to Board`;add.disabled=!selected.length;
  };
  for(const choice of choices)choice.check.addEventListener('change',update);update();
  const close=()=>{dialog.close();dialog.remove();};cancel.onclick=close;
  dialog.addEventListener('close',()=>{dialog.remove();gs41PreviewBusy=false;});
  add.onclick=async()=>{
   add.disabled=true;cancel.disabled=true;
   try{const ids=choices.filter(x=>x.check.checked&&!x.check.disabled).map(x=>Number(x.row.item.id));
    const n=await gs41CommitWorkPackage(pack,ids,sprint.id);
    close();notify(n?`Added ${n} item(s) to ${sprint.name}. Parent-child relationships are visible in Board hierarchy and on each work-package card.`:'All selected work items are already on this sprint.');
   }catch(error){summary.textContent='Could not save package: '+String(error.message||error);summary.classList.add('gs41-package-warning');cancel.disabled=false;update();}
  };
  footer.append(cancel,add);dialog.append(head,intro,summary,list,footer);document.body.append(dialog);
  dialog.showModal();opened=true;
 }catch(error){dialogNode?.remove();notify('Could not preview work package: '+String(error.message||error),true);}
 finally{if(!opened)gs41PreviewBusy=false;}
}
