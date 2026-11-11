'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('src/gs44-session.js','utf8');
function fixture(){
 let time=10000000,returned=0,reloads=0,scheduled=[];const listeners={window:{},document:{}};const data=new Map();
 const sessionStorage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k)};
 const document={visibilityState:'visible',addEventListener:(k,cb)=>listeners.document[k]=cb,getElementById:()=>null,createElement:()=>({setAttribute(){},addEventListener(){},append(){},className:'',textContent:''}),body:{append(){}}};
 const win={sessionStorage,location:{reload:()=>{reloads++;}},addEventListener:(k,cb)=>listeners.window[k]=cb};
 const C={Date:class extends Date{static now(){return time;}},window:win,document,sessionStorage,JSON,Number,Math,Error,setTimeout:cb=>{scheduled.push(cb);return scheduled.length;},token:'TOKEN',registry:{sprints:[]},busy:false,diagnostic:()=>{}};
 vm.createContext(C);vm.runInContext(src,C);const session=vm.runInContext('GS44Session',C);
 return {C,session,listeners,data,get reloads(){return reloads;},at:t=>time=t,advance:t=>time+=t,flush:()=>{while(scheduled.length)scheduled.shift()();}};
}
{
 const f=fixture();f.listeners.window.blur();f.advance(301000);f.listeners.window.focus();assert.equal(f.reloads,1,'stale tab reloads on focus');console.log('PASS: stale tab auto-reloads on return');
}
{
 const f=fixture();f.session.setCardProvider(()=>({dirty:true,id:825,project:'Serve It Up Safe',values:{title:'Unsaved edit',comment:'@Wendy testing'},mentions:[['@Wendy',{id:'81fa6389-0872-6fdd-a451-7ba7880f566a',name:'Wendy'}]]}));
 f.listeners.window.blur();f.advance(301000);f.listeners.window.focus();assert.equal(f.reloads,1);
 const saved=f.session.restoreCard(825,'Serve It Up Safe');assert.equal(saved.values.comment,'@Wendy testing');assert.equal(saved.mentions.length,1);assert.equal(f.session.restoreCard(825,'Serve It Up Safe'),null);console.log('PASS: unsaved Board card and resolved mentions survive reload once');
}
{
 const f=fixture();f.session.beginWrite();f.listeners.window.blur();f.advance(301000);f.listeners.window.focus();assert.equal(f.reloads,0,'do not interrupt in-flight ADO write');f.session.endWrite();f.flush();assert.equal(f.reloads,1);console.log('PASS: in-flight ADO write cannot be cut off by auto-reload');
}
{
 const f=fixture();f.session.markAuthenticationFailure(203);f.flush();assert.equal(f.reloads,1,'non-JSON 203 triggers recovery');f.session.markAuthenticationFailure(203);f.flush();assert.equal(f.reloads,1,'reload loop guard');console.log('PASS: authentication recovery and reload-loop guard');
}
{
 const f=fixture();f.listeners.window.blur();f.advance(120000);f.listeners.window.focus();assert.equal(f.reloads,0,'short tab switches do not reload');f.advance(301000);f.listeners.document.pointerdown();assert.equal(f.reloads,1,'visible but idle tab reloads before editing');console.log('PASS: brief tab switch preserved; prolonged inactivity recovered');
}
