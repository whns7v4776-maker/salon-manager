import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/** A guest inside a salon entrance, without an add-customer symbol. */
export function WelcomeSalonIcon({color,size=24}:{color:string;size?:number}) {
 return <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
  <Path d="M4 12v12h20V12M3 11l3-7h16l3 7M3 11c0 3 5.5 3 5.5 0 0 3 5.5 3 5.5 0 0 3 5.5 3 5.5 0 0 3 5.5 3 5.5 0M8.5 11l1-7M19.5 11l-1-7" stroke={color} strokeWidth={1.45} strokeLinecap="round" strokeLinejoin="round"/>
  <Circle cx={14} cy={16.5} r={2.1} stroke={color} strokeWidth={1.45}/>
  <Path d="M10 24v-1.3a4 4 0 0 1 8 0V24" stroke={color} strokeWidth={1.45} strokeLinecap="round"/>
 </Svg>;
}
