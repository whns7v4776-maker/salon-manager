import {Platform, type ModalProps} from 'react-native';

/** iPad sheets follow the window without replacing their editor or draft. */
export const TABLET_MODAL_ORIENTATIONS:ModalProps['supportedOrientations']=
  Platform.OS==='ios'&&Platform.isPad
    ? ['portrait','portrait-upside-down','landscape-left','landscape-right']
    : undefined;
