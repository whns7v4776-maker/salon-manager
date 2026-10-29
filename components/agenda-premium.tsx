import {AgendaSlotFeedbackContext} from './agenda-slot-feedback';
import { OwnerBrandMark } from './salon-brand-mark';
import {NativeAgendaCaption,NativeAgendaOperatorHeading} from './agenda-native-labels';
import {AgendaOperatorSurface,AgendaStateRule} from './agenda-approved-surface';
import {WebHorizontalScrollRail} from './ui/web-horizontal-scroll-rail';
import React from 'react';
import {Image,Platform,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions,type StyleProp,type TextStyle} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {AccessWordmark,useAccessAppearance} from './access-premium';
import {NativeSectionHeader,nativeSerif} from './owner-native-premium';
import {InfoButton} from './ui/info-button';
import {useTabSwipeLock} from '../src/context/TabSwipeLockContext';
import {getAgendaDateStripOffset,getAgendaDateStripMetrics} from '../src/lib/agenda-date-strip';
import {OwnerPremiumCompactAppearance} from './owner-premium-web';
import {useSolidAgendaPalette} from './agenda-premium-style';

type Day={value:string;weekdayShort:string;dayNumber:string;monthShort?:string;monthLabel?:string;closed?:boolean;past?:boolean;full?:boolean;pending?:number};
const web=Platform.OS==='web';
export function AgendaPremiumBlockedSlotLabel({label,textStyle}:{label:string;textStyle:StyleProp<TextStyle>}){
 return <AgendaStateLabel label={label} textStyle={textStyle} action/>;
}
export function AgendaStateLabel({label,textStyle,action=false}:{label:string;textStyle?:StyleProp<TextStyle>;action?:boolean}){
 const p=useSolidAgendaPalette();
 const pressed=React.useContext(AgendaSlotFeedbackContext);
 return <View pointerEvents="none" style={{width:'100%',height:'100%',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:web?12:6,paddingHorizontal:web?14:4}}>
  <View style={{flex:1,alignItems:'flex-end',opacity:pressed?0:1}}><AgendaStateRule night={p.night} hideOnAction={action}/></View>
  <View {...(web?{dataSet:{agendaBlockedLabel:action?'true':'false'}}:{})} style={{position:'relative',alignItems:'center',maxWidth:'72%',flexShrink:1}}>
   {!web?<NativeAgendaCaption label={label} icon={label==='Passato'?undefined:'lock-closed-outline'} color={p.muted} textStyle={textStyle}/>:<>
   {label!=='Passato'?<Ionicons name="lock-closed-outline" size={12} color={p.muted} style={{position:'absolute',right:'100%',marginRight:8,top:1}}/>:null}
   <Text numberOfLines={1} ellipsizeMode="clip" adjustsFontSizeToFit minimumFontScale={.78} style={[textStyle,{color:p.muted,fontSize:10,lineHeight:14,fontWeight:'600',textAlign:'center'}]}>{label}</Text></>}
  </View><View style={{flex:1,alignItems:'flex-start',opacity:pressed?0:1}}><AgendaStateRule night={p.night} reverse hideOnAction={action}/></View>
 </View>;
}
export function AgendaPremiumOperatorChoice({name,photo,status,selected,available}:{name:string;photo?:string|null;status:string;selected:boolean;available:boolean}){
 const p=useSolidAgendaPalette();
 const accent=available?(p.night?'#B2D4BB':'#426B54'):(p.night?'#E0C399':'#8A653C');
 return <>
  <View style={{width:36,height:36,borderRadius:18,backgroundColor:p.night?'rgba(255,255,255,.08)':'#EEEDE7',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
   {photo?<Image source={{uri:photo}} style={{width:36,height:36}}/>:<Text style={{fontSize:14,fontWeight:'500',color:p.ink}}>{name.trim().split(/\s+/).filter(part=>/\p{L}|\p{N}/u.test(part)).map(part=>part[0]).slice(0,2).join('').toLocaleUpperCase('it')}</Text>}
  </View>
  <View style={{flex:1,minWidth:0,gap:4}}><Text style={{fontSize:13,lineHeight:18,fontWeight:'600',color:p.ink}}>{name}</Text><View style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={{width:5,height:5,borderRadius:3,backgroundColor:accent,flexShrink:0}}/><Text style={{fontSize:11,lineHeight:15,color:accent,flexShrink:1}}>{status}</Text></View></View>
  {selected?<Ionicons name="checkmark-circle" size={17} color={accent}/>:null}
 </>;
}
export function AgendaPremiumOperatorHeading({name,role,photo,accent,unavailable,historical=false,width=240,bare=false}:{name:string;role:string;photo?:string|null;accent:string;unavailable:boolean;historical?:boolean;width?:number;bare?:boolean}){
 const p=useSolidAgendaPalette();
 const compact=width<190;
 const meta=historical?'Archiviato':unavailable?'Non attivo oggi':role;
 if(!web)return <NativeAgendaOperatorHeading name={name} meta={meta} photo={photo} accent={accent} unavailable={unavailable} width={width} night={p.night} ink={p.ink} muted={p.muted} bare={bare}/>;
 const photoSize=compact?26:web?44:32;
 const textWidth=Math.max(30,Math.min(width-2*(photoSize+12),Math.max(50,name.length*(web?(compact?12:16):12)*.6,meta.length*(web?11:9)*.55)));
 return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:compact?8:11,width:'100%',height:'100%',paddingHorizontal:compact?8:12,paddingVertical:web?6:2,overflow:'hidden'}}>
  {bare?null:<AgendaOperatorSurface night={p.night}/>}
  <View style={{width:photoSize,height:photoSize,borderRadius:photoSize/2,overflow:'hidden',backgroundColor:p.night?'#3A352C':'#F3E7D3',borderWidth:1,borderColor:p.night?'rgba(216,194,155,.32)':'rgba(150,118,72,.3)',...(web?{boxShadow:p.night?'inset 0 1px 0 rgba(255,255,255,.12),0 3px 8px rgba(0,0,0,.35)':'inset 0 1px 0 #ffffffcc,0 3px 8px rgba(110,84,46,.16)'}:{}),position:'absolute',left:Math.max(14,width/2-textWidth/2-photoSize-11),opacity:unavailable?.55:1,alignItems:'center',justifyContent:'center',flexShrink:0}}>
   {photo?.trim()?<Image source={{uri:photo}} style={{width:'100%',height:'100%'}}/>:<Text style={{color:p.ink,fontSize:compact?14:18,fontFamily:'Georgia'}}>{name.trim().charAt(0).toLocaleUpperCase('it')}</Text>}
  </View>
  <View style={{maxWidth:textWidth,flexShrink:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:web?4:2}}>
   <Text {...(!web?{numberOfLines:1,adjustsFontSizeToFit:true,minimumFontScale:.8}:{})} style={{minWidth:0,flexShrink:1,color:unavailable?p.muted:p.ink,fontSize:web?(compact?12:16):12,lineHeight:web?(compact?15:20):15,fontWeight:'600',letterSpacing:-.15,textAlign:'center'}}>{name}</Text>
   <View style={{position:'relative',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:0,maxWidth:'100%'}}>
    <View style={{position:'absolute',right:'100%',marginRight:6,width:6,height:6,borderRadius:3,borderWidth:StyleSheet.hairlineWidth,borderColor:p.night?'rgba(255,255,255,.2)':'rgba(70,58,30,.2)',backgroundColor:unavailable?p.muted:accent,flexShrink:0}}/>
    <Text {...(!web?{numberOfLines:1,adjustsFontSizeToFit:true,minimumFontScale:.85}:{})} style={{color:p.muted,fontSize:web?(compact?11:12):11,lineHeight:web?(compact?14:16):14,flexShrink:1,textAlign:'center'}}>{meta}</Text>
   </View>
  </View>
 </View>;
}
export function AgendaPremiumHeader({date,time,review,onAvailability}:{date:string;time?:string;review?:React.ReactNode;onAvailability:()=>void}){
 const {palette:p,toggle}=useAccessAppearance();const {width}=useWindowDimensions();const wide=web&&width>=1000,compact=width<600;
 const dateLine=<View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8}}><Text style={{fontSize:wide?16:14,lineHeight:wide?23:20,color:p.ink}}>{date}</Text>{time?<View accessibilityLabel={`Ora attuale ${time}`} style={{flexDirection:'row',alignItems:'center',gap:6,flexShrink:0}}><View style={{width:3,height:3,borderRadius:2,backgroundColor:p.muted,opacity:.7}}/><Text style={{fontSize:wide?15:14,lineHeight:wide?23:20,color:p.muted,fontVariant:['tabular-nums']}}>{time}</Text></View>:null}</View>;
 // Same rhythm as the native Home: wordmark row, small date · time, serif title.
 if(!web)return <View style={{gap:5,marginTop:-13,marginBottom:12}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:64,marginBottom:6}}>
   <View style={{width:154,flexShrink:1}}><OwnerBrandMark compact/></View>
   <Pressable accessibilityRole="button" accessibilityLabel={p.night?'Attiva tema chiaro':'Attiva tema scuro'} onPress={toggle} style={{width:40,height:40,borderRadius:20,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name={p.night?'sunny-outline':'moon-outline'} size={20} color={p.ink}/></Pressable>
  </View>
  <Text style={{color:p.muted,fontSize:11,letterSpacing:.6}}>{date.toLocaleUpperCase('it')}{time?` · ${time}`:''}</Text>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:7}}>
   <Text accessibilityRole="header" style={{fontFamily:nativeSerif,fontSize:27,lineHeight:34,letterSpacing:-.6,color:p.ink}}>Agenda</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Apri disponibilità e orari" onPress={onAvailability} style={{minHeight:40,flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:p.border,backgroundColor:p.field,borderRadius:12,paddingHorizontal:12}}><Ionicons name="time-outline" size={17} color={p.ink}/><Text style={{fontSize:13,color:p.ink}}>Orari</Text></Pressable>
  </View>{review}
 </View>;
 if(web&&!wide)return <View style={{gap:5,marginBottom:14}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   <Text accessibilityRole="header" style={{fontFamily:nativeSerif,fontSize:width<480?28:32,lineHeight:width<480?38:42,color:p.ink,flexShrink:0,marginRight:'auto'}}>Agenda</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Apri disponibilità e orari" onPress={onAvailability} style={{minHeight:36,flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:p.border,backgroundColor:p.field,borderRadius:11,paddingHorizontal:9,flexShrink:0}}><Ionicons name="time-outline" size={16} color={p.ink}/><Text style={{fontSize:12,color:p.ink}}>{compact?'Orari':'Orari e disponibilità'}</Text></Pressable>
   <OwnerPremiumCompactAppearance inline/>
  </View>
  {dateLine}
  {review}
 </View>;
 return <View style={{flexDirection:wide?'row':'column',alignItems:wide?'flex-start':'stretch',justifyContent:'space-between',gap:10,marginBottom:14}}>
  {web?<View style={{gap:5,flexShrink:0}}><Text accessibilityRole="header" style={{fontFamily:nativeSerif,fontSize:32,lineHeight:42,color:p.ink}}>Agenda</Text>{dateLine}</View>:<NativeSectionHeader title="La tua agenda." subtitle={time?`${date} · ${time}`:date}/>}
  <View style={{flexDirection:'row',alignItems:'center',flexWrap:compact?'nowrap':'wrap',justifyContent:wide?'flex-end':'space-between',gap:10,flex:wide?1:undefined,paddingTop:wide?6:0}}>{review}<Pressable accessibilityRole="button" accessibilityLabel="Apri disponibilità e orari" onPress={onAvailability} style={{minHeight:40,flexDirection:'row',alignItems:'center',gap:7,borderWidth:1,borderColor:p.border,backgroundColor:p.field,borderRadius:12,paddingHorizontal:12,paddingVertical:9}}><Ionicons name="time-outline" size={18} color={p.ink}/>{!compact?<Text style={{fontSize:13,color:p.ink}}>Orari e disponibilità</Text>:null}</Pressable></View>
 </View>;
}
export function AgendaPremiumDateStrip({days,selected,month,onMonth,onToday,onPrevious,onNext,onSelect,onDayMenu,onHelp,dayCountControl,onEarlierDates}:{days:Day[];selected:string;month:string;onMonth:()=>void;onToday:()=>void;onPrevious:()=>void;onNext:()=>void;onSelect:(id:string)=>void;onDayMenu:(id:string)=>void;onHelp:()=>void;dayCountControl?:React.ReactNode;onEarlierDates?:()=>void}){
 const p=useSolidAgendaPalette();const {width}=useWindowDimensions();const {setDisableParentSwipe}=useTabSwipeLock();
 const compact=width<600,inline=web&&width>=900;
 const compactWeb=compact,tightWeb=compactWeb&&width<360;
 const rail=React.useRef<ScrollView>(null);
 const [recenterRequest,requestRecenter]=React.useState(0);
 const [railWidth,setRailWidth]=React.useState(0);
 const dayWidth=compact?52:66;
 const dividerWidth=32;
 const metrics=React.useMemo(()=>getAgendaDateStripMetrics(days,dayWidth,dividerWidth),[days,dayWidth,dividerWidth]);
 const selectedIndex=days.findIndex(day=>day.value===selected);
 const railOffset=React.useRef(0);
 const previousRange=React.useRef({start:'',selected:'',width:0,dayWidth:0,recenterRequest:0});
 const loadingEarlier=React.useRef(false);
 const centerSelected=React.useCallback(()=>{
  if(railWidth<=0||selectedIndex<0)return;
  const previous=previousRange.current;
  const oldStartIndex=previous.start?days.findIndex(day=>day.value===previous.start):-1;
  if(previous.recenterRequest===recenterRequest&&previous.start&&oldStartIndex>0){
   rail.current?.scrollTo({x:railOffset.current+metrics.offsets[oldStartIndex],animated:false});
  }else if(previous.recenterRequest!==recenterRequest||previous.selected!==selected||previous.width!==railWidth||previous.dayWidth!==dayWidth){
   rail.current?.scrollTo({x:getAgendaDateStripOffset(selectedIndex,dayWidth,days.length,railWidth,metrics),animated:false});
  }
  previousRange.current={start:days[0]?.value??'',selected,width:railWidth,dayWidth,recenterRequest};
  loadingEarlier.current=false;
 },[railWidth,selectedIndex,days,selected,dayWidth,metrics,recenterRequest]);
 React.useEffect(centerSelected,[centerSelected]);
 React.useEffect(()=>()=>setDisableParentSwipe(false),[setDisableParentSwipe]);
 // Paired controls read as one segmented group: shared border, inner corners squared.
 const button=(label:string,icon:React.ComponentProps<typeof Ionicons>['name']|null,press:()=>void,segment?:'first'|'last')=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={press} style={{minHeight:!web?30:compactWeb?36:42,width:compactWeb&&icon?(tightWeb?28:32):undefined,borderWidth:1,borderColor:p.border,backgroundColor:p.field,borderRadius:!web?9:compactWeb?10:12,...(segment==='first'?{borderTopRightRadius:0,borderBottomRightRadius:0}:segment==='last'?{borderTopLeftRadius:0,borderBottomLeftRadius:0,borderLeftWidth:0}:{}),paddingHorizontal:!web?(icon?0:10):compactWeb?(icon?0:tightWeb?6:8):compact?(icon?8:10):(icon?12:16),flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,flexShrink:0}}>{icon?<Ionicons name={icon} size={compactWeb?16:18} color={p.ink}/>:<Text style={{fontSize:tightWeb?11:compactWeb?12:13,fontWeight:'600',color:p.ink}}>{label}</Text>}</Pressable>;
 const leading=<View style={{flexDirection:'row',alignItems:'center',flexShrink:0,gap:compactWeb?3:compact?4:8}}><View style={{flexDirection:'row'}}>{button(month,null,onMonth,'first')}{button('Oggi',null,()=>{onToday();requestRecenter(value=>value+1);},'last')}</View>{dayCountControl}</View>;
 const help=<InfoButton size={!web?30:tightWeb?28:compact?32:42} hitSlop={compactWeb?0:5} accessibilityLabel="Come funziona l’Agenda" onPress={onHelp}/>;
 const trailingArrows=<View style={{flexDirection:'row',flexShrink:0}}>{button('Giorno precedente','chevron-back',onPrevious,'first')}{button('Giorno successivo','chevron-forward',onNext,'last')}</View>;
 const trailing=<View style={{flexDirection:'row',alignItems:'center',flexShrink:0,gap:compactWeb?3:compact?4:8}}><View style={{flexDirection:'row'}}>{button('Giorno precedente','chevron-back',onPrevious,'first')}{button('Giorno successivo','chevron-forward',onNext,'last')}</View>{help}</View>;
 // App: the day strip is swiped directly, so it takes the full width with no side arrows.
 // Wide web: month/today stacked over the view picker in a narrow column, one arrow on each side of the days.
 const stackedLeading=<View style={{flexShrink:0,gap:6,alignItems:'stretch'}}><View style={{flexDirection:'row'}}>{button(month,null,onMonth,'first')}{button('Oggi',null,()=>{onToday();requestRecenter(value=>value+1);},'last')}</View>{dayCountControl}</View>;
 // App: a quiet header built into the card — month title, gold "Oggi", the view chip and the guide, no boxed buttons.
 const gold=p.night?'#D8C29B':'#8F6D3B';
 const nativeHeader=<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',height:34,paddingLeft:14,paddingRight:8}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:4,flexShrink:1,minWidth:0}}>
   <Pressable accessibilityRole="button" accessibilityLabel={`Scegli mese, ${month}`} onPress={onMonth} hitSlop={6} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:4,opacity:pressed?.6:1,flexShrink:1})}><Text numberOfLines={1} style={{fontSize:15,fontWeight:'600',letterSpacing:-.2,color:p.ink,textTransform:'capitalize'}}>{month}</Text><Ionicons name="chevron-down" size={13} color={p.muted}/></Pressable>
   <View style={{width:3,height:3,borderRadius:2,backgroundColor:p.muted,opacity:.6,marginHorizontal:6}}/>
   <Pressable accessibilityRole="button" accessibilityLabel="Oggi" onPress={()=>{onToday();requestRecenter(value=>value+1);}} hitSlop={6} style={({pressed})=>({opacity:pressed?.6:1})}><Text style={{fontSize:14,fontWeight:'600',color:gold}}>Oggi</Text></Pressable>
  </View>
  <View style={{flexDirection:'row',alignItems:'center',gap:6,flexShrink:0}}>{dayCountControl}<Pressable accessibilityRole="button" accessibilityLabel="Come funziona l’Agenda" onPress={onHelp} hitSlop={8} style={({pressed})=>({width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:p.field,opacity:pressed?.6:1})}><Ionicons name="information" size={15} color={p.muted}/></Pressable></View>
 </View>;
 const railArrow=(label:string,icon:'chevron-back'|'chevron-forward',press:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={press} style={({hovered,pressed}:any)=>({width:34,alignSelf:'stretch',alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:hovered||pressed?(p.night?'#33373A':'#F1EADF'):p.field,flexShrink:0})}><Ionicons name={icon} size={18} color={p.ink}/></Pressable>;
 return <View {...(web?{dataSet:{agendaDateStrip:'true'}}:{})} style={{borderWidth:1,borderColor:p.border,borderRadius:18,backgroundColor:p.surface,padding:compact?8:10,...(!web?{paddingHorizontal:0,paddingBottom:0,paddingTop:3,overflow:'hidden'}:{}),gap:inline?14:web?10:3,marginBottom:web?10:6,flexDirection:inline?'row':'column',alignItems:inline?'center':'stretch'}}>
  {!web?nativeHeader:inline?stackedLeading:<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'nowrap',gap:compact?4:8,paddingHorizontal:web?0:compact?8:10}}>{leading}{web?trailingArrows:help}</View>}
  {inline?railArrow('Giorno precedente','chevron-back',onPrevious):null}
  <View {...(web?{dataSet:{agendaDayScroll:'true'}}:{})} style={{width:inline?undefined:'100%',flex:inline?1:undefined,minWidth:0,position:'relative'}}>
   {web?React.createElement('style',null,`
    [data-agenda-day-scroll] [data-horizontal-rail] {position:absolute!important;left:8px;right:8px;bottom:-12px;width:auto!important;padding:0!important;z-index:2;}
    [data-agenda-day-scroll] [role="scrollbar"] {height:16px!important;background:transparent!important;border-radius:8px!important;}
    [data-agenda-day-scroll] [role="scrollbar"]::before {display:none!important;}
    [data-agenda-day-scroll] [role="scrollbar"] > div {top:5px!important;height:6px!important;border-radius:4px!important;background:${p.night?'rgba(216,194,155,.58)':'rgba(70,83,72,.43)'}!important;}
   `):null}
  <ScrollView {...(web?{dataSet:{agendaHorizontalScroll:'true'}}:{})} ref={rail} horizontal scrollEventThrottle={32} onScroll={event=>{const x=event.nativeEvent.contentOffset.x;const movedBack=x<railOffset.current-1;railOffset.current=x;if(onEarlierDates&&movedBack&&x<=dayWidth&&!loadingEarlier.current){loadingEarlier.current=true;onEarlierDates();}}} onLayout={event=>setRailWidth(event.nativeEvent.layout.width)} onContentSizeChange={centerSelected} style={{width:'100%',maxWidth:'100%',minWidth:0,borderRadius:14,backgroundColor:p.field,...(!web?{borderTopLeftRadius:12,borderTopRightRadius:12,borderBottomLeftRadius:17,borderBottomRightRadius:17}:{})}} showsHorizontalScrollIndicator={false} onScrollBeginDrag={()=>setDisableParentSwipe(true)} onScrollEndDrag={()=>setDisableParentSwipe(false)} onMomentumScrollBegin={()=>setDisableParentSwipe(true)} onMomentumScrollEnd={()=>setDisableParentSwipe(false)} contentContainerStyle={{justifyContent:'flex-start',gap:0}}>
   {days.map((day,index)=>{const active=day.value===selected;const startsMonth=index>0&&day.value.slice(0,7)!==days[index-1].value.slice(0,7);return <React.Fragment key={day.value}>{startsMonth?<View {...(web?{dataSet:{agendaMonthDivider:day.value.slice(0,7)}}:{})} accessibilityLabel={`Inizio ${day.monthLabel||day.monthShort||day.value.slice(0,7)}`} style={{width:dividerWidth,flexShrink:0,alignSelf:'stretch',alignItems:'center',justifyContent:'center'}}><View pointerEvents="none" style={{width:22,height:66,borderRadius:11,borderWidth:1,borderColor:p.night?'rgba(216,194,155,.25)':'rgba(141,118,80,.20)',backgroundColor:p.night?'rgba(216,194,155,.075)':'rgba(189,165,127,.085)',alignItems:'center',justifyContent:'center',...(web?{backgroundImage:p.night?'linear-gradient(90deg,rgba(255,255,255,.035),transparent)':'linear-gradient(90deg,rgba(255,255,255,.65),rgba(255,255,255,.12))',boxShadow:p.night?'inset 1px 0 0 rgba(255,255,255,.035)':'inset 1px 0 0 rgba(255,255,255,.65)'} as any:{})}}><Text numberOfLines={1} style={{width:66,minWidth:66,maxWidth:66,height:14,flexShrink:0,transform:[{rotate:'-90deg'}],textAlign:'center',color:p.night?'#D8C29B':'#796346',fontSize:9,lineHeight:14,letterSpacing:1,fontWeight:'600',textTransform:'uppercase'}}>{day.monthLabel||day.monthShort||day.value.slice(5,7)}</Text></View></View>:null}<Pressable accessibilityRole="button" accessibilityLabel={`${day.weekdayShort} ${day.dayNumber}${day.closed?', chiuso':''}${day.full?', pieno':''}${day.pending?`, ${day.pending} richieste da confermare`:''}`} accessibilityState={{selected:active}} aria-pressed={active} onPress={()=>onSelect(day.value)} onLongPress={()=>onDayMenu(day.value)} {...(web?{onContextMenu:(event:any)=>{event.preventDefault();event.stopPropagation();onDayMenu(day.value);}}:{})} style={{width:dayWidth,flexGrow:0,flexShrink:0,minHeight:62,paddingHorizontal:compact?6:12,paddingVertical:7,borderRadius:active?28:12,backgroundColor:active?(p.night?'rgba(216,194,155,.18)':'rgba(237,208,181,.46)'):'transparent',borderWidth:1,borderColor:active?p.border:'transparent',alignItems:'center',justifyContent:'center',gap:3}}>{index>0&&!startsMonth?<View pointerEvents="none" style={{position:'absolute',left:-1,top:14,bottom:14,width:1,opacity:.7,backgroundColor:p.line,...(web?{backgroundColor:'transparent',backgroundImage:`linear-gradient(to bottom, transparent, ${p.line} 24%, ${p.line} 76%, transparent)`} as any:{})}}/>:null}<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={{fontSize:11,lineHeight:15,color:p.muted,maxWidth:'100%',textAlign:'center'}}>{day.weekdayShort}</Text><Text style={{fontSize:18,lineHeight:23,fontWeight:'600',color:p.ink}}>{day.dayNumber}</Text><View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3,height:14,maxWidth:'100%'}}>
    {day.closed?<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7} style={{fontSize:9,lineHeight:12,color:p.muted,flexShrink:1}}>Chiuso</Text>:<View style={{width:day.pending?10:18,height:4,borderRadius:2,backgroundColor:active?(p.night?'#E2CCAA':'#946333'):day.past?p.muted:day.full?(p.night?'#D98C86':'#C0504D'):'#86AA87',flexShrink:0}}/>}
    {day.pending?<View accessibilityLabel={`${day.pending} richieste da confermare`} style={{minWidth:18,height:14,paddingHorizontal:3,borderRadius:5,backgroundColor:'#B35050',alignItems:'center',justifyContent:'center',flexShrink:0}}><Text style={{fontSize:9,lineHeight:12,fontWeight:'700',color:'#FFFFFF'}}>{day.pending>99?'99+':`+${day.pending}`}</Text></View>:null}
   </View></Pressable></React.Fragment>;})}
  </ScrollView>
  {web?<WebHorizontalScrollRail hostRef={rail} label="Scorri i giorni"/>:null}
  </View>
  {inline?railArrow('Giorno successivo','chevron-forward',onNext):null}
 </View>;
}
export function AgendaPremiumOperatorFilters({operators,selected,onAll,onToggle,locked,inline=false}:{operators:{id:string;nome:string}[];selected:string[]|null;onAll:()=>void;onToggle:(id:string)=>void;locked:boolean;inline?:boolean}){
 const p=useSolidAgendaPalette();const {setDisableParentSwipe}=useTabSwipeLock();
 React.useEffect(()=>()=>setDisableParentSwipe(false),[setDisableParentSwipe]);
 if(!operators.length)return null;
 const orderedOperators=[...operators].sort((a,b)=>a.nome.localeCompare(b.nome,'it',{sensitivity:'base'})||a.id.localeCompare(b.id));
 const chip=(id:string,label:string,active:boolean,press:()=>void)=><Pressable key={id} accessibilityRole="button" accessibilityLabel={id==='all'?'Mostra tutti gli operatori':`Filtra operatore ${label}`} accessibilityState={{selected:active}} aria-pressed={active} onPress={press} style={{minHeight:40,flexShrink:0,borderRadius:12,borderWidth:1,borderColor:active?p.action:p.border,backgroundColor:active?p.action:p.field,paddingHorizontal:13,paddingVertical:10}}><Text style={{fontSize:13,color:active?p.actionText:p.ink}}>{label}</Text></Pressable>;
 return <View style={{gap:7,marginBottom:inline?0:10,minWidth:0,maxWidth:'100%'}}><ScrollView {...(web?{dataSet:{agendaHorizontalScroll:'true'}}:{})} style={{minWidth:0,maxWidth:'100%'}} horizontal showsHorizontalScrollIndicator={false} onScrollBeginDrag={()=>setDisableParentSwipe(true)} onScrollEndDrag={()=>setDisableParentSwipe(false)} onMomentumScrollBegin={()=>setDisableParentSwipe(true)} onMomentumScrollEnd={()=>setDisableParentSwipe(false)} contentContainerStyle={{gap:7}}>{chip('all','Tutti gli operatori',!selected,onAll)}{orderedOperators.map(op=>chip(op.id,op.nome,!!selected?.includes(op.id),()=>onToggle(op.id)))}</ScrollView>{locked&&!inline?<Text style={{fontSize:11,lineHeight:16,color:p.muted}}>Vista giornaliera con più operatori. Scegline uno per vedere più giorni.</Text>:null}</View>;
}

