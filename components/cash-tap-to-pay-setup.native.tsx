import React from 'react';
import {NativeModules,Platform} from 'react-native';
import Constants from 'expo-constants';
export function CashTapToPaySetup() {
  if(Platform.OS!=='ios' || !Constants.expoConfig?.extra?.terminalBuildEnabled || !NativeModules.StripeTerminalReactNative)return null;
  const Setup=require('./ios-tap-to-pay-session').IosTapToPaySetup;
  return <Setup/>;
}
