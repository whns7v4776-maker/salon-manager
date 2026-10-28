import {OwnerWebPageTitle} from './owner-web-page-title';
import { SettingsNativeAppearance } from './settings-native-appearance';
import { NativePremiumScope, NativeReadableText as Text, NativeSectionHeader, nativeSerif } from './owner-native-premium';
import { NativeSettingsPopup } from './native-settings-popup';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MetaMeasurementLink } from './meta-measurement-link';
import { OwnerBrandMark } from './salon-brand-mark';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppContext } from '../src/context/AppContext';
import { getAppLanguageOptions, type AppLanguage } from '../src/lib/i18n';
import { useAccessAppearance } from './access-premium';
import { OwnerPremiumPopup } from './owner-premium-sheet';
import { SettingsSalonProfileWeb, SettingsProfileProvider } from './settings-salon-profile-web';
import { DirectorySettings } from './salon-discovery/directory-settings';
import { CustomerRegistrationSettingsCard } from './customer-registration-settings-card';
import { BookingPaymentPolicyEditor } from './booking-payment-policy-editor';
import SupportScreen from '../app/support';
import { CashDeviceGate } from './cash-device-gate';
import { SALONPRO_TUTORIALS_URL } from '../src/lib/help-links';

type Section='appearance'|'profile'|'directory'|'booking'|'language'|'notifications'|'security'|'subscription'|'support'|'guide';
type Props={
 active:boolean;
 language:AppLanguage; languageOptions:ReturnType<typeof getAppLanguageOptions>; onLanguage:(value:AppLanguage)=>void;
 biometric:{title:string;description:string;enabled:boolean;busy:boolean;onPress:()=>void};
 notifications:{title:string;description:string;enabled:boolean;busy:boolean;onPress:()=>void};
 subscription:{title:string;price:string;remaining:string;renewal:string};
 google:{url:string;previewUrl:string;feedback:string;onCopy:()=>void};
 salonCode:string;onLogout:()=>Promise<void>;onGuide:()=>void;
};
const sections:{key:Section;title:string;icon:React.ComponentProps<typeof Ionicons>['name'];group:string}[]=[
 {key:'profile',title:'Profilo del salone',icon:'storefront-outline',group:'Salone'},
 {key:'directory',title:'Vetrina SalonPro',icon:'images-outline',group:'Salone'},
 {key:'booking',title:'Prenotazioni online',icon:'calendar-outline',group:'Salone'},
 ...(Platform.OS!=='web'?[{key:'appearance' as const,title:'Aspetto e navigazione',icon:'color-palette-outline' as const,group:'Preferenze'}]:[]),
 {key:'language',title:'Lingua',icon:'globe-outline',group:'Preferenze'},
 {key:'notifications',title:'Notifiche',icon:'notifications-outline',group:'Preferenze'},
 {key:'security',title:'Accesso e sicurezza',icon:'shield-checkmark-outline',group:'Preferenze'},
 {key:'subscription',title:'Abbonamento',icon:'card-outline',group:'Account'},
 {key:'support',title:'Assistenza',icon:'headset-outline',group:'Account'},
 {key:'guide',title:'Guida SalonPro',icon:'book-outline',group:'Account'},
];

