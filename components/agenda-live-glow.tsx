import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Circle } from 'react-native-svg';

const LiveSignal=createContext<{pulse:Animated.Value;sweep:Animated.Value;animate:boolean}|null>(null);
/** One shared phase for the radar and rail. Animation never renders the grid. */
export function AgendaLiveSignalProvider({enabled,children}:{enabled:boolean;children:React.ReactNode}) {
 const pulse=useRef(new Animated.Value(0)).current,sweep=useRef(new Animated.Value(0)).current;
 const [reduced,setReduced]=useState(true),[active,setActive]=useState(AppState.currentState!=='background'&&AppState.currentState!=='inactive');
 useEffect(()=>{let mounted=true;void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(mounted)setReduced(v);}).catch(()=>undefined);const motion=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced),state=AppState.addEventListener('change',v=>setActive(v==='active'));return()=>{mounted=false;motion.remove();state.remove();};},[]);
 const animate=enabled&&active&&!reduced;
 useEffect(()=>{pulse.setValue(0);sweep.setValue(0);if(!animate||Platform.OS==='web')return;const options={easing:Easing.linear,useNativeDriver:true,isInteraction:false};const breathing=Animated.loop(Animated.timing(pulse,{...options,toValue:1,duration:3600})),flow=Animated.loop(Animated.timing(sweep,{...options,toValue:1,duration:1900}));breathing.start();flow.start();return()=>{breathing.stop();flow.stop();};},[animate,pulse,sweep]);
 const value=useMemo(()=>({pulse,sweep,animate}),[pulse,sweep,animate]);
 return <LiveSignal.Provider value={value}>{Platform.OS==='web'?<style>{`
@keyframes agenda-coral-breathe{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes agenda-coral-wave{0%{transform:scale(.2);opacity:0}30%{opacity:.8}65%{opacity:1}100%{transform:scale(1.22);opacity:0}}
@keyframes agenda-coral-ring{0%{transform:scale(.55);opacity:0}22%{opacity:.95}100%{transform:scale(1);opacity:0}}
@keyframes agenda-coral-flow{from{transform:translate3d(var(--agenda-live-from, -100px),0,0)}to{transform:translate3d(var(--agenda-live-to, 1000px),0,0)}}
[data-agenda-radar-halo=true],[data-agenda-radar-core=true]{animation:agenda-coral-breathe 3.6s ease-in-out infinite!important;will-change:opacity}
[data-agenda-radar-wave=true]{animation:agenda-coral-wave 3.6s linear infinite!important;will-change:transform,opacity}
[data-agenda-radar-ring=true]{animation:agenda-coral-ring 2.4s cubic-bezier(.2,.7,.3,1) infinite!important;will-change:transform,opacity;box-shadow:0 0 6px rgba(237,155,148,.75),inset 0 0 4px rgba(237,155,148,.45)}
[data-agenda-live-sweep=true]{position:absolute;left:0;top:0;animation:agenda-coral-flow 1.9s linear infinite;will-change:transform;background:linear-gradient(90deg,transparent,rgba(255,184,173,.04) 18%,rgba(255,184,173,.22) 45%,rgba(255,206,195,.55) 68%,rgba(255,227,220,.85) 81%,rgba(255,184,173,.4) 91%,transparent);filter:blur(.55px) drop-shadow(0 0 3px rgba(255,157,145,.5));border-radius:50%;opacity:.85}
html[data-salon-agenda-visible="false"] [data-agenda-radar-halo=true],html[data-salon-agenda-visible="false"] [data-agenda-radar-core=true],html[data-salon-agenda-visible="false"] [data-agenda-radar-wave=true],html[data-salon-agenda-visible="false"] [data-agenda-radar-ring=true],html[data-salon-agenda-visible="false"] [data-agenda-live-sweep=true]{animation-play-state:paused!important}
[data-agenda-live-asleep=true],[data-agenda-live-asleep=true] *{animation-play-state:paused!important}
@media(prefers-reduced-motion:reduce){[data-agenda-radar-halo=true],[data-agenda-radar-core=true],[data-agenda-radar-wave=true],[data-agenda-radar-ring=true],[data-agenda-live-sweep=true]{animation:none!important}[data-agenda-live-sweep=true]{display:none}}
`}</style>:null}{children}</LiveSignal.Provider>;
}
/**
 * Web: pause a live decoration while it is scrolled out of view. The flag is
 * written straight onto the node, so sleeping and waking never re-render.
 */