/** CSS hover stays on the browser compositor; it never re-renders the grid or changes slot geometry. */
export function AgendaPremiumSlotCss(){
 const p=useSolidAgendaPalette();
 if(!web)return null;
 const fill=p.night?'rgba(216,194,155,.14)':'rgba(104,128,108,.13)';
 const stroke=p.night?'rgba(232,218,190,.52)':'rgba(98,118,102,.42)';
 const operatorDivider=p.night?'rgba(216,194,155,.28)':'rgba(52,55,53,.22)';
 return React.createElement('style',null,`
 [data-testid="agenda-appointment-details"] {background:${p.night?'rgba(31,36,33,.98)':'rgba(247,245,238,.98)'}!important;box-shadow:0 24px 72px #0003,inset 0 1px 0 #ffffff20!important;}
 [data-testid="agenda-appointment-details"] [role="button"] {background-image:none!important;min-height:44px;}
 [data-agenda-checkout-section="true"] {flex-direction:column!important;align-items:stretch!important;gap:12px!important;margin:0!important;}
 [data-agenda-checkout-section="true"] > * {width:100%!important;flex-basis:auto!important;flex-grow:0!important;min-width:0!important;}
 [data-testid="agenda-appointment-details"] [data-agenda-details-part="duration"] > * {width:auto!important;}
 /* Horizontal agenda rails must hand vertical wheel/touch scrolling to the
    page. Dialog scroll containment remains scoped to the dialog itself. */
 html body [data-agenda-horizontal-scroll="true"] {overscroll-behavior-y:auto!important;}
 [data-testid="agenda-appointment-details"] [data-agenda-details-part="duration"] {flex-direction:column!important;align-items:flex-start!important;gap:6px!important;}
 [data-testid="agenda-appointment-details"] [data-agenda-details-part="duration"] > * {width:auto!important;flex:0 1 auto!important;}
 [data-agenda-operator-header="true"] {position:relative;}
 [data-agenda-operator-header="true"] > * + *::before {content:"";position:absolute;left:0;top:12px;bottom:12px;width:1px;background:linear-gradient(to bottom,transparent,${operatorDivider} 28%,${operatorDivider} 72%,transparent);pointer-events:none;z-index:5;}
 [data-agenda-timeline-card="true"] {padding:12px!important;}
 [data-agenda-timeline-part="top"] {margin-bottom:8px!important;}
 [data-agenda-timeline-part="top"] > div:nth-child(2) {gap:6px!important;}
 [data-agenda-timeline-part="top"] > div:nth-child(2) > div:first-child {flex-direction:row!important;flex-wrap:wrap;align-items:center!important;gap:5px 10px!important;}
 [data-agenda-timeline-part="status"] {margin-bottom:8px!important;}
 [data-agenda-timeline-part="actions"] > div {min-height:36px!important;padding:7px 12px!important;}
 [data-agenda-timeline-part="actions"] [dir="auto"] {white-space:nowrap;}
 @media(min-width:760px){
  [data-agenda-timeline-card="true"] {display:grid!important;grid-template-columns:64px minmax(0,1fr) minmax(0,1fr) 176px;column-gap:18px;row-gap:6px;align-items:center;}
  [data-agenda-timeline-part="top"], [data-agenda-timeline-part="top"] > div:nth-child(2) {display:contents!important;}
  [data-agenda-timeline-part="top"] > div:first-child {grid-column:1;grid-row:1 / span 2;align-self:start;}
  [data-agenda-timeline-part="top"] > div:nth-child(2) > div:first-child {grid-column:2;grid-row:1;flex-direction:column!important;align-items:flex-start!important;gap:6px!important;min-width:0;}
  [data-agenda-timeline-part="top"] > div:nth-child(2) > div:nth-child(2) {grid-column:3;grid-row:1 / span 2;flex-direction:column!important;align-items:flex-start!important;justify-content:center;gap:6px!important;min-width:0;}
  [data-agenda-timeline-part="status"] {grid-column:2;grid-row:2;margin-left:0!important;margin-bottom:0!important;}
  [data-agenda-timeline-part="actions"] {grid-column:4;grid-row:1 / span 2;flex-direction:column!important;width:100%;gap:6px!important;margin:0!important;align-self:center;}
  [data-agenda-timeline-part="actions"] > div {flex:0 1 auto!important;width:100%;}
  [data-agenda-timeline-part="checkout"] {grid-column:1 / -1;grid-row:3;margin-left:76px!important;margin-bottom:0!important;}
 }
 [data-testid="agenda-quick-slot"] [role="scrollbar"] {background:transparent!important;}
 [data-testid="agenda-quick-slot"] [role="scrollbar"][aria-orientation="vertical"]::before {content:"";position:absolute;left:6px;top:0;bottom:0;width:2px;border-radius:999px;background:${p.line};pointer-events:none;}
 [data-testid="agenda-quick-slot"] [role="scrollbar"][aria-orientation="vertical"]>div {left:5px!important;width:4px!important;background:${p.muted}!important;border-radius:999px;}
 [data-testid="agenda-quick-slot"] [role="scrollbar"][aria-orientation="horizontal"]::before {content:"";position:absolute;left:0;right:0;top:6px;height:4px;border-radius:999px;background:${p.line};pointer-events:none;}
 [data-testid="agenda-quick-slot"] [role="scrollbar"][aria-orientation="horizontal"]>div {top:6px!important;height:4px!important;background:${p.muted}!important;border-radius:999px;}
 [data-testid="agenda-phase-organizer"] [role="scrollbar"] {background:transparent!important;}
 [data-testid="agenda-phase-organizer"] [role="scrollbar"]::before {content:"";position:absolute;left:0;right:0;top:6px;height:4px;border-radius:999px;background:${p.line};pointer-events:none;}
 [data-testid="agenda-phase-organizer"] [role="scrollbar"]>div {top:6px!important;height:4px!important;background:${p.muted}!important;border-radius:999px;}
 [data-testid="agenda-phase-organizer"] [role="scrollbar"]::before {content:"";position:absolute;left:0;right:0;top:7px;height:2px;border-radius:999px;background:${p.line};pointer-events:none;}
 [data-testid="agenda-phase-organizer"] [role="scrollbar"]>div {top:7px!important;height:2px!important;background:${p.night?'rgba(178,212,187,.55)':'rgba(66,107,84,.45)'}!important;border-radius:999px;}
 [data-agenda-state-rule="true"] {transition:opacity 160ms ease;}
 [data-agenda-slot-action="true"]:hover [data-agenda-state-rule="true"],[data-agenda-slot-action="true"]:focus-visible [data-agenda-state-rule="true"] {opacity:0!important;}
 [data-agenda-slot-action="true"] { transition:background-color 100ms ease,box-shadow 100ms ease; }
 [data-agenda-slot-action="true"]::after {content:"+";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:24px;font-weight:300;line-height:1;color:${p.ink};opacity:0;pointer-events:none;}
 [data-agenda-slot-action="true"]:focus-visible { outline:2px solid ${stroke};outline-offset:-2px;background-color:${fill}!important; }
 [data-agenda-slot-action="true"]:focus-visible::after {opacity:.8;}
 [data-agenda-slot-action="true"][data-agenda-slot-pause="true"]::after {left:calc(50% + 33px);font-size:20px;}
 [data-agenda-slot-pause="true"] [data-agenda-pause-label="true"] {transition:transform 100ms ease;}
 [data-agenda-slot-pause="true"]:focus-visible [data-agenda-pause-label="true"] {transform:translateX(-14px);}
 [data-agenda-slot-blocked="true"]::after,[data-agenda-slot-action="true"]:has([data-agenda-blocked-label="true"])::after {display:none;}
 [data-agenda-blocked-label="true"] {transition:transform 100ms ease;}
 [data-agenda-blocked-label="true"]::after {content:"+";position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);width:16px;text-align:center;font-size:20px;font-weight:300;line-height:1;color:${p.ink};opacity:0;pointer-events:none;transition:opacity 100ms ease;}
 [data-agenda-slot-action="true"]:focus-visible [data-agenda-blocked-label="true"] {transform:translateX(-14px);}
 [data-agenda-slot-action="true"]:focus-visible [data-agenda-blocked-label="true"]::after {opacity:.8;}
 [data-agenda-slot-pause="true"]:hover,[data-agenda-slot-pause="true"]:focus-visible {background-color:transparent!important;}
 @media(hover:hover) and (pointer:fine){
  [data-agenda-slot-action="true"]:hover { background-color:${fill}!important;box-shadow:none; }
  [data-agenda-slot-action="true"]:hover::after {opacity:.8;}
  [data-agenda-slot-pause="true"]:hover [data-agenda-pause-label="true"] {transform:translateX(-14px);}
  [data-agenda-slot-action="true"]:hover [data-agenda-blocked-label="true"] {transform:translateX(-14px);}
  [data-agenda-slot-action="true"]:hover [data-agenda-blocked-label="true"]::after {opacity:.8;}
 }
 `);
}
