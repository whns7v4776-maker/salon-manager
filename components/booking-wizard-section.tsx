import React from 'react';
import {View, Text, type ViewProps} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {HapticTouchable} from './ui/haptic-touchable';
import {useAccessAppearance} from './access-premium';

type Props = ViewProps & {step:number;title:string;summary?:string;open:boolean;locked?:boolean;onOpen:()=>void};
/** Closed steps expose a summary, not an inactive copy of the form. */
export function BookingWizardSection({step,title,summary,open,locked,onOpen,children,style,...props}:Props){
 const {palette:p}=useAccessAppearance();
 if(open)return <View {...props} style={[style,{borderWidth:1,borderColor:p.night?'#8DAFCA':'#507D9A',backgroundColor:p.night?'#25343D':'#EDF3F7',borderRadius:18}]}>{children}</View>;
 return <View {...props} style={{borderBottomWidth:1,borderBottomColor:p.line,marginBottom:4}}>
  <HapticTouchable accessibilityRole="button" accessibilityLabel={`${summary?'Modifica':'Apri'} ${title}`} accessibilityState={{disabled:!!locked,expanded:false}} disabled={locked} onPress={onOpen} hapticType="light" style={{minHeight:62,paddingHorizontal:12,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12}}>
   <Text style={{color:p.muted,fontSize:12,width:22}}>{String(step).padStart(2,'0')}</Text>
   <View style={{flex:1,gap:3}}><Text style={{fontSize:14,fontWeight:'600',color:locked?p.muted:p.ink}}>{title}</Text>{summary&&!locked?<Text style={{color:p.muted,fontSize:12,lineHeight:17}}>{summary}</Text>:null}</View>
   {!locked?<><Text style={{color:p.muted,fontSize:12}}>{summary?'Modifica':'Apri'}</Text><Ionicons name="chevron-forward" size={15} color={p.muted}/></>:null}
  </HapticTouchable>
 </View>;
}
