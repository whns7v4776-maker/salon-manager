import React from 'react';
import {Platform} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAccessAppearance} from '../access-premium';
import {HapticTouchable} from './haptic-touchable';

type Props=React.ComponentProps<typeof HapticTouchable>&{size?:number};

/** The circled i from Services web, shared by all information actions. */
export function InfoButton({style,size,accessibilityLabel='Informazioni',...props}:Props){
 const {palette:p}=useAccessAppearance();
 const edge=Platform.OS==='web'?(size??48):Math.min(size??28,28);
 return <HapticTouchable {...props} {...(Platform.OS!=='web'?{hitSlop:props.hitSlop??8}:{})} accessibilityRole="button" accessibilityLabel={accessibilityLabel} immediatePress delayPressIn={0} style={[style,{width:edge,height:edge,minWidth:edge,minHeight:edge,maxWidth:edge,flexShrink:0,padding:0,borderRadius:edge<36?8:12,borderWidth:1,borderColor:p.border,backgroundColor:p.night?'#2B2B29':'#E8E3DA',alignItems:'center',justifyContent:'center',shadowOpacity:0,elevation:0}]}><Ionicons name="information-circle-outline" size={edge<36?18:21} color={p.ink}/></HapticTouchable>;
}
