import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { HapticTouchable } from './ui/haptic-touchable';
/** Entry only: the original Agenda editor owns all scheduling and persistence. */
export function AvailabilitySettingsEntry({onPress,description=false}:{onPress:()=>void;description?:boolean}){
 const {palette:p}=useAccessAppearance();
 return <HapticTouchable accessibilityRole="button" accessibilityLabel="Apri Orari e disponibilità" onPress={onPress} style={{flexDirection:'row',alignItems:'center',gap:12,padding:16,marginBottom:14,borderRadius:18,borderWidth:1,borderColor:p.border,backgroundColor:p.night?'rgba(40,44,43,.9)':'rgba(250,247,241,.85)'}}><Ionicons name="calendar-outline" size={23} color={p.ink}/><View style={{flex:1,gap:5}}><Text style={{fontSize:15,fontWeight:'600',color:p.ink}}>Orari e disponibilità</Text>{description?<Text style={{fontSize:12,lineHeight:18,color:p.muted}}>Settimana, pause, ferie ed eccezioni calendario.</Text>:null}</View><Ionicons name="chevron-forward" size={18} color={p.muted}/></HapticTouchable>;
}
