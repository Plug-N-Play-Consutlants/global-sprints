'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('./src/gs40-core.js');
const main=fs.readFileSync('src/app-main.js','utf8');
const runtime=fs.readFileSync('src/gs41-runtime.js','utf8');
const r40=fs.readFileSync('src/gs40-runtime.js','utf8');
const packFns=r40.slice(r40.indexOf('async function gs40FetchPackage('),r40.indexOf('// Work packages must be previewed'));
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.style={};this.className='';this.classList={add:()=>{},remove:()=>{}};this.textContent='';this.checked=false;this.disabled=false;this.open=false;}
 append(...args){this.children.push(...args)}
 setAttribute(k,v){this[k]=v}
 addEventListener(name,fn){this.listeners[name]=fn}
 remove(){this.removed=true}
 showModal(){this.open=true}
 close(){this.open=false;this.listeners.close?.()}
}
const body=new Node('body'),sprint={id:'s',name:'Test Sprint',status:'Active',itemIds:[]};
const registry={workspaces:[{id:'w',name:'Test',projectIds:['p']}],sprints:[sprint,{id:'another',name:'Other active sprint',status:'Active',itemIds:[104]}]};
const make=(id,parentId,iteration,type='Task')=>({id,fields:{'System.TeamProject':'Alpha','System.Title':id===100?'Parent Story':'Child '+id,'System.WorkItemType':type,'System.IterationPath':iteration,'System.State':'Active'},relations:[]});
const records={100:make(100,null,'Alpha\\Sprint A','User Story'),101:make(101,100,'Alpha\\Sprint A'),102:make(102,100,'Alpha\\Sprint B'),104:make(104,100,'Alpha\\Sprint A')};
for(const [id,src] of Object.entries(records))if(Number(id)!==100)src.relations.push({rel:'System.LinkTypes.Hierarchy-Reverse',url:'https://example/_apis/wit/workitems/100'});
records[100].relations.push(...[101,102,104].map(id=>({rel:'System.LinkTypes.Hierarchy-Forward',url:`https://example/_apis/wit/workitems/${id}`})));
const labels=[],requests=[];
const ctx={console,Math,Set,Map,Date,JSON,Number,String,Error,Promise,GS40Core:core,registry,
 projects:[{id:'p',name:'Alpha'}],workspaceProjectIds:()=>['p'],
 currentSprint:()=>sprint,guardSprint:async()=>true,bulkBusy:false,
 browserItems:[],browserSelection:new Set(),
 api:async(url)=>{const id=Number(url.match(/workitems\/(\d+)/)[1]);requests.push(id);return records[id];},
 normalizeItem:r=>({id:r.id,title:r.fields['System.Title'],type:r.fields['System.WorkItemType'],project:r.fields['System.TeamProject'],iterationPath:r.fields['System.IterationPath'],state:r.fields['System.State'],assignee:'Unassigned'}),
 persist:async(fn)=>{fn(registry);return true;},
 loadAssignedItems:async()=>{},renderBrowser:()=>{},renderBacklog:()=>{},renderSuggestions:()=>{},renderBoard:()=>{},updateBulkToolbar:()=>{},
 notify:(message,error)=>labels.push({message,error}),diagnostic:()=>{},document:{createElement:t=>new Node(t),body}
};
vm.createContext(ctx);vm.runInContext('const gs40PackageLimit=150;\n'+packFns+'\n'+runtime,ctx);
(async()=>{
 const open=vm.runInContext('gs41OpenPackagePreview',ctx);
 await open(100);
 const dialog=body.children.at(-1);assert(dialog?.open,'visible package preview is shown before saving');
 assert.deepEqual(sprint.itemIds,[],'opening preview cannot save membership');
 const tree=dialog.children.find(x=>x.className==='gs41-package-tree');assert(tree,'visible nested work package tree');
 const lines=tree.children.filter(x=>x.className==='gs41-package-entry');assert.equal(lines.length,4,'all discoverable linked children shown');
 const checks=lines.map(x=>x.children[0]);
 assert.deepEqual(checks.map(x=>x.checked),[true,true,false,true],'same native iteration selected, different unchecked, cross-sprint membership allowed');
 assert.deepEqual(checks.map(x=>x.disabled),[false,false,false,false]);
 const footer=dialog.children.at(-1),add=footer.children[1];
 assert.match(add.textContent,/Add 3 selected/);
 checks[2].checked=true;checks[2].listeners.change();
 assert.match(dialog.children[2].textContent,/different native iteration/,'explicit cross-iteration choice shown');
 assert.match(add.textContent,/Add 4 selected/);
 await add.onclick();
 assert.deepEqual(Array.from(sprint.itemIds),[100,101,102,104],'selected child in another native iteration added only after explicit consent');
 assert.equal(dialog.removed,true,'preview closed after successful save');
 assert.deepEqual(records[102].fields['System.IterationPath'],'Alpha\\Sprint B','no native iteration mutation');
 assert.deepEqual(requests,[100,101,102,104]);
 console.log('PASS: visible hierarchy preview, cross-sprint choice, cross-iteration consent and atomic add');
 // An already-added parent can be reopened to add new child items.
 await open(100);const retry=body.children.at(-1),t2=retry.children.find(x=>x.className==='gs41-package-tree');
 assert.equal(t2.children[0].children[0].disabled,true,'already included parent cannot be added twice');
 assert.equal(retry.open,true);
 console.log('PASS: reopening an existing story still exposes its descendants');
 // All entry points use the package preview rather than silently queueing the parent.
 assert(main.includes('Preview story + children'));
 assert(main.includes('Review story + children'));
 assert(main.includes('gs41OpenPackagePreview(w.id)'));
 assert(main.includes('gs41OpenPackagePreview(item.id)'));
 assert(r40.includes("detail.open=true"),'Board work package summary defaults expanded');
 assert(r40.includes('Child of #'),'Board child cards retain their parent context');
 console.log('PASS: search, browse and Board presentation integration hooks');
})().catch(e=>{console.error(e);process.exitCode=1});
