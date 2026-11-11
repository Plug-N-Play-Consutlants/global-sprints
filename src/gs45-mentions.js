/* v1.0.45 — selected @mentions remain resolved while the user continues typing.
 * Pure composer helpers; Azure DevOps identity resolution stays in app-main.js.
 */
const GS45Mentions=(()=>{
 const mentionId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const boundary=ch=>!ch||/[\s.,!?;:()[\]{}]/.test(ch);
 const allowedPrefix=ch=>!ch||/[\s([{'"\u201c]/.test(ch);
 function selectedAt(text,at,selected){
  for(const [token,identity] of selected){
   if(!identity||!mentionId.test(String(identity.id||'')))continue;
   if(text.startsWith(token,at)&&boundary(text[at+token.length]))return token;
  }
  return null;
 }
 function active(text,caret,selected){
  const value=String(text||''),left=value.slice(0,Math.max(0,Math.min(value.length,Number(caret)||0)));
  const match=left.match(/(?:^|[\s([{'"\u201c])@([^@\n]{0,60})$/);
  if(!match)return null;
  const start=left.length-match[0].length+(match[0].startsWith('@')?0:1);
  // Once the full @Name has been selected, any following words are comment
  // content, not another query for '@Name and then the rest of the sentence'.
  if(selectedAt(value,start,selected))return null;
  return {name:match[1],start,end:left.length};
 }
 function select(text,match,identity){
  const value=String(text||'');
  if(!match||!identity||!mentionId.test(String(identity.id||'')))throw Error('Select a verified Azure DevOps user.');
  const name=String(identity.name||'').trim();if(!name)throw Error('Selected user has no display name.');
  const token='@'+name,prefix=value.slice(0,match.start),suffix=value.slice(match.end);
  // Insert a word boundary so subsequent words can never extend the search term.
  const spacer=/^\s/.test(suffix)?'':' ';
  return {value:prefix+token+spacer+suffix,caret:(prefix+token+spacer).length,token};
 }
 function selectedTokens(text,selected){
  const value=String(text||'');return [...selected.keys()].filter(token=>{
   let at=value.indexOf(token);
   while(at>=0){if(allowedPrefix(value[at-1])&&selectedAt(value,at,selected)===token)return true;at=value.indexOf(token,at+1);}
   return false;
  });
 }
 function prune(text,selected){
  const existing=new Set(selectedTokens(text,selected));
  for(const token of selected.keys())if(!existing.has(token))selected.delete(token);
  return [...existing];
 }
 function serialize(text,selected,escapeHtml){
  const value=String(text||''),esc=escapeHtml||((v)=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));
  const names=[...selected.keys()].sort((a,b)=>b.length-a.length);
  let html='',i=0;const unresolved=[];
  while(i<value.length){
   if(value[i]==='@'&&allowedPrefix(value[i-1])){
    const token=names.find(key=>value.startsWith(key,i)&&boundary(value[i+key.length])&&mentionId.test(String(selected.get(key)?.id||'')));
    if(token){
     const identity=selected.get(token);
     html+=`<a href="#" data-vss-mention="version:2.0,${identity.id}">${esc(token)}</a>`;
     i+=token.length;continue;
    }
    if(/[a-z]/i.test(value[i+1]||'')){
     const unresolvedName=(value.slice(i).match(/^@[a-z][\w.'-]*/i)||[])[0];
     if(unresolvedName)unresolved.push(unresolvedName);
    }
   }
   html+=value[i]==='\n'?'<br>':esc(value[i]);i++;
  }
  return {html:'<div>'+html+'</div>',unresolved:[...new Set(unresolved)]};
 }
 return {active,select,selectedTokens,prune,serialize};
})();
