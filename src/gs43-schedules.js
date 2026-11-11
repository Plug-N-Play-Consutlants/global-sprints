/* v1.0.43 read-only lifecycle and sprint-ceremony coverage.
   This deliberately does not call Microsoft Graph or mutate the registry. */
const GS43Schedules = (()=>{
 const day = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value ? value : '';
 const unresolved = new Set(['pending','sync-pending','cancel-pending']);
 const unresolvedStates=unresolved;
 const hasSeries = m => !!m.repeat && m.repeat!=='none';
 function endDay(m){
  const begin=day(m?.date);
  if(!begin)return '';
  if(!hasSeries(m))return begin;
  // Outlook series may continue beyond the first meeting. Never assume its
  // source sprint or schedule end closes the actual recurring invitation.
  const last=day(m.repeatEnd||m.recurrenceEnd);
  return last && last>=begin ? last : '';
 }
 function outcome(m,today){
  const o=m?.outlook?.state||'',end=endDay(m),start=day(m?.date);
  if(!start||!end)return 'review';
  if(unresolved.has(o)||o&&!['booked','cancelled'].includes(o))return 'review';
  if((m.status==='Cancelled'&&o==='booked')||(o==='cancelled'&&m.status!=='Cancelled'&&m.status!=='Completed'))return 'review';
  if(o==='booked'&&(!m.outlook?.eventId||!m.outlook?.calendarId))return 'review';
  if(end>=today)return o==='cancelled'||m.status==='Cancelled'&&!o ? 'cancelled':'active';
  if(o==='booked'||o==='cancelled'||m.status==='Completed'||m.status==='Cancelled')return 'finished';
  return 'stale'; // Past draft without evidence it ever happened.
 }
 function view(sc,today){
  const meetings=Array.isArray(sc?.meetings)?sc.meetings:[];
  const states=meetings.map(m=>outcome(m,today));
  const booked=meetings.filter(m=>m.outlook?.state==='booked').length;
  const uncertainty=states.filter(x=>x==='review').length;
  const finished=meetings.length>0&&states.every(x=>x==='finished'||x==='cancelled');
  const lifecycle=sc?.lifecycle||'Draft';
  if(lifecycle==='Retired'){
   if(uncertainty||states.includes('active'))return {label:'Retired · needs Outlook review',history:false,finished:false,booked,uncertainty,attention:true};
   return {label:'Retired',history:true,finished:false,booked,uncertainty:0,attention:false};
  }
  if(finished)return {label:states.every(x=>x==='cancelled')?'Cancelled':'Completed',history:true,finished:true,booked,uncertainty:0,attention:false};
  if(uncertainty)return {label:'Needs Outlook review',history:false,finished:false,booked,uncertainty,attention:true};
  if(lifecycle==='Draft'&&booked)return {label:'Draft · Outlook-booked (commit to manage)',history:false,finished:false,booked,uncertainty:0,attention:true};
  if(states.includes('stale')&&states.every(x=>x==='stale'||x==='cancelled'))return {label:'Past unbooked draft',history:false,finished:false,booked,uncertainty:0,attention:true};
  return {label:lifecycle,history:false,finished:false,booked,uncertainty:0,attention:false};
 }
 function inSprint(meeting,sprint){
  if(!meeting||!sprint||!day(sprint.start)||!day(sprint.end))return false;
  const first=day(meeting.date),last=endDay(meeting);
  if(!first||!last||first>sprint.end||last<sprint.start)return false;
  if(!hasSeries(meeting))return !meeting.sprintId||meeting.sprintId===sprint.id;
  // A recurring Outlook series can outlive the sprint that created it, but
  // coverage requires at least ONE actual non-excluded occurrence. A broad
  // date-range intersection alone would count a cancelled/excluded series.
  const since=Math.max(Date.parse(first+'T00:00:00Z'),Date.parse(sprint.start+'T00:00:00Z'));
  const until=Math.min(Date.parse(last+'T00:00:00Z'),Date.parse(sprint.end+'T00:00:00Z'));
  const excluded=new Set(meeting.excludedDates||[]),period=Math.max(1,Number(meeting.repeatInterval)||2)*7;
  const days=(meeting.repeatDays||[]).map(x=>String(x).toLowerCase());
  for(let ms=since,n=0;ms<=until&&n<740;ms+=86400000,n++){
   const d=new Date(ms),iso=d.toISOString().slice(0,10);
   if(excluded.has(iso))continue;
   if(meeting.repeat==='weekly'){
    const names=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    if((days.length?days:[names[new Date(first+'T00:00:00Z').getUTCDay()]]).includes(names[d.getUTCDay()]))return true;
   }else if(meeting.repeat==='sprint'){
    if(Math.round((ms-Date.parse(first+'T00:00:00Z'))/86400000)%period===0)return true;
   }else return true;
  }
  return false;
 }
 function planning(sprint,workspace,today){
  const legacy=(sprint?.ceremonies||[]).filter(m=>m.status!=='Cancelled'&&m.outlook?.state!=='cancelled'&&(m.sprintId===undefined||m.sprintId===sprint.id));
  const matching=[];
  for(const sc of workspace?.meetingSchedules||[]){
   if(sc.lifecycle==='Retired')continue;
   for(const m of sc.meetings||[]){
    if(m.status==='Cancelled'||m.outlook?.state==='cancelled'||!inSprint(m,sprint))continue;
    matching.push({scheduleId:sc.id,meeting:m,lifecycle:sc.lifecycle||'Draft',view:view(sc,today)});
   }
  }
  if(!matching.length&&!legacy.length)return {done:false,label:'',scheduleId:null,history:false,count:0,through:'',unresolved:0};
  const anyBooked=[...matching.map(x=>x.meeting),...legacy].some(m=>m.outlook?.state==='booked'&&m.outlook?.eventId&&m.outlook?.calendarId);
  const anyCommitted=matching.some(x=>x.lifecycle==='Committed');
  const schedule=matching.find(x=>x.lifecycle==='Committed'&&x.meeting.outlook?.state==='booked')||matching.find(x=>x.lifecycle==='Committed')||matching[0]||null;
  const unresolved=matching.filter(x=>unresolvedStates.has(x.meeting.outlook?.state)||x.view.uncertainty).length;
  const dates=matching.map(x=>endDay(x.meeting)).filter(Boolean);
  return {done:true,label:anyBooked?'Booked in Outlook':anyCommitted?'Committed':'Planned',scheduleId:schedule?.scheduleId||null,history:!!schedule?.view.history,count:matching.length+legacy.length,through:dates.length?dates.sort().at(-1):'',unresolved};
 }
 function currentCandidates(candidates,workspace,today){
  const byId=new Map((workspace?.meetingSchedules||[]).map(sc=>[sc.id,sc]));
  return (candidates||[]).filter(c=>{const meeting=byId.get(c.scheduleId)?.meetings?.find(m=>m.id===c.meetingId);return !meeting||!['finished','cancelled'].includes(outcome(meeting,today));});
 }
 return {validDay:day,endDay,outcome,view,inSprint,planning,currentCandidates};
})();
