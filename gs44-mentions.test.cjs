'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('app.js','utf8');
const a=src.indexOf('const MENTION_ID_RE='),b=src.indexOf('// Local UI preferences',a);assert(a>0&&b>a);
const piece=src.slice(a,b),ID='81fa6389-0872-6fdd-a451-7ba7880f566a',DIRECTORY_ID='d034aaca-62a3-455b-87d1-c4ed37c5b3ff';
const good=value=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>value});
async function scenario(hostUsers,route){
 const seen=[];const C={Map,Set,Error,Promise,Date,URL,encodeURIComponent,decodeURIComponent,JSON,console,token:'TOKEN',items:[],assignedItems:[],ancestorItems:[],browserItems:[],nearbyResults:[],organizationApiBase:()=> 'https://dev.azure.com/PNPC',diagnostic:()=>{},GS44Session:{markAuthenticationFailure:()=>{throw Error('unexpected stale auth');}},serviceHttpError:(_,s)=>Error(String(s)),sdk:{getService:async()=>({searchIdentitiesAsync:async()=>hostUsers}),getAccessToken:async()=> 'NEW'},fetch:async(url,o)=>{seen.push({url,o});return route(url,o);}};
 vm.createContext(C);vm.runInContext(piece,C);return {search:vm.runInContext('searchMentionIdentities',C),seen};
}
(async()=>{
 let f=await scenario([{entityId:DIRECTORY_ID,displayName:'Wendy',mailAddress:'wendy@example.com'}],async url=>{
  assert.match(url,/vssps\.dev\.azure\.com\/PNPC\/_apis\/identities\?identityIds=/);return good({value:[{id:ID,providerDisplayName:'Wendy Potter',mailAddress:'wendy@example.com'}]});
 });
 const users=await f.search('Wendy');assert.equal(users.length,1);assert.equal(users[0].id,ID);assert.notEqual(users[0].id,DIRECTORY_ID);
 console.log('PASS: host directory entity ID cannot masquerade as ADO VSID');
 let calls=0;f=await scenario([],async url=>{calls++;if(calls<=3)return {ok:false,status:404};return good({value:[{id:ID,providerDisplayName:'Scott Developer'}]});});
 try{await f.search('Scott');}catch{}const before=calls;await f.search('Scott').catch(()=>{});assert(calls>before,'failed/empty lookup does not poison cache');
 console.log('PASS: failed identity lookups are retryable rather than permanently cached');
 assert.match(src,/data-vss-mention="version:2\.0,\$\{identity\.id\}"/);
 assert.match(src,/ado\.mentions\.selected/);assert.match(src,/ado\.mentions\.comment_failed/);
 assert.match(src,/Select each person from the Azure DevOps suggestions before posting/);

 // Execute the actual card serializer and the current pure composer, not only string checks.
 const from=src.indexOf(' const mentionCommentHtml=()=>{'),to=src.indexOf(' // A returning stale browser tab',from);
 const utilStart=src.indexOf('const GS45Mentions=(()=>{'),version=JSON.parse(fs.readFileSync('extension.vsomanifest','utf8')).version,utilEnd=src.indexOf('/* v1.0.46: non-disruptive Board synchronisation',utilStart);
 assert(from>0&&to>from&&utilStart>0&&utilEnd>utilStart,'mention serializer and composer are packaged');
 const htmlCtx={Map,Error,Set,comment:{value:'Thanks @Wendy Potter <team>\nReview this.'},mentions:new Map([['@Wendy Potter',{id:ID,name:'Wendy Potter'}]]),escHtml:v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')};
 vm.createContext(htmlCtx);vm.runInContext(src.slice(utilStart,utilEnd).replace(/GS44Session\.start\(\);/g,''),htmlCtx);vm.runInContext(src.slice(from,to),htmlCtx);
 const html=vm.runInContext('mentionCommentHtml()',htmlCtx);
 assert(html.includes('data-vss-mention="version:2.0,'+ID+'"'));assert(html.includes('&lt;team&gt;'));assert(!html.includes('<team>'));
 console.log('PASS: actual Board comment renderer emits a verified mention anchor and escapes HTML');
 console.log('PASS: @mention selection, HTML encoding and post-failure feedback remain wired');
})().catch(e=>{console.error(e);process.exitCode=1;});
