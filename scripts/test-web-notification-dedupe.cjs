const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const storage = new Map();
const shown = [];
let queue = Promise.resolve();
const locks = {request: (_, fn) => { const next = queue.then(fn); queue = next.catch(() => {}); return next; }};
function createTab({withLocks=true, restrictedStorage=false}={}) {
  const document = {visibilityState:'hidden',hasFocus:()=>false};
  class Notification { static permission = 'granted'; constructor(title, options) { shown.push({title,options}); } close() {} }
  const context = {exports:{}, require:()=>({ICON_ASSET_VERSION:'test'}), Date, encodeURIComponent,
    document,window:{Notification,focus(){},navigator:withLocks?{locks}:{},localStorage:{getItem:k=>{if(restrictedStorage)throw Error("restricted");return storage.get(k)??null},setItem:(k,v)=>{if(restrictedStorage)throw Error("restricted");storage.set(k,v)}}}};
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fs.readFileSync('src/lib/push/web-notifications.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
  return {show:context.exports.showWebNotification,document};
}
(async()=>{
 const first=createTab(), second=createTab();
 const event={title:'Richiesta',body:'Test',tag:'request-1',onPress(){}};
 await Promise.all([first.show(event),second.show(event)]);
 assert.equal(shown.length,1,'same event across tabs emits once');
 await createTab().show(event);
 assert.equal(shown.length,1,'refresh does not repeat alert');
 await second.show({...event,tag:'request-2'});
 assert.equal(shown.length,2,'different request is delivered');
 first.document.visibilityState='visible'; first.document.hasFocus=()=>true;
 await first.show({...event,tag:'request-3'});
 assert.equal(shown.length,2,'focused page uses in-app banner only');
 const fallback = createTab({withLocks:false});
 await fallback.show({...event,tag:'fallback'}); await fallback.show({...event,tag:'fallback'});
 assert.equal(shown.length,3,'browser without Web Locks deduplicates');
 const restricted = createTab({withLocks:false,restrictedStorage:true});
 await restricted.show({...event,tag:'restricted'}); await restricted.show({...event,tag:'restricted'});
 assert.equal(shown.length,4,'restricted storage still deduplicates in same tab');
 console.log('PASS: cross-tab, refresh, distinct events, foreground suppression');
})().catch(e=>{console.error(e);process.exitCode=1});
