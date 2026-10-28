import {useEffect,useMemo,useState} from 'react';
import {Keyboard,Platform,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {resolveOwnerNavigationLayout} from './owner-navigation-layout';
import {useOwnerNavigationPreference} from './owner-navigation-preference';

export function useOwnerNativeNavigation() {
  const {width,height,fontScale}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const {preference,hydrated}=useOwnerNavigationPreference();
  const [keyboardHeight,setKeyboardHeight]=useState(()=>Platform.OS==='android'?(Keyboard.metrics()?.height??0):0);
  useEffect(()=>{
    if(Platform.OS!=='android')return;
    const show=Keyboard.addListener('keyboardDidShow',event=>setKeyboardHeight(event.endCoordinates.height));
    const hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboardHeight(0));
    return()=>{show.remove();hide.remove();};
  },[]);
  // Android adjustResize reduces the scene while typing. Opening the keyboard
  // must not turn a wide tablet into a different navigation mode.
  const layoutHeight=height+keyboardHeight;
  return useMemo(()=>resolveOwnerNavigationLayout({width,height:layoutHeight,fontScale,insetLeft:insets.left,insetRight:insets.right,preference:Platform.OS==='web'||!hydrated?'bottom':preference}),[width,layoutHeight,fontScale,insets.left,insets.right,preference,hydrated]);
}
