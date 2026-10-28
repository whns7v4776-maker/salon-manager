/* global __dirname */
/** Offline QA of the actual customer UI. Identity/catalog providers are fixtures. No remote writes. */
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),out='/tmp/salonpro-client-booking-qa';
fs.mkdirSync(out,{recursive:true});
const mod=name=>JSON.stringify(path.join(root,name));
const entry=`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {View,Text,Pressable} from 'react-native';
import {SafeAreaProvider,SafeAreaInsetsContext} from 'react-native-safe-area-context';
import {useFonts} from 'expo-font';
import {Manrope_400Regular,Manrope_500Medium,Manrope_600SemiBold,Manrope_700Bold} from '@expo-google-fonts/manrope';
import {Appearance,day,night} from ${mod('components/access-appearance-context')};
import {AccessBackdrop} from ${mod('components/access-premium')};
import {PremiumWebInteractions} from ${mod('components/ui/premium-web-interactions')};
import {ClientBookingFrame} from ${mod('components/client-booking-frame')};
import {ClientBookingLayoutProvider} from ${mod('components/client-booking-layout')};
import {ClientBookingLoading} from ${mod('components/client-booking-loading')};
import {ClientServiceChoice} from ${mod('components/client-service-choice')};
import {ClientPremiumNavigation} from ${mod('components/client-premium-chrome')};
import {Ionicons} from '@expo/vector-icons';
const params=new URLSearchParams(window.location.search),initialStep=Math.max(0,Math.min(4,Number(params.get('step'))||0));
const services=[{id:'piega',name:'Piega',duration:'30 min',price:18,role:'Hair Stylist',roleColor:'#87B8FF'},{id:'colore',name:'Colore',duration:'1 ora',price:40,role:'Hair Stylist',roleColor:'#87B8FF',processingMinutes:30,linked:true},{id:'combo',name:'Colore + Piega',duration:'2 ore',price:100,role:'Hair Stylist',roleColor:'#87B8FF',processingMinutes:30},{id:'taglio',name:'Taglio Donna',duration:'30 min',price:20,role:'Hair Stylist',roleColor:'#87B8FF'},{id:'barba',name:'Barba',duration:'30 min',price:20,role:'Barber',roleColor:'#E9CC75'},{id:'long',name:'Taglio, colore e trattamento ristrutturante personalizzato',duration:'2 ore e 15 min',price:1250,role:'Hair Stylist',roleColor:'#87B8FF'}];
const days=Array.from({length:61},(_,index)=>{const d=new Date(2026,10,1+index,12),value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),closed=d.getDay()===0;return {value,weekday:d.toLocaleDateString('it-IT',{weekday:'short'}),number:String(d.getDate()),month:d.toLocaleDateString('it-IT',{month:'short'}),label:d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'}),disabled:closed,pending:false,status:closed?'Chiuso':'Disponibile'};});
const operators=[{id:'martina',name:'Martina',role:'Hair Stylist',roleColor:'#87B8FF'},{id:'sofia',name:'Sofia',role:'Hair Stylist',roleColor:'#87B8FF'}];
function QA(){
 const [fonts]=useFonts({Manrope_400Regular,Manrope_500Medium,Manrope_600SemiBold,Manrope_700Bold,...Ionicons.font});
 const [dark,setDark]=useState(params.get('theme')==='dark'),[page,setPage]=useState(initialStep),[service,setService]=useState(params.get('service')||(initialStep?'piega':'')),[date,setDate]=useState(initialStep>1?'2026-11-10':''),[operator,setOperator]=useState(initialStep>2?operators[0]:null),[time,setTime]=useState(params.get('time')||(initialStep>3?'10:00':'')),[note,setNote]=useState(''),[filter,setFilter]=useState(''),[expanded,setExpanded]=useState(false),[pairing,setPairing]=useState(params.get('paired')==='1'),[details,setDetails]=useState(''),[result,setResult]=useState(''),[tab,setTab]=useState('booking');
 const mode=params.get('scenario')||'normal',p=dark?night:day,selected=services.find(s=>s.id===service),dependency=service==='colore';
 const pages=[{key:'service',label:'Servizio',complete:!!service&&(!dependency||pairing)},{key:'day',label:'Giorno',complete:!!date},{key:'operator',label:'Operatore',complete:!!operator},{key:'time',label:'Orario',complete:!!time},{key:'review',label:'Riepilogo',complete:false}];
 const limit=pages.findIndex(item=>!item.complete),shownPage=Math.min(page,limit),filtered=services.filter(s=>!filter||s.role===filter);
 const row=(name,symbol)=><View style={{minHeight:51,flexDirection:'row',alignItems:'center',gap:11}}><Ionicons name={symbol} size={19} color={p.muted}/><Text style={{flex:1,color:p.ink,fontSize:12,fontFamily:'Manrope_400Regular'}}>{name}</Text></View>;
 const props={pages,page:shownPage,limit,onPage:setPage,
  services:filtered.slice(0,expanded?100:4).map(s=><ClientServiceChoice key={s.id} {...s} selected={service===s.id} onDetails={()=>setDetails(s.name)} onSelect={()=>{setService(service===s.id?'':s.id);setDate('');setOperator(null);setTime('');setPairing(false);}}/>),
  filters:[{key:'',label:'Tutti',count:services.length},{key:'Hair Stylist',label:'Hair Stylist',count:5},{key:'Barber',label:'Barber',count:1}],filter,onFilter:setFilter,hasMoreServices:filtered.length>4,expandedServices:expanded,onExpandServices:()=>setExpanded(v=>!v),
  serviceSelectionKey:service,dependencyRequired:dependency,dependencies:<ClientServiceChoice name="Piega collegata" duration="30 min" price={18} selected={pairing} onSelect={()=>setPairing(v=>!v)} onDetails={()=>setDetails('Piega collegata')}/>,automaticDependency:service==='combo'?'Piega':undefined,
  phase:selected?.processingMinutes?{initialLabel:'Colore',initialDurationMinutes:30,processingLabel:'Posa',processingDurationMinutes:30,finalServiceName:pairing?'Piega':'',finalDurationMinutes:pairing?30:0}:undefined,linkedServiceNames:pairing?['Piega collegata']:undefined,
  dayError:mode==='day-error',onRetryDays:()=>setResult('Riprova simulata'),days,date,dateConfirmed:!!date,onDate:v=>{setDate(v);setTime('');},onPrepareDate:()=>{},operators,operatorId:operator?.id||'',automaticAvailable:true,automaticSelected:operator?.id==='auto',onOperator:v=>{setOperator(v||{id:'auto',name:'Assegnazione del salone'});setTime('');},
  recommended:mode==='empty'?[]:['09:00','09:15','09:30','10:00','10:15','10:30'].map(value=>({value,disabled:false})),additional:mode==='empty'?[]:['14:00','14:15','14:30','15:00','16:00','17:00','18:00'].map(value=>({value,disabled:mode==='unavailable',hint:mode==='unavailable'?'Non più disponibile':undefined})),
  waitlistChoices:[{key:'day',label:'Tutta la giornata',hint:'Ricevi un avviso se si libera un posto.',active:false,busy:false,onPress:()=>setResult('Avviso di prova. Nessun invio al server.')}],time,loadingTimes:mode==='loading',timeError:mode==='error'?'Disponibilità temporaneamente non disponibile.':undefined,onTime:v=>setTime(v===time?'':v),onRetryTimes:()=>setResult('Riprova simulata'),onWaitlist:()=>setTab('waitlist'),
  serviceName:selected?selected.name+(pairing?' + Piega':''):'',duration:pairing?'1 ora e 30 min':selected?.duration||'',operatorName:operator?.name||'',customerName:'Anna Rossi',total:(selected?.price||0)+(pairing?18:0),note,onNote:setNote,
  reviewBenefits:row('Pacchetti e vantaggi','gift-outline'),reviewPayment:row('Pagamento in salone','card-outline'),reviewExtras:null,canSubmit:!!time,submitLabel:mode==='prepayment'?'Conferma e paga':'Invia prenotazione',submitting:false,onSubmit:()=>setResult('Prova completata. Nessuna prenotazione inviata.')};
 const items=[['booking','Prenota','calendar-outline'],['notifications','Notifiche','notifications-outline'],['communications','Comunicazioni','megaphone-outline'],['waitlist','Slot liberati','time-outline'],['settings','Impostazioni','settings-outline']].map(([key,label,icon])=>({key,label,icon,badge:key==='notifications'?3:undefined,selected:tab===key,onPress:()=>setTab(key)}));
 return <Appearance.Provider value={{palette:p,mode:dark?'night':'day',setMode:m=>setDark(m==='night'),toggle:()=>setDark(v=>!v)}}><ClientBookingLayoutProvider><PremiumWebInteractions night={dark}/><View style={{height:'100%',minHeight:0,overflow:'hidden',backgroundColor:p.canvas}}><AccessBackdrop/>
 {mode==='boot'||!fonts?<ClientBookingLoading workspaceId="fixture" salonName="SalonBarber’s"/>:tab==='booking'?<ClientBookingFrame journey={props} workspaceId="fixture" salonName="SalonBarber’s" shop={<Pressable accessibilityRole="button" accessibilityLabel="Apri lo shop del salone" onPress={()=>setResult('Shop di prova')} style={{minHeight:44,paddingHorizontal:10,borderWidth:1,borderColor:p.border,borderRadius:14,backgroundColor:p.surface,flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="bag-handle-outline" size={17} color={p.ink}/><Text style={{color:p.ink,fontSize:11,fontFamily:'Manrope_600SemiBold'}}>Shop</Text></Pressable>}/>:<View style={{padding:30,paddingLeft:250}}><Text style={{color:p.ink,fontSize:30}}>{items.find(i=>i.key===tab)?.label}</Text></View>}
 <ClientPremiumNavigation items={items} workspaceId="fixture" salonName="SalonBarber’s"/>
 {details||result?<View accessibilityRole="alert" style={{position:'absolute',top:30,left:20,right:20,padding:20,borderRadius:18,backgroundColor:p.canvas,borderWidth:1,borderColor:p.border}}><Text style={{color:p.ink}}>{details||result}</Text><Pressable accessibilityRole="button" accessibilityLabel="Chiudi prova" onPress={()=>{setDetails('');setResult('');}} style={{padding:12}}><Text style={{color:p.ink}}>Chiudi</Text></Pressable></View>:null}
 </View></ClientBookingLayoutProvider></Appearance.Provider>;
}
const inset=params.get('safe')==='1'?{top:59,bottom:35,left:0,right:0}:{top:0,bottom:0,left:0,right:0};
createRoot(document.getElementById('root')).render(<SafeAreaProvider><SafeAreaInsetsContext.Provider value={inset}><QA/></SafeAreaInsetsContext.Provider></SafeAreaProvider>);
`;
fs.writeFileSync(path.join(out,'entry.tsx'),entry);
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>SalonPro · QA componenti reali</title><style>html,body,#root{height:100%;margin:0;overflow:hidden}body{font-family:system-ui,sans-serif}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
const fixtures={
 'src/context/AppContext.tsx':'export const useAppContext=()=>({salonWorkspace:{id:"fixture",salonName:"SalonBarber’s"}});',
 'src/lib/salon-brand-placements.ts':'export const useSalonBrandPlacement=()=>({value:null});',
 'src/lib/salon-logo-plaque.ts':'export const useSalonPlaque=()=>null;export const plaqueUrl=p=>p;',
 'components/owner-premium-web.tsx':'export const OWNER_RAIL_WIDTH=224;export const OwnerPremiumCompactAppearance=()=>null;'
};
esbuild.build({entryPoints:[path.join(out,'entry.tsx')],outfile:path.join(out,'bundle.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{global:'globalThis','process.env':'{}','process.env.EXPO_OS':'"web"','process.env.NODE_ENV':'"production"',__DEV__:'false'},alias:{'react-native':'react-native-web'},nodePaths:[path.join(root,'node_modules')],resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json'],loader:{'.js':'jsx','.png':'file','.jpg':'file','.jpeg':'file','.ttf':'file','.webp':'file','.svg':'file'},plugins:[{name:'offline-provider-fixtures',setup(build){build.onLoad({filter:/\.(tsx|ts)$/},args=>{const relative=path.relative(root,args.path);return fixtures[relative]?{contents:fixtures[relative],loader:'tsx'}:null;});}}],logLevel:'warning'}).then(()=>{const file=path.join(out,'index.html');const hash=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(out,'bundle.js'))).digest('hex').slice(0,12);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('/bundle.js','/bundle.js?v='+hash));console.log(out);}).catch(()=>process.exitCode=1);
