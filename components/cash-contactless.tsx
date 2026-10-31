import React from 'react';
import {Text} from 'react-native';
export type ContactlessProps = {movementId:string;disabled?:boolean;onPaid:()=>void;onBusyChange?:(busy:boolean)=>void;
 /** Start reading as soon as the panel opens (one-tap checkout from the appointment). */
 autoStart?:boolean};
export function CashContactless(_props:ContactlessProps) {
 return <Text style={{color:'#64748B',fontSize:12,lineHeight:18}}>Contactless disponibile nell’app su un telefono compatibile. Dal web puoi usare QR / link o registrare un POS esterno.</Text>;
}
