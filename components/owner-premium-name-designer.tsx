import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { salonNameFontOptions } from '../src/lib/fonts';
import type { SalonNameFontVariant } from '../src/lib/platform';
import type { PlaqueFinish } from '../src/lib/salon-logo-plaque';
import { useAccessAppearance } from './access-premium';

type Props = { name:string; font:string; finish:PlaqueFinish; disabled:boolean; onFont:(font:SalonNameFontVariant)=>void; onFinish:(finish:PlaqueFinish)=>void };
const curated=['italiana','cormorant','parisienne','cinzel','manrope','editorial'];
const names:Record<string,string>={italiana:'Milano',cormorant:'Atelier',parisienne:'Signature',cinzel:'Maison',manrope:'Essenziale',editorial:'Editorial'};
const finishes:{key:PlaqueFinish;label:string;caption:string}[]=[{key:'none',label:'Puro',caption:'Solo la tua firma'},{key:'satin',label:'Satin',caption:'Luce morbida'},{key:'glass',label:'Cristallo',caption:'Trasparenze leggere'},{key:'metal',label:'Platino',caption:'Riflessi metallici'}];
export function OwnerPremiumNameDesigner({name,font,finish,disabled,onFont,onFinish}:Props){
 const {palette:p}=useAccessAppearance(); const [all,setAll]=useState(false);
 const options=all?salonNameFontOptions:salonNameFontOptions.filter(o=>curated.includes(o.key)||o.key===font).sort((a,b)=>curated.indexOf(a.key)-curated.indexOf(b.key));
 const family=salonNameFontOptions.find(o=>o.key===font)?.family;
 return <View {...{dataSet:{nameDesigner:'true'}}} style={{gap:20}}>
 {React.createElement('style',null,`
 [data-name-designer] [data-name-preview] { min-height:154px; display:flex; justify-content:center; align-items:center; border-radius:18px; padding:24px; overflow-wrap:anywhere; text-align:center; }
 [data-name-designer] [data-finish="none"] { background:transparent; border:1px dashed ${p.border}; }
 [data-name-designer] [data-finish="satin"] { background:linear-gradient(130deg,${p.night?'#353535,#222526 45%,#45433e':'#eee8df,#fffdf8 45%,#e2d8ca'}); border:1px solid ${p.border}; box-shadow:inset 0 1px 0 #ffffff60; }
 [data-name-designer] [data-finish="glass"] { background:linear-gradient(120deg,${p.night?'#ffffff1c,#ffffff04 50%,#ffffff12':'#ffffffbb,#ffffff22 50%,#ffffff99'}); border:1px solid ${p.border}; box-shadow:inset 0 1px 0 #ffffff70; backdrop-filter:blur(14px); }
 [data-name-designer] [data-finish="metal"] { background:linear-gradient(150deg,${p.night?'#525555,#26292b 30%,#727578 50%,#303335 75%,#55595b':'#d0d2d2,#f7f8f6 30%,#babebf 50%,#eeefed 75%,#c8cccc'}); border:1px solid ${p.border}; }
 [data-name-designer] [data-name-grid] { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr)); gap:10px; }
 [data-name-designer] [data-font-tile] { min-width:0; min-height:100px; padding:14px!important; display:flex; flex-direction:column; justify-content:space-between; gap:12px; border:1px solid ${p.border}!important; border-radius:13px; background:${p.field}!important; }
 [data-name-designer] [data-font-tile][aria-pressed="true"] { border-color:${p.night?'#d7c49c':'#887454'}!important; box-shadow:inset 0 0 0 1px ${p.night?'#d7c49c':'#887454'}; }
 [data-name-designer] [data-font-tile] [dir="auto"] { color:${p.ink}!important; }
 [data-name-designer] [data-finish-tile] { padding:10px!important; border:1px solid ${p.border}!important; border-radius:13px; background:transparent!important; min-width:0; }
 [data-name-designer] [data-finish-tile][aria-pressed="true"] { border-color:${p.night?'#d7c49c':'#887454'}!important; box-shadow:inset 0 0 0 1px ${p.night?'#d7c49c':'#887454'}; }
 [data-name-designer] [data-finish-tile] [data-name-preview] { min-height:54px; padding:8px; border-radius:8px; margin-bottom:9px; }
 `)}
 <Text style={{fontSize:11,letterSpacing:2,color:p.muted}}>LA TUA FIRMA</Text>
 <View {...{dataSet:{namePreview:'true',finish}}}><Text style={{fontFamily:family,fontSize:38,lineHeight:50,textAlign:'center',color:p.ink}}>{name}</Text></View>
 <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{color:p.ink,fontSize:20,fontFamily:'Georgia'}}>Carattere</Text><Text style={{color:p.muted,fontSize:12}}>Seleziona uno stile</Text></View>
 <View {...{dataSet:{nameGrid:'true'}}}>{options.map(o=><Pressable key={o.key} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Carattere ${names[o.key]??o.label}`} {...{'aria-pressed':font===o.key,dataSet:{fontTile:'true'}}} onPress={()=>onFont(o.key)}><Text style={{fontFamily:o.family,fontSize:25,color:p.ink,flexShrink:1}}>{name}</Text><Text style={{fontSize:10,letterSpacing:1,color:p.muted}}>{names[o.key]??o.label}{font===o.key?'  ✓':''}</Text></Pressable>)}</View>
 <Pressable disabled={disabled} accessibilityRole="button" onPress={()=>setAll(!all)} style={{alignSelf:'center',padding:8}}><Text style={{color:p.muted,fontSize:12}}>{all?'Mostra selezione curata':'Esplora tutti i caratteri'}</Text></Pressable>
 <Text style={{color:p.ink,fontSize:20,fontFamily:'Georgia'}}>Materia e luce</Text>
 <View {...{dataSet:{nameGrid:'true'}}}>{finishes.map(f=><Pressable key={f.key} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Finitura ${f.label}`} {...{'aria-pressed':finish===f.key,dataSet:{finishTile:'true'}}} onPress={()=>onFinish(f.key)}><View {...{dataSet:{namePreview:'true',finish:f.key}}}><Text style={{fontFamily:family,fontSize:22,color:p.ink}}>Aa</Text></View><Text style={{fontSize:13,fontWeight:'600',color:p.ink}}>{f.label}{finish===f.key?'  ✓':''}</Text><Text style={{fontSize:11,color:p.muted,marginTop:4}}>{f.caption}</Text></Pressable>)}</View>
 </View>;
}
