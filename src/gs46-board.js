/* v1.0.46: non-disruptive Board synchronisation, local and on-demand.
 * No socket, no implicit ADO writes, no full-frame reload for ordinary staleness.
 * Authentication expiry is still handled by GS44Session's guarded reload path.
 */
const GS46Board=(()=>{
 let inFlight=null,queued=false,lastRefresh=0;
 const button=()=>document.getElementById('gs46BoardRefresh');
 const label=()=>document.getElementById('gs46BoardFreshness');
 const status=(message,error=false)=>{const node=label();if(node){node.textContent=message;node.classList.toggle('error',error);}};
 function isEditing(){
  const openDialogs=[...document.querySelectorAll('dialog[open], [role="dialog"]:not(.hidden)')];
  if(openDialogs.some(d=>d.id==='gs-board-item-dialog'||d.classList.contains('gs41-package-dialog')||d.id==='laneDialog'))return true;
  const current=document.activeElement;
  return !!(current&&current.closest?.('#gs-board-item-dialog, .gs41-package-dialog, #laneDialog'));
 }
 function unsafe(){return !!(busy||typeof bulkBusy!=='undefined'&&bulkBusy||typeof switchingSprint!=='undefined'&&switchingSprint||typeof timelineBusy!=='undefined'&&timelineBusy||typeof outlookBookingBusy!=='undefined'&&outlookBookingBusy||typeof gs40BulkCancelBusy!=='undefined'&&gs40BulkCancelBusy||sprintDirty()||projectsDirty()||isEditing());}
 async function refresh({automatic=false}={}){
  if(!token||!registry||!currentSprint())return;
  if(automatic&&document.hidden)return;
  if(inFlight)return inFlight;
  if(unsafe()){
   queued=true;status('Updates paused while editing or saving');
   diagnostic('board.refresh.deferred',{operation:'refresh',deferred:true});return {status:'deferred'};
  }
  // Resist focus/visibility events arriving almost simultaneously.
  if(automatic&&Date.now()-lastRefresh<30000)return {status:'recent'};
  const sprintId=currentSprint()?.id;
  inFlight=(async()=>{
   const action=button();if(action)action.disabled=true;
   status(automatic?'Checking for updates…':'Refreshing Board…');
   try{
    const selectedBefore=currentSprint();
    const before=[...(selectedBefore?.itemIds||[])].map(Number).sort((a,b)=>a-b).join(',');
    // Registry-only changes (for example another PM accepting a Done card)
    // must redraw even when ADO work-item revisions are unchanged.
    const presentationOf=sp=>JSON.stringify({doneDisplayIds:sp?.doneDisplayIds||{},itemLanes:sp?.itemLanes||{},blockedItems:sp?.blockedItems||{},customLanes:sp?.customLanes||[],laneMappings:sp?.laneMappings||{}});
    const presentationBefore=presentationOf(selectedBefore);
    await refreshSharedRegistryForExecution();
    if(!registry.sprints.some(x=>x.id===sprintId)||currentSprint()?.id!==sprintId){
     status('Sprint changed; select it again',true);return {status:'changed'};
    }
    if(unsafe()){
     queued=true;status('Update ready after editing');return {status:'deferred'};
    }
    const after=[...(currentSprint()?.itemIds||[])].map(Number).sort((a,b)=>a-b).join(',');
    const presentationChanged=presentationBefore!==presentationOf(currentSprint());
    let result;
    if(before!==after){
     // Reload only work item data, not the iframe. Do not change native ADO iterations.
     result=await loadAssignedItems();
     if(result?.status==='failed')throw result.error||Error('Unable to refresh assigned work items');
     renderBoard();renderSprintHealth();
    }else{
     result=await refreshTrackedWorkItemsQuietly();
     if(result?.status==='failed')throw result.error||Error('Work item refresh failed');
     if(presentationChanged&&!result?.changed){
      // ADO did not change but GS sprint-owned validation/lane data did.
      renderBoard();renderSprintHealth();
     }
    }
    lastRefresh=Date.now();queued=false;
    status('Updated '+new Date(lastRefresh).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
    diagnostic('board.refresh.success',{operation:'refresh',changed:before!==after||presentationChanged||!!result?.changed,loaded:assignedItems.length});
    return {status:'complete',membershipChanged:before!==after};
   }catch(error){
    status('Update failed · try Refresh Board',true);
    diagnostic('board.refresh.failed',{operation:'refresh',status:Number(error?.status)||0,errorCode:'refresh_failed'},'warn');
    return {status:'failed'};
   }finally{if(action)action.disabled=false;inFlight=null;}
  })();
  return inFlight;
 }
 function start(){
  button()?.addEventListener('click',()=>void refresh());
  // Queued updates are intentionally not applied while a dialog is open.
  document.addEventListener('close',()=>{if(queued)queueMicrotask(()=>{if(!unsafe())void refresh();});},true);
  // Some dialogs remove themselves without emitting `close` to the document.
  document.addEventListener('click',()=>{if(queued)setTimeout(()=>{if(!unsafe())void refresh();},100);},true);
 }
 return {start,refresh,isEditing};
})();
GS46Board.start();
