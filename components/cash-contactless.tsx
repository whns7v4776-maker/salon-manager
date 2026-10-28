import React from 'react';
import {Text} from 'react-native';
export type ContactlessProps = {movementId:string;disabled?:boolean;onPaid:()=>void;onBusyChange?:(busy:boolean)=>void};
export function CashContactless(_props:ContactlessProps) {
 return <Text style={{color:'#64748B',fontSize:12,lineHeight:18}}>Contactless disponibile nell’app su un telefono compatibile. Dal web puoi usare QR / link o registrare un POS esterno.</Text>;
}
