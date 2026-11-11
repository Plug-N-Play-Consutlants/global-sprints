'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('app.js','utf8');const start=src.indexOf('async function api(path,options={}){'),end=src.indexOf('// Azure DevOps identity/Graph APIs',start);assert(start>0&&end>start);
const piece=src.slice(start,end);const good=v=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>v});
async function runFixture(responses,method){let index=0,stale=0,writes=0,ended=0;const requests=[];
 const C={token:'OLD',Date,JSON,Error,Promise,diagnostic:()=>{},organizationApiBase:()=> 'https://dev.azure.com/PNPC',serviceHttpError:(s,status)=>Error(s+': '+status),GS44Session:{beginWrite:()=>{writes++},endWrite:()=>{ended++},markAuthenticationFailure:()=>{stale++}},sdk:{getAccessToken:async()=> 'NEW'},fetch:async(url,opts)=>{requests.push(opts);return responses[Math.min(index++,responses.length-1)];}};
 vm.createContext(C);vm.runInContext(piece,C);let result,error;try{result=await vm.runInContext('api',C)('/_apis/test',method==='GET'?{}:{method:'PATCH'});}catch(e){error=e;}
 return {result,error,stale,writes,ended,requests};}
(async()=>{
 let f=await runFixture([{ok:false,status:401},good({status:'ok'})],'GET');assert.equal(f.result.status,'ok');assert.equal(f.requests.length,2);assert.equal(f.stale,0);assert.equal(f.requests[1].headers.Authorization,'Bearer NEW');
 console.log('PASS: GET renews ADO SDK token once on 401');
 f=await runFixture([{ok:false,status:401},good({})],'PATCH');assert(f.error);assert.equal(f.requests.length,1,'PATCH cannot be replayed automatically');assert.equal(f.writes,1);assert.equal(f.ended,1);assert.equal(f.stale,1);
 console.log('PASS: failed write is not replayed; busy guard is released');
 f=await runFixture([{ok:true,status:203,headers:{get:()=> 'text/html'}}],'GET');assert(f.error);assert.equal(f.stale,1);
 console.log('PASS: redirected HTML response is treated as stale authentication');
})().catch(e=>{console.error(e);process.exitCode=1;});
