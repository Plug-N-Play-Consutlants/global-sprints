const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../extension/app.js'),'utf8');
const begin=source.indexOf('const ROOM_API=');
const end=source.indexOf('function workspaceLabel()');
const raw=source.slice(begin,end).replace(/^const COLLECTION=.*?;\n/m,'');
const memory=new Map();
const store={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const ctx={$:()=>null,activateTab:()=>{},localStorage:store,Date,JSON,Set,Error,AbortController,diagnostic:()=>{},window:{addEventListener:()=>{}},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},setTimeout:()=>1,clearTimeout:()=>{},confirm:()=>true,fetch:async()=>{throw Error('offline')}};
vm.createContext(ctx);
// Remove workspace state declarations and HTML rendering dependencies from the test extraction.
vm.runInContext(raw,ctx);
vm.runInContext("sdk={getHost:()=>({id:'12345678-1234-4234-8234-123456789abc',name:'pnpc'})};token='test-token'",ctx);
const run=s=>vm.runInContext(s,ctx);
assert.equal(run('roomRestoreVerified()'),false,'Never verified must not restore');
assert.equal(run('roomAccessAllowed()'),false,'Never verified must be restricted');
run("roomStatus=normalizeRoomResponse({status:'licensed',allowed:true});roomStoreVerified(roomStatus)");
run('roomStatus=null');assert.equal(run('roomRestoreVerified()'),true);assert.equal(run('roomAccessAllowed()'),true);
// Simulated 503 must preserve the verified status.
(async()=>{
 await run("checkRoom('entitlement')");
 assert.equal(run('roomStatus.status'),'licensed');assert.equal(run('roomAccessAllowed()'),true);
 // Authoritative 200 revoked denies and overwrites the previous verified decision.
 run("roomStatus=normalizeRoomResponse({status:'revoked',allowed:false});roomStoreVerified(roomStatus)");
 run('roomStatus=null');assert.equal(run('roomRestoreVerified()'),true);assert.equal(run('roomAccessAllowed()'),false);
 // An authoritative recovery restores access.
 run("roomStatus=normalizeRoomResponse({status:'licensed',allowed:true});roomStoreVerified(roomStatus)");
 assert.equal(run('roomAccessAllowed()'),true);
 // Cross-organization cache cannot restore an entitlement.
 run("sdk={getHost:()=>({id:'87654321-1234-4234-8234-123456789abc',name:'other'})};roomStatus=null");
 assert.equal(run('roomRestoreVerified()'),false);assert.equal(run('roomAccessAllowed()'),false);
 console.log('Room recovery simulation PASS (503 retention, revoked, recovery, cross-org isolation)');
})().catch(e=>{console.error(e);process.exitCode=1});
