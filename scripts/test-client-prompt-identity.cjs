const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('app/cliente-screen.tsx','utf8');
const extracted=source.slice(source.indexOf('const buildFrontendBiometricEnabledKey ='),source.indexOf('const buildFrontendWaitlistViewedKey ='));
const values=new Map();
const context={
 AsyncStorage:{getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v)},
 FRONTEND_BIOMETRIC_ENABLED_KEY:'bio',FRONTEND_BIOMETRIC_SALON_CODE_KEY:'salon',FRONTEND_BIOMETRIC_PROFILE_KEY:'profile',FRONTEND_CALENDAR_PERMISSION_PROMPTED_KEY:'calendar',
 normalizeSalonCode:v=>v.trim().toLowerCase(),normalizeEmail:v=>v.trim().toLowerCase(),limitPhoneToTenDigits:v=>v.replace(/\D/g,'').slice(-10),
};
vm.createContext(context);
vm.runInContext(ts.transpileModule(extracted+'\nglobalThis.readSetting=readFrontendBiometricEnabledSetting;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
(async()=>{
 const old={salonCode:'salon-a',email:'old@example.com',phone:'3331234567'};
 values.set('bio','true'); values.set('salon','salon-a'); values.set('profile',JSON.stringify({email:old.email,telefono:old.phone}));
 assert.equal(await context.readSetting({...old,email:'new@example.com'}),null,'new customer cannot inherit biometric');
 assert.equal(await context.readSetting({...old,salonCode:'salon-b'}),null,'new salon cannot inherit biometric');
 assert.equal(await context.readSetting(old),'true','matching legacy customer is preserved');
 assert.equal(values.get('bio:salon-a:old@example.com'),'true','legacy migrated to identity key');
 values.set('bio:salon-a:new@example.com','false');
 assert.equal(await context.readSetting({...old,email:'new@example.com'}),'false','explicit decline wins over device enabled');
 values.set('profile','broken');
 assert.equal(await context.readSetting({...old,salonCode:'salon-c'}),null,'invalid legacy cannot grant biometrics');
 const flow=source.slice(source.indexOf('const runFrontendPostLoginPromptFlow'),source.indexOf('const buildStoredProfileFallback'));
 assert.match(flow,/hasNotificationPromptPending = notificationPrompted !== 'true'/);
 assert.match(flow,/permissionStatus === 'granted'/); assert.match(flow,/permissionStatus === 'denied'/);
 assert.ok(flow.indexOf("Alert.alert('Notifiche attive'")<flow.indexOf('await maybePromptFrontendBiometricSetup'));
 const snapshot=source.slice(source.indexOf('const persistFrontendBiometricSnapshot'),source.indexOf('const enableFrontendBiometricDirectly'));
 assert.match(snapshot,/enabledForProfile !== 'true'/);
 console.log('PASS: new customer, new salon, legacy migration, declined choice, corrupt legacy, notification branches and snapshot identity protection.');
})().catch(e=>{console.error(e);process.exit(1)});
