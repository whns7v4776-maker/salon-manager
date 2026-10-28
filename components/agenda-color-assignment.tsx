import { popupGlass } from './premium-web-surfaces';
import {Ionicons} from '@expo/vector-icons';
import React,{useLayoutEffect,useState} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {useAccessAppearance} from './access-premium';
import {AgendaColorInfo} from './agenda-color-info';
import {AgendaTonePalette,agendaToneName} from './agenda-tone-palette';
import {ServiceWebField} from './services-web-edit-form';
import {EditorAction} from './services-step-editor';

type Props={targetName:string;targetControls:React.ReactNode;value:string;draft:string;onPick:(hex:string)=>void;onDraft:(hex:string)=>void;saved:string[];canApply:boolean;busy:boolean;status?:string;onApply:()=>void;onClose:()=>void;advanced:React.ReactNode};
export function AgendaColorAssignment(props:Props){
 const {palette:p}=useAccessAppearance();const [chosen,setChosen]=useState(false);const [advanced,setAdvanced]=useState(false);const [custom,setCustom]=useState(false);
 useLayoutEffect(()=>setChosen(false),[props.targetName]);
 const pick=(hex:string)=>{props.onPick(hex);setChosen(true);};
 return <View style={{flex:1,minHeight:0}}>
  {React.createElement('style',null,'[data-color-assignment-columns]{display:grid;grid-template-columns:minmax(230px,.75fr) minmax(0,1.5fr);gap:30px;align-items:start;}@media(max-width:900px){[data-color-assignment-columns]{grid-template-columns:minmax(0,1fr);gap:24px;}}')}
  <View style={{padding:28,paddingBottom:22,gap:8,borderBottomWidth:1,borderColor:p.line}}><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><Text style={{fontFamily:'Georgia',fontSize:28,color:p.ink,flex:1}}>Colori agenda</Text><AgendaColorInfo/><Pressable accessibilityRole="button" accessibilityLabel="Chiudi finestra" onPress={props.onClose} style={{width:38,height:38,borderRadius:12,borderWidth:1,borderColor:p.border,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={19} color={p.ink}/></Pressable></View><Text style={{fontSize:13,lineHeight:20,color:p.muted}}>Scegli a chi assegnarlo, scegli il colore e applicalo.</Text></View>
  <ScrollView style={{flex:1,minHeight:0}} contentContainerStyle={{padding:28,gap:24}} keyboardShouldPersistTaps="handled">
   <View {...{dataSet:{colorAssignmentColumns:'true'}}}>
    <View style={{gap:18}}><Text style={{fontFamily:'Georgia',fontSize:22,color:p.ink}}>1. Assegna a</Text>{props.targetControls}<Text style={{fontSize:13,lineHeight:20,color:p.muted}}>La personalizzazione riguarda solo il destinatario selezionato. Il resto conserva i propri colori.</Text></View>
    <View style={{gap:16}}><Text style={{fontFamily:'Georgia',fontSize:22,color:p.ink}}>2. Scegli il colore</Text><AgendaTonePalette value={chosen?props.value:''} onChange={pick} saved={props.saved}/><EditorAction title={custom?'Nascondi codice HEX':'Inserisci un colore HEX'} onPress={()=>setCustom(!custom)}/>{custom?<ServiceWebField label="Colore HEX" value={props.draft} onChange={value=>{props.onDraft(value);setChosen(true);}} placeholder="#C7B38D"/>:null}</View>
   </View>
   <View style={{gap:18,paddingTop:18,borderTopWidth:1,borderColor:p.line}}><EditorAction title={advanced?'Chiudi altre opzioni':'Automatici e colore unico'} onPress={()=>setAdvanced(!advanced)}/>{advanced?props.advanced:null}</View>
  </ScrollView>
  <View style={{padding:20,paddingHorizontal:28,gap:12,borderTopWidth:1,borderColor:p.line,backgroundColor:p.night?'#262623':'#D1C8BA', ...popupGlass(p, 'footer')}}><View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12}}>{chosen&&props.canApply?<View style={{width:28,height:28,borderRadius:8,borderWidth:1,borderColor:p.border,backgroundColor:props.draft}}/>:null}<Text style={{fontSize:15,color:p.ink,flex:1,minWidth:150}}>{props.targetName?(chosen?`${props.targetName} → ${agendaToneName(props.draft)}`:`${props.targetName} · scegli un colore`):'Scegli il destinatario'}</Text></View>{props.status?<Text style={{fontSize:13,color:p.muted}}>{props.status}</Text>:null}<View style={{flexDirection:'row',justifyContent:'flex-end',gap:8,flexWrap:'wrap'}}><EditorAction title="Chiudi" onPress={props.onClose}/><EditorAction primary title={props.busy?'Applicazione…':props.targetName?`Applica a ${props.targetName.replace(/^mestiere /,'')}`:'Applica colore'} onPress={props.onApply} disabled={!chosen||!props.canApply||props.busy}/></View></View>
 </View>;
}
