import React from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';

/** Native Agenda only: callers retain their inputs, refs, queries and filters. */
export function NativeAgendaSearchToolbar({children, style}: {children: React.ReactNode; style?: any}) {
  const {palette:p}=useAccessAppearance();
  const [open,setOpen]=React.useState(false);
  const items=React.Children.toArray(children);
  const input=items[0];
  const filters=items.slice(1);
  const field=React.isValidElement<{style?:any;autoFocus?:boolean}>(input)?React.cloneElement(input,{autoFocus:open,style:[input.props.style,{flex:1,minWidth:0,width:undefined,maxWidth:undefined,margin:0,paddingVertical:10,paddingHorizontal:12,minHeight:42,backgroundColor:'transparent',borderWidth:0,color:p.ink,textAlign:'left',borderRadius:12}]}):input;
  const search=<View style={{flexDirection:'row',alignItems:'center',borderRadius:14,borderWidth:StyleSheet.hairlineWidth,borderColor:p.border,backgroundColor:p.field,minHeight:44,overflow:'hidden'}}>
    {field}{filters.length?<Pressable accessibilityRole="button" accessibilityLabel="Chiudi ricerca" onPress={()=>{setOpen(false);Keyboard.dismiss();}} style={{width:40,height:42,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={18} color={p.ink}/></Pressable>:null}
  </View>;
  return <View style={[{minWidth:0,gap:8},style]}>
    {filters.length?<View style={{flexDirection:'row',alignItems:'center',gap:7,minWidth:0}}><View style={{flex:1,minWidth:0}}>{filters}</View>{!open?<Pressable accessibilityRole="button" accessibilityLabel="Cerca" onPress={()=>setOpen(true)} style={{width:42,height:42,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name="search-outline" size={20} color={p.ink}/></Pressable>:null}</View>:null}
    {open||!filters.length?search:null}
  </View>;
}
