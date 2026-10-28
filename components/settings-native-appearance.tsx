import React from 'react';
import {Pressable, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAccessAppearance} from './access-premium';
import {NativeReadableText as Text, nativeSerif} from './owner-native-premium';
import {useOwnerNavigationPreference} from '../src/lib/owner-navigation-preference';
import {useOwnerNativeNavigation} from '../src/lib/use-owner-native-navigation';
import type {OwnerNavigationPreference} from '../src/lib/owner-navigation-layout';

const navigationChoices:{value:OwnerNavigationPreference;title:string;description:string;icon:React.ComponentProps<typeof Ionicons>['name']}[]=[
  {value:'auto',title:'Automatica',description:'Su un tablet ampio in orizzontale usa il menu a sinistra. In verticale o in una finestra stretta torna alla barra in basso.',icon:'tablet-landscape-outline'},
  {value:'bottom',title:'Barra in basso',description:'Mantieni la navigazione compatta anche sugli schermi grandi.',icon:'phone-portrait-outline'},
  {value:'sidebar',title:'Menu laterale',description:'Preferisci il menu a sinistra, anche in verticale se c’è spazio. Nelle finestre strette usa comunque la barra in basso.',icon:'albums-outline'},
];

export function SettingsNativeAppearance() {
  const {palette:p,mode,setMode}=useAccessAppearance();
  const {preference,hydrated,saving,error,setPreference}=useOwnerNavigationPreference();
  const {sidebar}=useOwnerNativeNavigation();
  const choose=(value:OwnerNavigationPreference)=>{void setPreference(value).catch(()=>undefined);};
  return <View style={{gap:24}}>
    <View style={{gap:12}}>
      <Text accessibilityRole="header" style={{fontSize:22,fontFamily:nativeSerif,color:p.ink}}>Tema</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{([['day','Chiaro','sunny-outline'],['night','Scuro','moon-outline'],['system','Automatico','contrast-outline']] as const).map(([value,title,icon])=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Tema ${title.toLowerCase()}`} accessibilityState={{checked:mode===value}} onPress={()=>setMode(value)} style={{flexGrow:1,flexBasis:120,minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,padding:12,borderRadius:13,borderWidth:1,borderColor:mode===value?p.action:p.border,backgroundColor:mode===value?p.action:p.field}}><Ionicons name={icon} size={19} color={mode===value?p.actionText:p.ink}/><Text style={{fontSize:14,color:mode===value?p.actionText:p.ink}}>{title}</Text></Pressable>)}</View>
      <Text style={{fontSize:13,lineHeight:20,color:p.muted}}>Automatico segue l’aspetto chiaro o scuro del dispositivo.</Text>
    </View>
    <View style={{gap:12,borderTopWidth:1,borderTopColor:p.line,paddingTop:22}}>
      <Text accessibilityRole="header" style={{fontSize:22,fontFamily:nativeSerif,color:p.ink}}>Navigazione</Text>
      <Text style={{fontSize:14,lineHeight:21,color:p.muted}}>La scelta vale solo su questo dispositivo. La disposizione si adatta allo spazio della finestra senza cambiare la sezione aperta.</Text>
      {navigationChoices.map(choice=><Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{checked:preference===choice.value,disabled:!hydrated}} disabled={!hydrated} accessibilityLabel={choice.title} onPress={()=>choose(choice.value)} style={{flexDirection:'row',alignItems:'flex-start',gap:12,padding:16,borderRadius:16,borderWidth:1,borderColor:preference===choice.value?p.action:p.border,backgroundColor:preference===choice.value?p.surface:p.field}}>
        <Ionicons name={choice.icon} size={24} color={p.ink} style={{flexShrink:0}}/>
        <View style={{flex:1,minWidth:0,gap:6}}><Text style={{fontSize:15,fontWeight:'600',color:p.ink}}>{choice.title}</Text><Text style={{fontSize:13,lineHeight:20,color:p.muted}}>{choice.description}</Text></View>
        <Ionicons name={preference===choice.value?'checkmark-circle':'ellipse-outline'} size={23} color={preference===choice.value?(p.night?'#A9C8B1':'#39704D'):p.muted} style={{flexShrink:0}}/>
      </Pressable>)}
      <View style={{flexDirection:'row',gap:9,padding:13,borderRadius:13,borderWidth:1,borderColor:p.border,backgroundColor:p.field}}><Ionicons name="information-circle-outline" size={20} color={p.muted}/><Text accessibilityLiveRegion="polite" style={{flex:1,fontSize:13,lineHeight:20,color:p.muted}}>{!hydrated?'Caricamento della preferenza…':preference==='sidebar'&&!sidebar?'Menu laterale selezionato. In questa finestra manca lo spazio necessario: per ora resta la barra in basso. Il menu ricompare allargando la finestra.':sidebar?'Ora è attivo il menu laterale.':'Ora è attiva la barra in basso.'}</Text></View>
      {saving?<Text accessibilityLiveRegion="polite" style={{fontSize:13,color:p.muted}}>Salvataggio sul dispositivo…</Text>:null}
      {error?<View style={{gap:8}}><Text accessibilityRole="alert" style={{fontSize:13,lineHeight:20,color:p.night?'#EDB0B0':'#A43E3E'}}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Salva di nuovo la preferenza" onPress={()=>choose(preference)} style={{alignSelf:'flex-start',minHeight:44,justifyContent:'center',paddingHorizontal:14,borderWidth:1,borderColor:p.border,borderRadius:12}}><Text style={{fontSize:14,color:p.ink}}>Riprova</Text></Pressable></View>:null}
    </View>
  </View>;
}