export function SettingsWebWorkspace(props:Props){
 const {palette:p,toggle}=useAccessAppearance();const {width}=useWindowDimensions();const router=useRouter();
 const {salonWorkspace:w,salonAccountEmail,refreshOwnerSubscriptionFromServer,showOnboarding}=useAppContext();
 const [selected,setSelected]=useState<Section>('profile'),[mobileOpen,setMobileOpen]=useState(false);
 const [pendingAction,setPendingAction]=useState<(()=>void)|null>(null);
 const leaveSettingsEditor=(action:()=>void)=>{setMobileOpen(false);setGoogleGuideOpen(false);setPendingAction(()=>action);};
 useEffect(()=>{if(!pendingAction)return;setPendingAction(null);pendingAction();},[pendingAction]);
 const [googleGuideOpen,setGoogleGuideOpen]=useState(false);
 const [cashPrivacyOpen,setCashPrivacyOpen]=useState(false);
 const [tutorialError,setTutorialError]=useState('');
 const openTutorials=()=>{setTutorialError('');void Linking.openURL(SALONPRO_TUTORIALS_URL).catch(()=>setTutorialError('Non riesco ad aprire i video. Riprova.'));};
 const cashScope=w.id&&salonAccountEmail?`${w.id}:${salonAccountEmail.toLowerCase()}`:'';
 const [refreshing,setRefreshing]=useState(false),[refreshMessage,setRefreshMessage]=useState('');
 const [logoutOpen,setLogoutOpen]=useState(false),[logoutBusy,setLogoutBusy]=useState(false),[logoutError,setLogoutError]=useState('');
 const native=Platform.OS!=='web';
 const insets=useSafeAreaInsets();
 const wide=!native&&width>=1150;
 const wasWide=useRef(wide);
 useEffect(()=>{if(props.active&&!showOnboarding&&wasWide.current&&!wide&&!googleGuideOpen&&!logoutOpen)setMobileOpen(true);wasWide.current=wide;},[wide,props.active,googleGuideOpen,logoutOpen,showOnboarding]);
 const current=sections.find(s=>s.key===selected)!;
 const title=(text:string)=><Text style={{fontSize:22,fontFamily:nativeSerif,color:p.ink}}>{text}</Text>;
 const copy=(text:string)=><Text style={{fontSize:14,lineHeight:22,color:p.muted}}>{text}</Text>;
 const action=(text:string,onPress:()=>void,primary=false,disabled=false)=><Pressable accessibilityRole="button" accessibilityLabel={text} onPress={onPress} disabled={disabled} style={{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8,minHeight:44,paddingHorizontal:16,paddingVertical:12,borderRadius:11,borderWidth:1,borderColor:p.border,backgroundColor:primary?p.action:p.field,opacity:disabled?.5:1}}><Text style={{fontSize:14,color:primary?p.actionText:p.ink}}>{text}</Text></Pressable>;
 const item=(label:string,description:string,icon:React.ComponentProps<typeof Ionicons>['name'],onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:18,borderBottomWidth:1,borderBottomColor:p.line}}><Ionicons name={icon} size={23} color={p.ink}/><View style={{flex:1,minWidth:0,gap:5}}><Text style={{fontSize:15,color:p.ink}}>{label}</Text>{copy(description)}</View><Ionicons name="chevron-forward" size={18} color={p.muted}/></Pressable>;
 const google=<View style={{gap:14,paddingTop:20,borderTopWidth:1,borderTopColor:p.line}}>{title('Il tuo salone su Google')}{copy('Aggiungi il link di prenotazione SalonPro alla scheda Google del tuo salone. Il cliente apre il tuo listino e sceglie quando prenotare.')}<Text selectable style={{fontSize:14,lineHeight:22,color:p.ink}}>{props.google.url}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{action('Copia link prenotazione',props.google.onCopy)}{action('Apri anteprima del salone',()=>void Linking.openURL(props.google.previewUrl))}</View>{action('Come collegare la scheda Google',()=>setGoogleGuideOpen(true))}{props.google.feedback?copy(props.google.feedback):null}</View>;
 const panel=()=>{
  switch(selected){
   case 'appearance':return <SettingsNativeAppearance/>;
   case 'profile':return <SettingsSalonProfileWeb/>;
   case 'directory':return <DirectorySettings key={w.id} workspace={w}/>;
   case 'booking':return <View style={{gap:22}}>{copy('Controlla l’accesso dei clienti, le regole di prenotazione e i pagamenti.')}<CustomerRegistrationSettingsCard/>{item('Regole di prenotazione','Accettazione automatica e slot guidati.','options-outline',()=>leaveSettingsEditor(()=>router.navigate({pathname:'/(tabs)/prenotazioni',params:{settingsRulesToken:String(Date.now())}} as any)))}{item('Disponibilità e orari','Orari del salone, pause, chiusure e periodi personalizzati.','time-outline',()=>leaveSettingsEditor(()=>router.navigate({pathname:'/(tabs)/agenda',params:{availabilityToken:String(Date.now()),availabilityFrom:'settings'}} as any)))}<BookingPaymentPolicyEditor workspaceId={w.id} standalone/>{google}</View>;
   case 'language':return <View style={{gap:18}}>{copy('Scegli la lingua dell’applicazione. Le lingue disponibili vengono mostrate qui sotto.')}<View style={{gap:10}}>{props.languageOptions.map(option=><Pressable key={option.value} accessibilityRole="radio" accessibilityState={{checked:props.language===option.value}} onPress={()=>props.onLanguage(option.value)} style={{flexDirection:'row',alignItems:'center',gap:14,borderWidth:1,borderColor:props.language===option.value?p.action:p.border,borderRadius:13,padding:16,backgroundColor:p.field}}><Ionicons name="globe-outline" size={22} color={p.ink}/><View style={{flex:1,gap:4}}><Text style={{fontSize:15,color:p.ink}}>{option.label}</Text><Text style={{fontSize:12,color:p.muted}}>{option.note}</Text></View><Ionicons name={props.language===option.value?'checkmark-circle':'ellipse-outline'} size={22} color={p.ink}/></Pressable>)}</View></View>;
   case 'notifications':return <View style={{gap:18}}>{copy(props.notifications.description)}<View style={{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderRadius:14,borderWidth:1,borderColor:p.border,backgroundColor:p.field}}><Ionicons name="notifications-outline" size={25} color={p.ink}/><Text style={{flex:1,color:p.ink,fontSize:15}}>{props.notifications.enabled?'Notifiche attive':'Notifiche non attive'}</Text></View>{action(props.notifications.title,props.notifications.onPress,false,props.notifications.busy)}</View>;
   case 'security':return <View style={{gap:18}}>{title(props.biometric.title)}{copy(props.biometric.description)}{action('Controlla sblocco biometrico',props.biometric.onPress,false,props.biometric.busy)}{item('Accesso riservato alla Cassa','Gestisci la protezione facoltativa della Cassa su questo dispositivo.','lock-closed-outline',()=>{if(native)leaveSettingsEditor(()=>router.navigate('/cassa' as any));else setCashPrivacyOpen(true);})}<MetaMeasurementLink/>{!native&&props.active&&cashPrivacyOpen?<CashDeviceGate scope={cashScope} email={salonAccountEmail} active settingsOnly onSettingsClose={()=>setCashPrivacyOpen(false)}>{()=>null}</CashDeviceGate>:null}</View>;
   case 'subscription':return <View style={{gap:20}}><View style={{flexDirection:'row',gap:14,alignItems:'center'}}><Ionicons name="shield-checkmark-outline" size={28} color={p.ink}/><View style={{flex:1,gap:5}}>{title(props.subscription.title)}{copy(props.subscription.price)}</View></View>{[['Tempo residuo',props.subscription.remaining],['Scadenza',props.subscription.renewal]].map(([label,value])=><View key={label} style={{gap:7,paddingVertical:14,borderBottomWidth:1,borderBottomColor:p.line}}><Text style={{fontSize:12,color:p.muted}}>{label}</Text><Text style={{fontSize:15,lineHeight:23,color:p.ink}}>{value}</Text></View>)}{action(refreshing?'Verifica in corso…':'Aggiorna stato abbonamento',()=>{setRefreshing(true);setRefreshMessage('');void refreshOwnerSubscriptionFromServer().then(r=>setRefreshMessage(r.ok?'Stato aggiornato dal server.':r.error||'Verifica non completata.')).finally(()=>setRefreshing(false));},false,refreshing)}{refreshMessage?copy(refreshMessage):null}</View>;
   case 'support':return <SupportScreen embedded/>;
   case 'guide':return <View style={{gap:20}}>{copy('Rivedi la guida completa: servizi, mestieri, operatori, clienti, personalizzazioni, QR e codice salone, Agenda, orari e richieste online. Puoi saltarla in qualsiasi momento.')}<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{action('Riapri la guida',()=>setPendingAction(()=>props.onGuide),true)}{action('Video tutorial',openTutorials)}</View>{copy('Guarda le videoguide per argomento nella raccolta online. Alcune schermate possono differire dalla nuova grafica.')}{tutorialError?<Text accessibilityRole="alert" style={{fontSize:14,color:p.ink}}>{tutorialError}</Text>:null}</View>;
  }
 };
 const googleGuidePopup=props.active&&!showOnboarding&&googleGuideOpen?<SettingsPopup title="Il tuo salone su Google" icon="link-outline" onClose={()=>setGoogleGuideOpen(false)}><View style={{gap:20}}>{copy('Collega il tuo link SalonPro alla scheda Google del salone.')} {[
   ['Apri la scheda Google','Accedi con l’account che gestisce il salone.'],
   ['Vai su Prenotazione','Seleziona “Aggiungi link”.'],
   ['Incolla il link e salva','Google lo verifica prima di mostrarlo.'],
  ].map(([label,detail],index)=><View key={label} style={{flexDirection:'row',gap:12,alignItems:'flex-start'}}><View style={{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:p.field,borderWidth:1,borderColor:p.border}}><Text style={{fontSize:14,color:p.ink}}>{index+1}</Text></View><View style={{flex:1,gap:5}}><Text style={{fontSize:15,color:p.ink}}>{label}</Text>{copy(detail)}</View></View>)}<Text selectable style={{fontSize:14,lineHeight:22,color:p.ink}}>{props.google.url}</Text>{action('Copia link prenotazione',props.google.onCopy)}{props.google.feedback?copy(props.google.feedback):null}</View></SettingsPopup>:null;
 return <NativePremiumScope.Provider value={true}><SettingsProfileProvider><View {...{dataSet:{settingsWeb:'true'}}} style={{flex:1,minHeight:0}}>
  {!native&&React.createElement('style',null,`
  [data-settings-web],[data-settings-web] *{min-width:0;box-sizing:border-box;}
  [data-settings-web] [dir=auto]{word-break:normal;}
  [data-settings-profile-columns]{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(240px,1fr);}
  [data-settings-profile-fields]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));}
  [data-settings-web] input:focus{outline:none!important;box-shadow:none!important;border-color:${p.muted}!important;}
  @media(max-width:900px){[data-settings-profile-columns]{grid-template-columns:minmax(0,1fr);}}
  @media(max-width:420px){[data-settings-profile-fields]{grid-template-columns:minmax(0,1fr);}}
  `)}
  <ScrollView style={{flex:1}} contentContainerStyle={{padding:native?(width<600?18:28):24,paddingTop:native?Math.max(insets.top,12):24,paddingBottom:native?insets.bottom+110:width<1000?110:32,gap:18}} keyboardShouldPersistTaps="handled">
   <View style={{width:'100%',maxWidth:1450,alignSelf:'center',gap:native?2:24}}>{native?<NativeSectionHeader title="Impostazioni"/>:<>{Platform.OS!=='web'&&width<1000?<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:64}}><OwnerBrandMark compact/><Pressable accessibilityRole="button" accessibilityLabel={p.night?'Attiva tema chiaro':'Attiva tema scuro'} onPress={toggle} style={{width:38,height:38,borderWidth:1,borderColor:p.border,borderRadius:19,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name={p.night?'sunny-outline':'moon-outline'} size={20} color={p.ink}/></Pressable></View>:null}<View style={{gap:6}}><OwnerWebPageTitle>Impostazioni</OwnerWebPageTitle><Text style={{fontSize:14,lineHeight:21,color:p.muted}}>Il tuo salone, le preferenze e il tuo account.</Text></View></>}
    <View {...{dataSet:{settingsWebColumns:'true'}}} style={{flexDirection:wide?'row':'column',alignItems:'flex-start',gap:20}}>
     <View style={{width:wide?260:'100%',gap:18}}><View style={{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderWidth:1,borderColor:p.border,borderRadius:18,backgroundColor:p.surface}}><View style={{width:46,height:46,borderRadius:23,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Text style={{color:p.ink,fontFamily:nativeSerif,fontSize:20}}>{w.salonName.split(/\s+/).map(s=>s[0]).slice(0,2).join('')}</Text></View><View style={{flex:1,gap:5}}><Text style={{color:p.ink,fontSize:16}}>{w.salonName}</Text><Text style={{color:p.muted,fontSize:12}}>Account attivo · {props.salonCode}</Text></View></View>
     {['Salone','Preferenze','Account'].map(group=><View key={group} style={{gap:8}}><Text style={{color:p.muted,fontSize:12,paddingHorizontal:10}}>{group}</Text><View style={{borderRadius:18,overflow:'hidden',borderWidth:1,borderColor:p.border,backgroundColor:p.surface}}>{sections.filter(s=>s.group===group).map((s,index)=><Pressable key={s.key} accessibilityRole="button" accessibilityLabel={`Apri ${s.title}`} onPress={()=>{setSelected(s.key);if(!wide)setMobileOpen(true);}} style={{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:16,minHeight:54,borderTopWidth:index?1:0,borderTopColor:p.line,backgroundColor:wide&&selected===s.key?p.field:'transparent'}}><Ionicons name={s.icon} size={23} color={p.ink}/><Text style={{flex:1,fontSize:14,color:p.ink}}>{s.title}</Text><Ionicons name="chevron-forward" size={17} color={p.muted}/></Pressable>)}</View></View>)}
     <Pressable accessibilityRole="button" accessibilityLabel="Esci dal salone" onPress={()=>{if(native)void props.onLogout();else setLogoutOpen(true);}} style={{flexDirection:'row',gap:12,padding:16,borderWidth:1,borderColor:p.border,borderRadius:15,backgroundColor:p.field}}><Ionicons name="log-out-outline" size={22} color={p.night?'#E7AAAA':'#A53B3B'}/><Text style={{fontSize:14,color:p.night?'#E7AAAA':'#A53B3B'}}>Esci</Text></Pressable></View>
     {wide?<View style={{flex:1,minWidth:0,borderWidth:1,borderColor:p.border,borderRadius:21,backgroundColor:p.surface,padding:24,gap:18}}><Text accessibilityRole="header" style={{fontSize:25,fontFamily:nativeSerif,color:p.ink}}>{selected==='profile'?'Informazioni del salone':current.title}</Text>{panel()}</View>:null}
    </View><Text selectable style={{fontSize:12,color:p.muted,lineHeight:19}}>{w.ownerEmail||salonAccountEmail}</Text>
   </View>
  </ScrollView>
  {props.active&&!showOnboarding&&!pendingAction&&!wide&&mobileOpen?<SettingsPopup title={current.title} icon={current.icon} onClose={()=>setMobileOpen(false)}>{panel()}{native?googleGuidePopup:null}</SettingsPopup>:null}
  {native?null:googleGuidePopup}
  {props.active&&!showOnboarding&&logoutOpen?<SettingsPopup title="Esci dal salone" icon="log-out-outline" dismissDisabled={logoutBusy} onClose={()=>setLogoutOpen(false)}><View style={{gap:18}}>{copy('Conferma per uscire dal back office. I dati del salone restano salvati.')}{logoutError?<Text accessibilityRole="alert" style={{color:p.ink}}>{logoutError}</Text>:null}<View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-end',gap:10}}>{action('Annulla',()=>setLogoutOpen(false),false,logoutBusy)}{action(logoutBusy?'Uscita…':'Esci',()=>{setLogoutBusy(true);setLogoutError('');void props.onLogout().catch(()=>setLogoutError('Uscita non completata. Riprova.')).finally(()=>setLogoutBusy(false));},true,logoutBusy)}</View></View></SettingsPopup>:null}
 </View></SettingsProfileProvider></NativePremiumScope.Provider>;
}

function SettingsPopup(props:React.ComponentProps<typeof OwnerPremiumPopup>){
 if(Platform.OS==='web')return <OwnerPremiumPopup {...props}/>;
 return <NativeSettingsPopup title={props.title} icon={props.icon} onClose={props.onClose} premiumWeb footer={props.footer}>{props.children}</NativeSettingsPopup>;
}
