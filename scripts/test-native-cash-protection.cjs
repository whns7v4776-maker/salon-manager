// Component integration test with a real React tree and an isolated DOM/storage.
// Authenticator responses are controlled here; server crypto is tested separately.
const { JSDOM } = require(process.env.JSDOM_MODULE || "jsdom");
const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const assert = require("node:assert/strict");
const dom = new JSDOM('<div id="root"></div>', {
  url: "https://salon.example.test",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react"),
  { createRoot } = require("react-dom/client");
const h = React.createElement,
  { act } = React;
const scope = "salon:owner@example.test",
  amount = "9876,54 €";
let timers = new Map(),
  timerId = 0,
  childrenRenders = 0,
  biometricCalls = 0,
  pendingPasskey = null;
function load(path, deps) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: (name) => deps[name],
      Error,
      window: dom.window,
      document: dom.window.document,
      DOMException: dom.window.DOMException,
      setTimeout: (fn, ms) => {
        const id = ++timerId;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  return exports;
}
const native = {
  ActivityIndicator: () => null,
  View: ({ children, dataSet }) =>
    h(
      "div",
      Object.fromEntries(
        Object.entries(dataSet || {}).map(([k, v]) => [
          "data-" + k.replace(/[A-Z]/g, (x) => "-" + x.toLowerCase()),
          v,
        ]),
      ),
      children,
    ),
  Text: ({ children }) => h("span", null, children),
  Pressable: ({ children, onPress, disabled, accessibilityLabel }) =>
    h(
      "button",
      { onClick: onPress, disabled, "aria-label": accessibilityLabel },
      children,
    ),
  TextInput: ({
    value,
    onChangeText,
    secureTextEntry,
    accessibilityLabel,
    editable,
  }) =>
    h("input", {
      "aria-label": accessibilityLabel,
      type: secureTextEntry ? "password" : "text",
      value,
      disabled: editable === false,
      onInput: (e) => onChangeText(e.currentTarget.value),
    }),
};

const storage=new Map();let authenticationCancelled=false,storeFailed=false,passwordChecks=0;
const secure={
 getItemAsync:async(key,options)=>{if(storeFailed)throw Error('Keystore non disponibile');if(options?.requireAuthentication){biometricCalls++;if(pendingPasskey)await pendingPasskey.promise;if(authenticationCancelled)throw Error('Autenticazione annullata');}return storage.get(key)??null;},
 setItemAsync:async(key,value,options)=>{if(storeFailed)throw Error('Keystore non disponibile');if(options?.requireAuthentication&&authenticationCancelled)throw Error('Autenticazione annullata');storage.set(key,value);},
};
const NativePremiumScope=React.createContext(false);
function freshGate(){
 const preferences=load('src/lib/cash-device-privacy.native.ts',{react:React,'expo-secure-store':secure});
 return load('components/cash-device-gate.native.tsx',{
  react:React,'react-native':native,'expo-secure-store':secure,
  'expo-local-authentication':{hasHardwareAsync:async()=>true,isEnrolledAsync:async()=>true},
  '@expo/vector-icons':{Ionicons:()=>null},
  './access-premium':{useAccessAppearance:()=>({palette:{ink:'#222',muted:'#555',action:'#222',field:'#ddd',actionText:'#fff',border:'#777',line:'#bbb'}})},
  '../src/lib/cash-device-privacy.native':preferences,
  '../src/lib/cash-owner-verification':{verifyCashOwnerPassword:async(password)=>{passwordChecks++;if(password!=='owner-fixture')throw Error('Password non valida');}},
  './owner-native-premium':{NativePremiumScope,NativeReadableText:native.Text,NativeSectionHeader:()=>h('h1',null,'Cassa')},
  './native-settings-popup':{NativeSettingsPopup:({title,children,onClose})=>h('section',{role:'dialog'},h('h2',null,title),children,h('button',{onClick:onClose},'Chiudi'))},
 }).CashDeviceGate;
}
let Gate=freshGate(),root=createRoot(document.getElementById('root'));
let currentScope=scope;
const body=controls=>{childrenRenders++;return h('main',{'data-cash-sensitive':true},amount,h('button',{onClick:controls.onConfigure},'Configura'),h('button',{onClick:controls.onLock},'Blocca'));};
const render=async(active=true)=>act(async()=>root.render(h(Gate,{scope:currentScope,email:'owner@example.test',active},body)));
const button=label=>Array.from(document.querySelectorAll('button')).find(e=>e.textContent===label);
const click=async label=>{assert.ok(button(label),'Missing '+label);await act(async()=>button(label).click());};
const enter=async value=>act(async()=>{const input=document.querySelector('input');assert.ok(input);input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
const concealed=()=>{assert.equal(document.querySelector('[data-cash-sensitive]'),null);assert.ok(!document.body.textContent.includes(amount));};
const shown=()=>assert.ok(document.body.textContent.includes(amount));
const unlock=async()=>{await click('Sblocca con password');await enter('owner-fixture');await click('Sblocca');shown();};
const refresh=async()=>{await act(async()=>root.unmount());childrenRenders=0;Gate=freshGate();root=createRoot(document.getElementById('root'));await render();};
(async()=>{
 await render(false);shown();await render(true);shown();assert.equal(storage.size,0,'Off by default must not create a protection setting');
 await click('Configura');await enter('owner-fixture');await click('Attiva protezione');shown();
 assert.ok([...storage.values()].some(v=>v.includes('"enabled":true')));
 assert.ok(![...storage.values()].some(v=>v.includes('owner-fixture')),'Never persist the password');
 await click('Blocca');concealed();await click('Sblocca con password');await enter('wrong-fixture');await click('Sblocca');concealed();assert.ok(document.body.textContent.includes('Password non valida'));await click('Chiudi');
 await unlock();await render(false);shown();await render(true);shown();assert.equal(timers.size,0,'No automatic lock timers');
 await refresh();concealed();assert.equal(childrenRenders,0,'Protected children must never mount before unlock after reload');
 await unlock();await click('Configura');await click('Configura Face ID o impronta');await enter('wrong-fixture');await click('Abilita Face ID o impronta');assert.ok(![...storage.keys()].some(k=>k.endsWith('.biometric')));
 await enter('owner-fixture');await click('Abilita Face ID o impronta');assert.ok([...storage.keys()].some(k=>k.endsWith('.biometric')));
 await click('Blocca');concealed();let resolveAuth;pendingPasskey={promise:new Promise(r=>resolveAuth=r)};
 await click('Sblocca con Face ID o impronta');concealed();assert.ok(biometricCalls>0);await act(async()=>resolveAuth());pendingPasskey=null;shown();
 await click('Blocca');authenticationCancelled=true;await click('Sblocca con Face ID o impronta');concealed();assert.ok(document.body.textContent.includes('annullata'));authenticationCancelled=false;await click('Chiudi');await unlock();
 await click('Configura');await enter('owner-fixture');await click('Disattiva protezione');await refresh();shown();
 // A failed keystore read is closed, even if the default for a fresh valid device is free access.
 storeFailed=true;await refresh();concealed();assert.equal(childrenRenders,0);storeFailed=false;await click('Riprova verifica accesso');shown();
 assert.ok(passwordChecks>=7);await act(async()=>root.unmount());
 console.log('PASS native cash protection: optional default, password, manual lock, reload, biometric enrollment/pending/cancel, keystore failure; mocked device I/O.');
})().catch(error=>{console.error(error);process.exitCode=1;});
