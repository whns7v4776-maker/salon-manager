import React from 'react';
import {NativeModules,Platform} from 'react-native';
import Constants from 'expo-constants';
import type {IosTapProviderProps} from './ios-tap-to-pay-provider';

export function IosTapToPayProvider(props: IosTapProviderProps) {
  if(Platform.OS!=='ios' || !Constants.expoConfig?.extra?.terminalBuildEnabled || !NativeModules.StripeTerminalReactNative)return props.children;
  const Provider=require('./ios-tap-to-pay-session').IosTapSessionProvider;
  return <Provider {...props}/>;
}
