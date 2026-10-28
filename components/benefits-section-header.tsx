import { premiumSectionAccent } from './premium-section-accent';
import { useCustomerPremiumStyles, useCustomerPremiumAppearance } from './owner-premium-customers-style';
import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { benefitsDesign as baseBenefitsDesign } from './benefits-design';
export function BenefitsSectionHeader({title,description,icon,scope}:{title:string;description:string;icon:React.ComponentProps<typeof Ionicons>['name'];scope?:string}) {
 const d=useCustomerPremiumStyles(baseBenefitsDesign);
 const p=useCustomerPremiumAppearance();

 return <View style={{gap:12,marginBottom:4}}>
  {scope ? <Text style={{fontSize:11,fontWeight:'800',letterSpacing:1.1,color:p?.muted || '#8A6376'}}>{scope.toLocaleUpperCase('it')}</Text>:null}
  <View style={{...premiumSectionAccent(Boolean(p?.night),title),flexDirection:'row',alignItems:'center',gap:12}}>
   <View style={{width:44,height:44,borderRadius:15,backgroundColor:p?.field || '#FBE8EE',alignItems:'center',justifyContent:'center'}}><Ionicons name={icon} color={p?.ink || "#963B57"} size={23}/></View>
   <View style={{flex:1,gap:4}}><Text style={d.title}>{title}</Text><Text style={d.copy}>{description}</Text></View>
  </View>
 </View>;
}
