import {HapticTouchable as Pressable} from './ui/haptic-touchable';
import {useAppContext} from '../src/context/AppContext';
import React, {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {useCashDevicePrivacy,loadNativeCashPrivacy,nativeCashKey} from '../src/lib/cash-device-privacy.native';
import {verifyCashOwnerPassword} from '../src/lib/cash-owner-verification';
import {useCashLockedPermissions,type CashLockedPermissions} from '../src/lib/cash-locked-permissions';
import {useAccessAppearance} from './access-premium';
import {NativePremiumScope,NativeReadableText as Text,NativeSectionHeader} from './owner-native-premium';
import {NativeSettingsPopup} from './native-settings-popup';

export type CashAccessControls={enabled:boolean;locked:boolean;permissions:CashLockedPermissions;setPermission:(key:keyof CashLockedPermissions,value:boolean)=>void;onConfigure:()=>void;onLock:()=>void;onUnlock:()=>void};
export function CashDeviceGate({scope,email,active,children}:{scope:string;email:string;active:boolean;children:(access:CashAccessControls)=>React.ReactNode}) {
  const {requestOwnerPasswordReset}=useAppContext();
  const [recoveryOpen,setRecoveryOpen]=useState(false),[recoveryMessage,setRecoveryMessage]=useState('');
  const sendRecovery=async()=>{
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setRecoveryMessage('');
    try{const result=await requestOwnerPasswordReset(email);setRecoveryMessage(result.ok?'Link di recupero inviato. Controlla l’email dell’account SalonPro.':result.error||'Invio non riuscito. Riprova.');}
    catch{setRecoveryMessage('Connessione non disponibile. Riprova.');}
    finally{busyRef.current=false;setBusy(false);}
  };
  const {palette:p}=useAccessAppearance();
  const {enabled,setEnabled}=useCashDevicePrivacy(scope);
  const {permissions,setPermission}=useCashLockedPermissions(scope);
  const [unlockedScope,setUnlockedScope]=useState<string|null>(null);
  const [intent,setIntent]=useState<'unlock'|'settings'|'enroll'|null>(null);
  const [password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [biometric,setBiometric]=useState({available:false,enrolled:false});
  const version=useRef(0),busyRef=useRef(false);
  const unlocked=unlockedScope===scope;
  useEffect(()=>{
    version.current++;
    setUnlockedScope(null);setIntent(null);setPassword('');setError('');setBiometric({available:false,enrolled:false});
    const invalidate=()=>{version.current++;};
    return invalidate;
  },[scope]);
  useEffect(()=>{
    const generation=++version.current;
    if(!active){setIntent(null);setPassword('');return;}
    void Promise.all([LocalAuthentication.hasHardwareAsync(),LocalAuthentication.isEnrolledAsync(),SecureStore.getItemAsync(nativeCashKey(scope,'biometric-enabled'))]).then(([hardware,enrolled,record])=>{
      if(version.current===generation)setBiometric({available:hardware&&enrolled,enrolled:record===scope});
    }).catch(()=>undefined);
    const invalidate=()=>{version.current++;};
    return invalidate;
  },[scope,active]);
  const close=()=>{if(!busyRef.current){setIntent(null);setPassword('');setError('');}};
  const open=(next:typeof intent)=>{setError('');setPassword('');setIntent(next);};
  const verify=async(useBiometric=false)=>{
    if(busyRef.current||!scope||(!useBiometric&&!password))return;
    const generation=version.current,requestedIntent=intent;
    busyRef.current=true;setBusy(true);setError('');
    try {
      if(useBiometric){
        const marker=await SecureStore.getItemAsync(nativeCashKey(scope,'biometric'),{requireAuthentication:true,authenticationPrompt:'Sblocca la Cassa del salone'});
        if(marker!==scope)throw new Error('Sblocco biometrico da configurare di nuovo. Usa la password del titolare.');
      } else await verifyCashOwnerPassword(password,email);
      if(version.current!==generation)return;
      if(requestedIntent==='enroll') {
        await SecureStore.setItemAsync(nativeCashKey(scope,'biometric'),scope,{requireAuthentication:true,authenticationPrompt:'Abilita Face ID o impronta per la Cassa'});
        if(version.current!==generation)return;
        await SecureStore.setItemAsync(nativeCashKey(scope,'biometric-enabled'),scope);
        setBiometric(current=>({...current,enrolled:true}));
      } else if(requestedIntent==='settings') await setEnabled(!enabled);
      if(version.current!==generation)return;
      setUnlockedScope(scope);setIntent(null);setPassword('');
    } catch(e) {if(version.current===generation)setError(e instanceof Error?e.message:'Verifica non completata. Puoi usare la password.');}
    finally {busyRef.current=false;setBusy(false);setPassword('');}
  };
  const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={action} disabled={disabled||busy} style={{minHeight:46,padding:13,borderRadius:13,borderWidth:1,borderColor:p.border,backgroundColor:p.action,alignItems:'center',opacity:disabled||busy?.5:1}}><Text style={{color:p.actionText,fontSize:14,fontWeight:'500'}}>{label}</Text></Pressable>;
  // Only an unknown setting blocks the page; a locked Cassa stays usable in reserved mode.
  const locked=enabled===null;
  return <NativePremiumScope.Provider value={true}>
    {locked?<View style={{flex:1,padding:20,paddingTop:54,gap:18}}><NativeSectionHeader title="Cassa"/><Ionicons name="lock-closed-outline" size={34} color={p.ink}/><Text style={{fontSize:21,lineHeight:28,color:p.ink}}>Riservata al titolare</Text><Text style={{fontSize:14,lineHeight:21,color:p.muted}}>Sblocca per consultare incassi e movimenti. Una volta aperta, la Cassa resta disponibile finché premi Blocca Cassa.</Text>{enabled===null?<><ActivityIndicator color={p.ink}/>{button('Riprova verifica accesso',()=>{void loadNativeCashPrivacy(scope).catch(e=>setError(e instanceof Error?e.message:'Verifica non disponibile.'));})}</>:<>{button('Sblocca con password',()=>open('unlock'))}{biometric.available&&biometric.enrolled?button('Sblocca con Face ID o impronta',()=>{open('unlock');void verify(true);}):null}</>}{error?<Text accessibilityRole="alert" style={{color:p.night?'#F1B5B5':'#9C3939'}}>{error}</Text>:null}</View>:children({enabled:enabled===true,locked:enabled===true&&!unlocked,permissions,setPermission:(key,value)=>{if(enabled!==true||unlocked)setPermission(key,value);},onUnlock:()=>open('unlock'),onConfigure:()=>open('settings'),onLock:()=>setUnlockedScope(null)})}
    {active&&intent?<NativeSettingsPopup premiumWeb compact title={intent==='settings'?'Protezione della Cassa':intent==='enroll'?'Configura sblocco biometrico':'Sblocca Cassa'} icon="shield-checkmark-outline" onClose={close}>
      <View style={{gap:16}}><Text style={{fontSize:14,lineHeight:22,color:p.muted}}>{intent==='settings'?enabled?'La protezione è attiva. Conferma la password del titolare per disattivarla.':'La protezione è facoltativa e parte disattivata. Conferma la password del titolare per attivarla su questo dispositivo.':intent==='enroll'?'Conferma la password del titolare. Il telefono proteggerà lo sblocco con Face ID o impronta.':'Inserisci la password dell’account del titolare.'}</Text>
        <Text style={{fontSize:12,lineHeight:18,color:p.muted}}>Password dell’account SalonPro · non viene creata una password separata per la Cassa.</Text>
        <TextInput accessibilityLabel="Password del titolare" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" value={password} onChangeText={setPassword} editable={!busy} onSubmitEditing={()=>{void verify();}} style={{minHeight:50,fontSize:16,padding:14,color:p.ink,backgroundColor:p.field,borderWidth:1,borderColor:p.line,borderRadius:13}}/>
        {error?<Text accessibilityRole="alert" style={{color:p.night?'#F1B5B5':'#9C3939'}}>{error}</Text>:null}
        {button(busy?'Verifica in corso':intent==='settings'?enabled?'Disattiva protezione':'Attiva protezione':intent==='enroll'?'Abilita Face ID o impronta':'Sblocca',()=>{void verify();},!password)}
        <Pressable accessibilityRole="button" disabled={busy} onPress={()=>setRecoveryOpen(v=>!v)} style={{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:10,minHeight:40}}><Text style={{fontSize:13,color:p.muted}}>Password dimenticata?</Text></Pressable>{recoveryOpen?<View style={{gap:12,padding:14,borderWidth:1,borderColor:p.border,borderRadius:12,backgroundColor:p.field}}><Text style={{fontSize:13,lineHeight:20,color:p.muted}}>Invia il link per recuperare la password dell’account SalonPro a {email}. Cambierà anche la password di accesso al salone.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void sendRecovery()} style={{padding:12,minHeight:44,borderRadius:10,backgroundColor:p.action,alignItems:'center'}}><Text style={{fontSize:13,color:p.actionText}}>{busy?'Invio in corso…':'Conferma invio link'}</Text></Pressable>{recoveryMessage?<Text accessibilityRole="alert" style={{fontSize:13,lineHeight:20,color:p.ink}}>{recoveryMessage}</Text>:null}</View>:null}
        {intent==='settings'&&enabled&&biometric.available?button(biometric.enrolled?'Riconfigura Face ID o impronta':'Configura Face ID o impronta',()=>open('enroll')):null}
        {intent==='unlock'&&biometric.available&&biometric.enrolled?button('Usa Face ID o impronta',()=>{void verify(true);}):null}
      </View>
    </NativeSettingsPopup>:null}
  </NativePremiumScope.Provider>;
}
