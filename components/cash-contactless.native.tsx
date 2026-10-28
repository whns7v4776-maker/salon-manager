import React from 'react';
import {NativeModules,Platform,Text} from 'react-native';
import Constants from 'expo-constants';
import type {ContactlessProps} from './cash-contactless';

// Do not import the SDK on old development/production binaries: its module-level
// getConstants() would crash the entire Cassa before the user touches a button.
export function CashContactless(props:ContactlessProps) {
 if (!Constants.expoConfig?.extra?.terminalBuildEnabled || !NativeModules.StripeTerminalReactNative) {
  return <Text style={{color:'#64748B',fontSize:12,lineHeight:18}}>Contactless in preparazione · richiede la nuova versione dell’app abilitata a Tap to Pay. QR / link restano disponibili.</Text>;
 }
 const Component = Platform.OS==='ios'
  ? require('./ios-tap-to-pay-session').IosTapToPayCheckout
  : require('./cash-contactless-session').CashContactlessSession;
 return <Component {...props}/>;
}
