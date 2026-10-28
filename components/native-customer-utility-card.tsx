import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { HapticTouchable } from './ui/haptic-touchable';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  action: string;
  accessibilityLabel: string;
  onPress: () => void;
  status?: { label: string; active: boolean };
};

/** Native footer layout: copy always has the full card width and grows with text. */
export function NativeCustomerUtilityCard({icon,title,description,action,accessibilityLabel,onPress,status}: Props) {
  const {palette:p} = useAccessAppearance();
  const welcome = icon === 'storefront-outline';
  const iconInk = welcome ? (p.night?'#A8CDB4':'#52795E') : (p.night?'#C9B6E2':'#806399');
  const iconFill = welcome ? (p.night?'rgba(112,157,128,.19)':'rgba(191,216,195,.45)') : (p.night?'rgba(162,132,191,.20)':'rgba(218,201,235,.48)');
  return <View style={[s.card,{backgroundColor:p.night?'rgba(38,41,43,.80)':'rgba(255,253,250,.67)',borderColor:p.border}]}>
    <View style={s.heading}>
      <View style={[s.icon,{backgroundColor:iconFill}]}><Ionicons name={icon} size={21} color={iconInk}/></View>
      <Text accessibilityRole="header" style={[s.title,{color:p.ink}]}>{title}</Text>
    </View>
    <Text style={[s.description,{color:p.muted}]}>{description}</Text>
    <View style={s.footer}>
      {status ? <View style={[s.status,{backgroundColor:status.active?(p.night?'rgba(141,172,149,.18)':'rgba(214,229,209,.65)'):p.field}]}>
        <Text style={[s.statusText,{color:status.active?(p.night?'#C1D6C4':'#42684A'):p.muted}]}>{status.label}</Text>
      </View> : null}
      <HapticTouchable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={[s.action,{borderColor:p.border,backgroundColor:p.field}]}>
        <Text style={[s.actionText,{color:p.ink}]}>{action}</Text><Ionicons name="arrow-forward" size={17} color={p.ink}/>
      </HapticTouchable>
    </View>
  </View>;
}
const s=StyleSheet.create({
  card:{width:'100%',alignSelf:'stretch',padding:14,borderWidth:1,borderRadius:20,marginBottom:12,gap:10},
  heading:{flexDirection:'row',alignItems:'center',gap:10},
  icon:{width:36,height:36,borderRadius:11,alignItems:'center',justifyContent:'center',flexShrink:0},
  title:{flex:1,minWidth:0,fontSize:17,lineHeight:23,fontWeight:'500'},
  description:{fontSize:13,lineHeight:19},
  footer:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:10},
  status:{paddingHorizontal:10,paddingVertical:6,borderRadius:10},
  statusText:{fontSize:12,lineHeight:17,fontWeight:'500'},
  action:{marginLeft:'auto',minHeight:42,paddingHorizontal:13,paddingVertical:9,borderWidth:1,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  actionText:{fontSize:13,lineHeight:19,fontWeight:'500'},
});
