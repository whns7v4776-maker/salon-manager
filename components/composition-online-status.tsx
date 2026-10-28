import React from 'react';
import {Ionicons} from '@expo/vector-icons';
import {Text,View} from 'react-native';
import {useAccessAppearance} from './access-premium';
import type {CompositionOnlineEligibility} from '../src/lib/composition-online-eligibility';

export function CompositionOnlineStatus({status,explain=true}:{status:CompositionOnlineEligibility;explain?:boolean}){
 const {palette:p}=useAccessAppearance();
 return <View style={{gap:5,alignItems:'flex-start'}}><View style={{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:p.border,borderRadius:7,paddingHorizontal:7,paddingVertical:4,backgroundColor:status.online?(p.night?'rgba(216,194,155,.10)':'rgba(52,55,53,.06)'):(p.night?'rgba(170,139,181,.14)':'rgba(124,95,133,.08)')}}><Ionicons name={status.online?'globe-outline':'storefront-outline'} size={14} color={p.ink}/><Text style={{fontSize:12,lineHeight:16,color:p.ink,fontWeight:'500'}}>{status.online?'Compatibile online':'Solo salone'}</Text></View>{!status.online&&explain?<Text style={{fontSize:12,lineHeight:18,color:p.muted}}>{status.reasons.join(' ')}</Text>:null}</View>;
}
