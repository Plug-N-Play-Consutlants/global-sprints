/* Global Sprints v1.0.40: pure, testable coordination rules. No ADO or Outlook side effects. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.GS40Core=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const number=id=>Number(id);
 function linkId(url){const hit=String(url||'').match(/\/(\d+)(?:\?.*)?$/);return hit?Number(hit[1]):null;}
 function relationIds(record,rel){return (record?.relations||[]).filter(r=>r.rel===rel).map(r=>linkId(r.url)).filter(Number.isInteger);}
 function packageGraph(records,rootId,maxDepth=12){
  const map=new Map(records.map(w=>[number(w.id),w]));
  const children=new Map();
  for(const item of records){const p=number(item.parentId);if(p&&p!==number(item.id)&&map.has(p)){if(!children.has(p))children.set(p,[]);children.get(p).push(item);}}
  const output=[],seen=new Set();
  const visit=(id,depth)=>{if(depth>maxDepth||seen.has(id)||!map.has(id))return;seen.add(id);output.push(map.get(id));for(const child of children.get(id)||[])visit(number(child.id),depth+1);};
  visit(number(rootId),0);return output;
 }
 function isTask(item){return /(^|\W)(task|subtask|sub-task)(\W|$)/i.test(String(item?.type||''));}
 function isContext(item){return /^(epic|feature)$/i.test(String(item?.type||''));}
 function metric(item){const v=item?.effort??item?.storyPoints;return v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):0;}
 function featureOwner(feature,items){
  if(!isContext(feature)||metric(feature)<=0)return false;
  const byId=new Map(items.map(w=>[number(w.id),w]));
  for(const other of items){if(other.id===feature.id||metric(other)<=0)continue;
   let node=other,seen=new Set();
   for(let i=0;i<20&&node?.parentId&&!seen.has(number(node.id));i++){
    seen.add(number(node.id));if(number(node.parentId)===number(feature.id))return false;
    node=byId.get(number(node.parentId));
   }
  }
  return true;
 }
 function commitmentRows(items,{includeContext=false,excludedFeatureIds=[]}={}){
  const byId=new Map(items.map(w=>[number(w.id),w]));
  const suppressed=new Set(excludedFeatureIds.map(number));
  const owners=new Set(items.filter(w=>!isContext(w)||(!suppressed.has(number(w.id))&&featureOwner(w,items))).map(w=>number(w.id)));
  const counted=new Set(),rows=[];
  for(const w of items){if(!owners.has(number(w.id))&&!includeContext)continue;
   let ancestor=byId.get(number(w.parentId)),owner=null,seen=new Set(),eligible=[];
   for(let depth=0;depth<20&&ancestor&&!seen.has(number(ancestor.id));depth++){
    seen.add(number(ancestor.id));
    if(owners.has(number(ancestor.id)))eligible.push(ancestor);
    ancestor=byId.get(number(ancestor.parentId));
   }
   owner=eligible.find(parent=>metric(parent)>0)||eligible[0]||null;
   const countedEffort=owner?0:metric(w);
   if(!counted.has(number(w.id))){rows.push({...w,commitmentEffort:countedEffort,executionChild:!!owner,commitmentOwner:owner?number(owner.id):number(w.id)});counted.add(number(w.id));}
  }
  return rows;
 }
 function progress(baseline,observed,isCompleted,filter=()=>true){
  const original=commitmentRows(baseline.filter(filter));const latest=new Map(observed.map(w=>[number(w.id),w]));
  let total=0,completed=0,remaining=0,completedItems=0;
  for(const w of original){const current=latest.get(number(w.id));const points=w.commitmentEffort;total+=points;
   if(current&&isCompleted(current)){completed+=points;if(w.commitmentOwner===number(w.id))completedItems++;}else remaining+=points;
  }
  return {total,completed,remaining,completedItems,totalItems:original.filter(w=>w.commitmentOwner===number(w.id)).length};
 }
 function cancellationCandidates(schedules){const items=[];
  for(const schedule of schedules||[])for(const meeting of schedule.meetings||[]){
   const state=meeting.outlook?.state;
   if(state==='booked')items.push({scheduleId:schedule.id,meetingId:meeting.id,state:'booked'});
   else if(state&&state!=='cancelled')items.push({scheduleId:schedule.id,meetingId:meeting.id,state:'unresolved'});
   else if(!state&&meeting.status!=='Cancelled'&&meeting.status!=='Completed')items.push({scheduleId:schedule.id,meetingId:meeting.id,state:'internal'});
  }
  return items;
 }
 function closeoutEligible(workspace){return cancellationCandidates(workspace?.meetingSchedules||[]).every(x=>x.state==='internal')&&
   !(workspace?.meetingSchedules||[]).some(sc=>sc.lifecycle==='Committed'&&(sc.meetings||[]).some(m=>m.outlook?.state&&m.outlook.state!=='cancelled'))&&
   !(workspace?.sprintMeetings||[]).some(m=>m.outlook?.state&&m.outlook.state!=='cancelled');}
 function validateRetrospective(raw){const sections=['wentWell','improve','lessons'];const clean={};for(const k of sections)clean[k]=String(raw?.[k]||'').slice(0,10000);
  clean.actions=(Array.isArray(raw?.actions)?raw.actions:[]).slice(0,50).map(x=>({title:String(x.title||'').trim().slice(0,300),owner:String(x.owner||'').trim().slice(0,150),due:String(x.due||'').slice(0,10),completed:!!x.completed})).filter(x=>x.title);
  return clean;
 }
 return {linkId,relationIds,packageGraph,commitmentRows,featureOwner,progress,cancellationCandidates,closeoutEligible,validateRetrospective,isTask,isContext,metric};
});
