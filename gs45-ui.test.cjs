'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/app-main.js','utf8');
const begin=app.indexOf(' const mentions=new Map();let mentionQuerySeq=0,mentionSearchTimer=null;');
const end=app.indexOf(' // A returning stale browser tab',begin);
assert(begin>0&&end>begin,'real Board mention event-handlers found');
const names=[{id:'81fa6389-0872-6fdd-a451-7ba7880f566a',name:'Wendy Potter',email:'wendy@example.org'},{id:'c1ee1c64-2d1b-48c8-ad33-7f9d1afdd4cd',name:'Scott Developer',email:'scott@example.org'}];
class Node {
 constructor(tag='div',cls='',text=''){this.tag=tag;this.className=cls;this.textContent=text;this.children=[];this.events={};this.value='';this.selectionStart=0;this.selectionEnd=0;this.onclick=null;}
 setAttribute(name,value){this[name]=value;}
 addEventListener(name,cb){this.events[name]=cb;}
 dispatch(name){this.events[name]?.({type:name,preventDefault(){}});}
 replaceChildren(...children){this.children=[...children];}
 append(...children){this.children.push(...children);}
 after(n){this.next=n;}
 focus(){}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
}
const comment=new Node('textarea'),feedback=new Node(),mentionResults=new Node(),history=new Node();
let timers=[],nextTimer=0,queryLog=[];const diagnostic=[];
const context={Map,Set,Error,String,Promise,clearTimeout(id){timers=timers.filter(x=>x.id!==id);},setTimeout(fn){const id=++nextTimer;timers.push({id,fn});return id;},el:(tag,cls,text)=>new Node(tag,cls,text),comment,feedback,mentionResults,w:{id:825},diagnostic:(...args)=>diagnostic.push(args),searchMentionIdentities:async query=>{queryLog.push(query);return names.filter(n=>n.name.toLowerCase().includes(query.toLowerCase()));},gs44Dirty:false};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/gs45-mentions.js','utf8'),context);
vm.runInContext(app.slice(begin,end),context);
async function flush(){const run=timers;timers=[];for(const timer of run)timer.fn();await Promise.resolve();await Promise.resolve();}
function type(value){comment.value=value;comment.setSelectionRange(value.length,value.length);comment.dispatch('input');}
(async()=>{
 type('Thanks @Wen');await flush();assert.equal(queryLog.length,1);assert.equal(queryLog[0],'Wen');
 assert.equal(mentionResults.children.length,1);
 let option=mentionResults.children[0];option.dispatch('pointerdown');option.onclick();
 assert.equal(comment.value,'Thanks @Wendy Potter ');
 assert.equal(mentionResults.children.length,0);
 assert.equal(comment.next.children.length,1,'linked mention must be visibly indicated');
 assert.match(comment.next.children[0].textContent,/@Wendy Potter/);
 assert.equal(context.gs44Dirty,true);
 console.log('PASS: actual Board handler selects and visibly links an ADO identity');
 type(comment.value+'please review the test');await flush();
 assert.equal(queryLog.length,1,'ordinary text after selected mention must never generate another search');
 assert.equal(mentionResults.children.length,0,'no spurious no-results message');
 assert.equal(comment.next.children.length,1);
 console.log('PASS: typing after selected mention leaves picker closed and selected user linked');
 type(comment.value+' and @Sco');await flush();assert.equal(queryLog.length,2);
 option=mentionResults.children[0];option.onclick();
 type(comment.value+' before the demo');await flush();assert.equal(queryLog.length,2);
 assert.equal(comment.next.children.length,2);
 const result=vm.runInContext('mentionCommentHtml()',context);
 assert.equal((result.match(/data-vss-mention=/g)||[]).length,2,'both selections must post as real mentions');
 console.log('PASS: multiple mentions remain linked in one comment');
 type(comment.value+' and @Unknown');await flush();
 assert.throws(()=>vm.runInContext('mentionCommentHtml()',context),/Unresolved mention @Unknown/);
 console.log('PASS: unresolved mention is blocked before posting');
 // Old in-flight searches must not display suggestions once a different query is entered.
 let resolveSlow;
 context.searchMentionIdentities=query=>query==='Pat'?new Promise(resolve=>{resolveSlow=resolve;}):Promise.resolve(names.filter(n=>n.name.toLowerCase().includes(query.toLowerCase())));
 type('Ping @Pat');const stale=timers;timers=[];stale[0].fn();await Promise.resolve();
 type('Ping @Wen');await flush();resolveSlow([{id:names[1].id,name:'Pat Old'}]);await Promise.resolve();await Promise.resolve();
 assert.equal(mentionResults.children.length,1);assert.match(mentionResults.children[0].textContent,/Wendy Potter/);
 console.log('PASS: stale async search cannot override a newer query');
})().catch(e=>{console.error(e);process.exitCode=1;});
