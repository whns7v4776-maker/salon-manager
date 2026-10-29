import React from 'react';
import {Platform,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {getAgendaAppointmentBadgeTone} from '../src/lib/service-accents';
import {agendaCompactFields} from '../src/lib/agenda-compact-fields';

type Props={client:string;service:string;time:string;duration:number;phase:string;origin:string;operator:string;pending:boolean;ink:string;accent:string;width:number;height:number;footer:number;benefits?:React.ReactNode;sourceBadge?:React.ReactNode};
const linesFor=(text:string,width:number,size:number)=>Math.max(1,Math.ceil(text.length*size*.53/Math.max(20,width)));

/** Clock geometry belongs to the grid. This component only fills its measured body. */
export function AgendaPremiumAppointmentContent({client,service,time,duration,phase,origin,operator,pending,ink,accent,width:estimatedWidth,height,footer,benefits,sourceBadge}:Props){
 const available=Math.max(0,height-footer),shortCard=duration>0&&duration<=15&&available<=32;
 const [measuredWidth,setMeasuredWidth]=React.useState(0);
 const measure=React.useCallback((event:{nativeEvent:{layout:{width:number}}})=>{
  const value=event.nativeEvent.layout.width;
  setMeasuredWidth(previous=>Math.abs(previous-value)<.5?previous:value);
 },[]);
 const web=Platform.OS==='web';
 const width=(shortCard||web)&&measuredWidth>0?measuredWidth:estimatedWidth;
 const font=width<160?12:14,gap=available<85?1:2;
 const phasePosition=phase.match(/Fase\s+(\d+\/\d+)/i)?.[1];
 const phaseDetail=phase.replace(/Fase\s+\d+\/\d+\s*(?:·\s*)?/i,'').trim();
 const phaseLabel=/^Posa\b/i.test(phaseDetail)?`+ ${phaseDetail}`:phaseDetail;
 const processingLabel=/^Posa\b/i.test(phaseDetail)?phaseLabel:'';
 const badgeTone=getAgendaAppointmentBadgeTone(ink);
 const compactBadges=height<=64,badgeSize=compactBadges?18:20;
 const phaseBadgeWidth=phasePosition?Math.max(compactBadges?24:30,Math.ceil(phasePosition.length*(compactBadges?9:10)*.6)+8):0;
 const cornerWidth=(sourceBadge?badgeSize:0)+phaseBadgeWidth+(sourceBadge&&phasePosition?4:0);
 const cornerInFooter=compactBadges&&footer>=20;
 const inline=agendaCompactFields({width:width-26-(cornerInFooter?6:cornerWidth+8),bodyHeight:available,duration,client,service,time,phase:phaseLabel,operator,pending});
 const padding=inline?0:available<42?0:available<85?3:web?9:6;
 const leftPadding=inline?26:width<160?24:36,textWidth=Math.max(20,width-leftPadding-padding-4);
 const cornerRowHeight=cornerWidth&&!cornerInFooter?badgeSize:14;
 const clientHeight=(compactBadges?1:linesFor(client,textWidth,font))*(font+3);
 let remaining=available-padding*2-clientHeight;
 const showTime=remaining>=cornerRowHeight+gap&&textWidth>=time.length*11*.53+(cornerInFooter?0:cornerWidth+8);
 const reserveCornerRow=!showTime&&!cornerInFooter&&cornerWidth>0&&remaining>=badgeSize+gap;
 if(showTime)remaining-=cornerRowHeight+gap;else if(reserveCornerRow)remaining-=badgeSize+gap;
 const serviceHeight=linesFor(service,textWidth,web?13:12)*(web?16:15)+gap;
 const phaseHeight=phaseLabel?linesFor(phaseLabel,textWidth,11)*14+gap+2:0;
 const canInlineProcessing=!!processingLabel&&linesFor(service,textWidth-processingLabel.length*11*.53-7,web?13:12)===1;
 const preferProcessing=!!processingLabel&&!canInlineProcessing&&remaining<serviceHeight+phaseHeight;
 const showService=remaining>=serviceHeight&&!preferProcessing;if(showService)remaining-=serviceHeight;
 const showInlineProcessing=showService&&canInlineProcessing;
 const showPhase=!!phaseLabel&&!showInlineProcessing&&remaining>=phaseHeight;if(showPhase)remaining-=phaseHeight;
 const showDuration=remaining>=14+gap;if(showDuration)remaining-=14+gap;
 const showOrigin=remaining>=22;
 // Grow only a name that fits on one line, with spare height after every
 // currently visible detail and the action footer have already been reserved.
 const nameRoom=textWidth-(!showTime&&!reserveCornerRow&&!cornerInFooter?cornerWidth+4:0);
 const largerNameWidth=[...client].reduce((sum,char)=>sum+16*(/\s/.test(char)?.35:/[ilIjtfr.,:;!'|]/.test(char)?.38:/[MWmw@%&]/.test(char)?1:/[A-ZÀ-Ý]/.test(char)?.79:char.codePointAt(0)!>0x2E7F?1.1:.65),8);
 const growName=web&&!inline&&!compactBadges&&width>=220&&available>=64&&largerNameWidth<=nameRoom&&remaining-(showOrigin?22:0)>=5;
 const nameFont=growName?16:font,nameLineHeight=growName?20:font+3;
 const label=[time,client,service,`${duration} minuti`,phase,origin,operator,pending?'Da confermare':''].filter(Boolean).join(', ');
 return <View onLayout={shortCard||web?measure:undefined} pointerEvents="none" accessible accessibilityLabel={label} {...(web?{title:label} as any:{})} style={{position:'absolute',top:0,bottom:0,left:0,width:'100%',padding, paddingLeft:leftPadding,justifyContent:'flex-start',gap}}>
  <View style={{position:'absolute',left:0,top:0,bottom:0,width:5,borderTopLeftRadius:9,borderBottomLeftRadius:9,backgroundColor:accent}}/>
  {available>=26||inline?<View style={{position:'absolute',left:width<160?10:14,top:inline?(available-10)/2:padding+12,width:7,gap:2}}>{[0,1,2].map(row=><View key={row} style={{flexDirection:'row',gap:2}}>{[0,1].map(col=><View key={col} style={{width:2,height:2,borderRadius:1,backgroundColor:ink,opacity:.65}}/>)}</View>)}</View>:null}
  {cornerWidth>0?<View {...(web?{dataSet:{agendaAppointmentBadges:'true'}}:{})} style={{position:'absolute',top:cornerInFooter?height-badgeSize-3:4,right:4,flexDirection:'row',alignItems:'center',gap:4}}>
   {phasePosition?<View accessibilityLabel={`Fase ${phasePosition}`} style={{height:badgeSize,minWidth:phaseBadgeWidth,paddingHorizontal:4,borderRadius:badgeSize/2,borderWidth:0,backgroundColor:badgeTone.backgroundColor,alignItems:'center',justifyContent:'center'}}><Text style={{color:badgeTone.color,fontSize:compactBadges?9:10,lineHeight:12,fontWeight:'600',fontVariant:['tabular-nums']}}>{phasePosition}</Text></View>:null}
   {sourceBadge}
  </View>:null}
  {inline?<View {...(web?{dataSet:{agendaCompactAppointment:'true'}}:{})} style={{height:available,flexDirection:'row',alignItems:'center',gap:6,paddingRight:cornerInFooter?6:cornerWidth+8}}>
   <Text numberOfLines={1} style={{color:ink,fontSize:inline.detailSize,lineHeight:inline.lineHeight,fontVariant:['tabular-nums'],opacity:.8,flexShrink:0}}>{inline.time}</Text>
   <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.85} style={{color:ink,fontSize:inline.clientSize,lineHeight:inline.lineHeight,fontWeight:'600',minWidth:0,flexShrink:1}}>{client}</Text>
   {inline.service?<><View style={{width:1,height:10,backgroundColor:ink,opacity:.2}}/><Text numberOfLines={1} style={{color:ink,fontSize:inline.detailSize,lineHeight:inline.lineHeight,opacity:.88,flexShrink:0}}>{service}</Text></>:null}
   {inline.detail?<Text numberOfLines={1} style={{color:ink,fontSize:inline.detailSize,lineHeight:inline.lineHeight,opacity:.8,flexShrink:0}}>{inline.detail}</Text>:null}
   {inline.operator?<Text numberOfLines={1} style={{color:ink,fontSize:inline.detailSize,lineHeight:inline.lineHeight,opacity:.8,flexShrink:0}}>{operator}</Text>:null}
   {inline.benefits?benefits:null}
  </View>:<>
  {showTime?<View style={{minHeight:cornerRowHeight,flexDirection:'row',alignItems:'center',paddingRight:cornerInFooter?0:cornerWidth+4}}><Text style={{color:ink,fontSize:11,lineHeight:14,fontVariant:['tabular-nums'],opacity:.85,flexShrink:1}}>{time}</Text></View>:reserveCornerRow?<View style={{height:badgeSize}}/>:null}
  <Text numberOfLines={compactBadges?1:undefined} adjustsFontSizeToFit={compactBadges} minimumFontScale={.8} style={{color:ink,fontSize:nameFont,lineHeight:nameLineHeight,fontWeight:'600',minWidth:0,paddingRight:!showTime&&!reserveCornerRow&&!cornerInFooter?cornerWidth+4:0}}>{client}</Text>
  {showService?<View style={{flexDirection:'row',alignItems:'center',gap:7}}><Text style={{color:ink,fontSize:web?13:12,lineHeight:web?16:15,flexShrink:1,minWidth:0}}>{service}</Text>{showInlineProcessing?<Text style={{color:ink,fontSize:11,lineHeight:14,fontWeight:'500',opacity:.8,flexShrink:0}}>{processingLabel}</Text>:null}</View>:null}
  {showPhase?<View style={{alignSelf:'flex-start',borderRadius:6,paddingHorizontal:5,paddingVertical:1,backgroundColor:'rgba(255,255,255,.16)'}}><Text style={{color:ink,fontSize:11,lineHeight:14,fontWeight:'600'}}>{phaseLabel}</Text></View>:null}
  {showDuration?<Text style={{color:ink,fontSize:11,lineHeight:14,opacity:.8}}>{duration} min</Text>:null}
  {showOrigin?<View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:5,marginTop:3}}><Ionicons name={pending?'time-outline':origin==='Cliente'?'person-outline':origin==='Salone'?'storefront-outline':'person-circle-outline'} size={13} color={ink}/><Text style={{color:ink,fontSize:10,lineHeight:14,opacity:.8}}>{pending?'Da confermare':origin}{operator?` · ${operator}`:''}</Text>{benefits}</View>:null}
  </>}
 </View>;
}