export function useWebSleepOffscreen(ref:React.RefObject<unknown>,onChange?:(visible:boolean)=>void,mounted=true){
 const changeRef=useRef(onChange);changeRef.current=onChange;
 useEffect(()=>{
  if(Platform.OS!=='web'||typeof IntersectionObserver==='undefined')return;
  const node=ref.current as Element|null;
  if(!node||typeof node.setAttribute!=='function')return;
  const observer=new IntersectionObserver(entries=>{
   const visible=entries.some(entry=>entry.isIntersecting);
   node.setAttribute('data-agenda-live-asleep',visible?'false':'true');
   changeRef.current?.(visible);
  },{rootMargin:'64px'});
  observer.observe(node);
  return()=>observer.disconnect();
 },[ref,mounted]);
}
function useSignal(){const signal=useContext(LiveSignal);if(!signal)throw new Error('Agenda live signal provider missing');return signal;}
function opacity(pulse:Animated.Value,low:number,high:number){return pulse.interpolate({inputRange:[0,.25,.5,.75,1],outputRange:[low,(low+high)/2,high,(low+high)/2,low]});}
export function AgendaLiveRadar({night}:{night:boolean}) {
 const {pulse,animate}=useSignal(),id=`radar-${useId().replace(/:/g,'')}`;
 return <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFillObject,{borderRadius:100,overflow:'hidden',alignItems:'center',justifyContent:'center'}]}>
  <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}><Defs><RadialGradient id={id} cx="35%" cy="22%" r="85%"><Stop offset={0} stopColor={night?'#333C3E':'#444A49'}/><Stop offset={.72} stopColor={night?'#1C2325':'#262C2C'}/></RadialGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id})`}/></Svg>
  <Animated.View {...(Platform.OS==='web'&&animate?{dataSet:{agendaRadarHalo:'true'}}:{})} style={{position:'absolute',width:26,height:26,opacity:animate?opacity(pulse,.25,1):.55}}><Svg width={26} height={26} viewBox="0 0 22 22"><Defs><RadialGradient id={`${id}-halo`}><Stop offset={0} stopColor="#FFAFA8" stopOpacity={.42}/><Stop offset={.3} stopColor="#FF9A91" stopOpacity={.17}/><Stop offset={.7} stopColor="#FF9A91" stopOpacity={0}/></RadialGradient></Defs><Circle cx={11} cy={11} r={11} fill={`url(#${id}-halo)`}/></Svg></Animated.View>
  <Animated.View {...(Platform.OS==='web'&&animate?{dataSet:{agendaRadarWave:'true'}}:{})} style={{position:'absolute',width:29,height:29,opacity:animate?opacity(pulse,0,1):.35,transform:[{scale:animate?pulse.interpolate({inputRange:[0,1],outputRange:[.2,1]}):.8}]}}><Svg width={29} height={29} viewBox="0 0 25 25"><Defs><RadialGradient id={`${id}-wave`}><Stop offset={.48} stopColor="#FFAFA8" stopOpacity={0}/><Stop offset={.57} stopColor="#FFAFA8" stopOpacity={.6}/><Stop offset={.64} stopColor="#FF9A91" stopOpacity={.22}/><Stop offset={.74} stopColor="#FF9A91" stopOpacity={0}/></RadialGradient></Defs><Circle cx={12.5} cy={12.5} r={12.5} fill={`url(#${id}-wave)`}/></Svg></Animated.View>
  <Animated.View {...(Platform.OS==='web'&&animate?{dataSet:{agendaRadarCore:'true'}}:{})} style={{width:3.5,height:3.5,borderRadius:2,backgroundColor:'#FFD1CD',shadowColor:'#FFACA5',shadowOpacity:.85,shadowRadius:3,shadowOffset:{width:0,height:0},opacity:animate?opacity(pulse,.45,1):.8}}/>
 </View>;
}
/** Coral neon ring that leaves the clock edge and fades at the button rim, on the shared live beat. */
export function AgendaLiveClockRing(){
 const {pulse,animate}=useSignal();
 const ring=useRef<View>(null);
 useWebSleepOffscreen(ring,undefined,animate);
 if(!animate)return null;
 const web=Platform.OS==='web';
 return <Animated.View ref={ring} pointerEvents="none" accessible={false} {...(web?{dataSet:{agendaRadarRing:'true'}}:{})} style={[StyleSheet.absoluteFillObject,{borderRadius:100,borderWidth:1.5,borderColor:'#ED9B94'},web?null:{shadowColor:'#ED9B94',shadowOpacity:.8,shadowRadius:4,shadowOffset:{width:0,height:0},opacity:pulse.interpolate({inputRange:[0,.22,1],outputRange:[0,.95,0]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.55,1]})}]}]}/>;
}
export function AgendaLiveGlow({enabled}:{night:boolean;enabled:boolean}) {
 const {pulse,sweep,animate}=useSignal(),[width,setWidth]=useState(0),id=`rail-${useId().replace(/:/g,'')}`;
 if(!enabled)return null;
 return <View pointerEvents="none" accessible={false} style={{position:'absolute',left:0,right:0,top:-8,height:16,zIndex:Platform.OS==='web'?2:undefined}} onLayout={e=>setWidth(previous=>Math.abs(previous-e.nativeEvent.layout.width)<.5?previous:e.nativeEvent.layout.width)}>
  {[{top:0,height:8,upper:true},{top:9,height:6,upper:false}].map(({top,height,upper},i)=><Animated.View key={i} style={{position:'absolute',left:0,right:0,top,height,opacity:animate?opacity(pulse,upper?.04:.025,upper?.24:.12):upper?.14:.07}}><Svg width="100%" height={height}><Defs><LinearGradient id={`${id}-${i}`} x1="0%" y1={upper?'100%':'0%'} x2="0%" y2={upper?'0%':'100%'}><Stop offset={0} stopColor="#ED9B94" stopOpacity={upper?.85:.65}/><Stop offset={1} stopColor="#ED9B94" stopOpacity={0}/></LinearGradient></Defs><Rect width="100%" height={height} fill={`url(#${id}-${i})`}/></Svg></Animated.View>)}
  {animate&&width>0&&Platform.OS==='web'?<View style={{position:'absolute',left:0,right:0,top:4,height:10,overflow:'hidden'}}>{React.createElement('div',{'data-agenda-live-sweep':'true',style:{width:Math.min(width*.34,280),height:4,top:2.625,'--agenda-live-from':`${-.36*width}px`,'--agenda-live-to':`${1.14*width}px`}})}</View>:null}
  {animate&&width>0&&Platform.OS!=='web'?<View style={{position:'absolute',left:0,right:0,top:6,height:5,overflow:'hidden'}}><Animated.View style={{width:Math.min(width*.34,280),height:4,opacity:.85,transform:[{translateX:sweep.interpolate({inputRange:[0,1],outputRange:[-.36*width,1.14*width]})}]}}><Svg width="100%" height={4}><Defs><LinearGradient id={`${id}-sweep`} x1="0%" y1="0%" x2="100%" y2="0%">{[0,.04,.22,.55,.85,.4,0].map((v,i)=><Stop key={i} offset={[0,.18,.45,.68,.81,.91,1][i]} stopColor={i===4?'#FFE3DC':'#FFB8AD'} stopOpacity={v}/>)}</LinearGradient></Defs><Rect width="100%" height={4} rx={2} fill={`url(#${id}-sweep)`}/></Svg></Animated.View></View>:null}
 </View>;
}
