const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const from=source.indexOf('const MENTION_ID_RE='),to=source.indexOf('// Local UI preferences are scoped',from);
assert(from>0&&to>from);
const piece=source.slice(from,to);
const ADO='https://dev.azure.com/PlugNPlayConsultants';
const GUID='81fa6389-0872-6fdd-a451-7ba7880f566a';
const GUID2='f0306154-2ad7-42cb-a71e-fad5a5c0e4fb';
const json=value=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>value});
async function fixture({hostUsers=[],workItems=[],routes=()=>{throw Error('unexpected call')},sdkFails=false}){
 const seen=[];
 const C={Map,Set,Error,Promise,Date,URL,encodeURIComponent,decodeURIComponent,JSON,console,token:'TEST',items:workItems,assignedItems:[],ancestorItems:[],browserItems:[],nearbyResults:[],organizationApiBase:()=>ADO,diagnostic:()=>{},serviceHttpError:(s,status)=>Error(s+': '+status),sdk:{getService:async id=>{assert.equal(id,'ms.vss-features.identity-service');if(sdkFails)throw Error('host not available');return {searchIdentitiesAsync:async()=>hostUsers};},getAccessToken:async()=> 'RENEWED'},fetch:async (url,opts)=>{seen.push({url,opts});return routes(url,opts);}};
 vm.createContext(C);vm.runInContext(piece,C);
 return {search:vm.runInContext('searchMentionIdentities',C),seen};
}
(async()=>{
 // ADO Work Item Tracking identity is enough to mention a team member without network.
 {
  const f=await fixture({workItems:[{assignee:'Wendy Potter',assigneeId:GUID,assigneeEmail:'wendy@example.com'}]});
  const r=await f.search('Wendy');assert.equal(r[0].id,GUID);assert.equal(f.seen.length,0);
  console.log('PASS: authorized WIT assignee uses real VSID, zero network');
 }
 // Exactly the live failure: host IIdentity has only an entityId, no display name.
 // Resolve through documented IMS endpoint on vssps.dev.azure.com.
 {
  const f=await fixture({hostUsers:[{entityId:GUID,entityType:'user',originDirectory:'aad',originId:GUID2}],
   routes:async url=>{assert(url.startsWith('https://vssps.dev.azure.com/PlugNPlayConsultants/_apis/identities?identityIds='),url);return json({value:[{id:GUID,providerDisplayName:'Wendy Potter',properties:{Mail:{$value:'wendy@example.com'}}}]});}});
  const r=await f.search('Wendy');assert.equal(r[0].name,'Wendy Potter');assert.equal(r[0].id,GUID);assert.equal(f.seen.length,1);
  console.log('PASS: slim SDK identity resolves via IMS VSID on correct host');
 }
 // IMS general name search matches the actual documented API and response.
 {
  const f=await fixture({hostUsers:[],routes:async url=>{assert(url.startsWith('https://vssps.dev.azure.com/PlugNPlayConsultants/_apis/identities?searchFilter=General'),url);return json({value:[{id:GUID,providerDisplayName:'Scott Flanagan'}]});}});
  const r=await f.search('Scott');assert.equal(r[0].name,'Scott Flanagan');assert.equal(f.seen.length,1);
  console.log('PASS: IMS name search resolves identity without work item records');
 }
 // Graph descriptor is not the mention ID. Graph storage key is.
 {
  const f=await fixture({hostUsers:[],routes:async(url,opts)=>{
   assert(url.startsWith('https://vssps.dev.azure.com/PlugNPlayConsultants/'),url);
   if(url.includes('/_apis/identities?'))return {ok:false,status:403};
   if(url.includes('/_apis/graph/subjectquery?')){
    assert.equal(opts.method,'POST');assert.deepEqual(JSON.parse(opts.body),{query:'Gwen',subjectKind:['User']});
    return json({value:[{subjectKind:'User',displayName:'Gwen Test',descriptor:'aad.some-descriptor',originId:GUID2}]});
   }
   if(url.includes('/_apis/graph/storagekeys/'))return json({value:GUID});
   throw Error('unexpected route '+url);
  }});
  const r=await f.search('Gwen');assert.equal(r[0].id,GUID);assert.notEqual(r[0].id,GUID2);assert.equal(f.seen.length,3);
  console.log('PASS: Graph subjectQuery descriptor converted to storage key');
 }
 // Cross-origin endpoints may fail, but known assignees remain searchable.
 {
  const f=await fixture({sdkFails:true,workItems:[{assignee:'Wendy Potter',assigneeId:GUID}],routes:async()=>{throw Error('Failed to fetch');}});
  const r=await f.search('Wendy');assert.equal(r[0].id,GUID);assert.equal(f.seen.length,0);
  console.log('PASS: team fallback survives browser network failure');
 }
 assert(source.includes(`data-vss-mention="version:2.0,${'${identity.id}'}"`));
 assert(source.includes("const DIAG_VERSION='1.0.39'"));
 console.log('PASS: authenticated mention markup and header version');
})().catch(e=>{console.error(e);process.exitCode=1;});
