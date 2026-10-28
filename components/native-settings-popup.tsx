import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { OwnerPremiumPopup } from './owner-premium-sheet';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Keyboard, Modal, Platform, type ScrollView } from 'react-native';
import { CreationSheet } from './creation-sheet';

/** Keeps desktop and already embedded editors inline. */
export function NativeSettingsPopup({ title, icon, onClose, inline = false, animationType = 'slide', overlays, onOverlayBack, children, compact = false, footer, premiumWeb = false, scrollRef, iconAccent }: React.PropsWithChildren<{
  /** Hex accent: draws the header icon as an enamel medallion on native sheets. */
  iconAccent?: string;
  compact?: boolean;
  premiumWeb?: boolean;
  scrollRef?: React.MutableRefObject<ScrollView | null>;
  footer?: React.ReactNode;
  title: string;
  icon: React.ComponentProps<typeof CreationSheet>['icon'];
  onClose: () => void;
  inline?: boolean;
  overlays?: React.ReactNode;
  onOverlayBack?: () => boolean;
  animationType?: 'slide' | 'fade' | 'none';
}>) {
  if (Platform.OS === 'web' && premiumWeb && !inline) return <OwnerPremiumPopup title={title} icon={icon} onClose={onClose} footer={footer} scrollRef={scrollRef}>{children}{overlays}</OwnerPremiumPopup>;
  if (Platform.OS === 'web' || inline) return <>{children}{footer}{overlays}</>;
  const close = () => { Keyboard.dismiss(); onClose(); };
  return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible transparent animationType="none" onRequestClose={() => { if (!onOverlayBack?.()) close(); }}>
    <GestureHandlerRootView style={{ flex: 1 }}>
    <CreationSheet scrollRef={scrollRef} premiumWeb={premiumWeb} animatePresentation title={title} icon={icon} iconAccent={iconAccent} onClose={close} fillAvailableHeight={!compact} stableKeyboardScroll={compact} footer={footer}>{children}</CreationSheet>
    {overlays}
    </GestureHandlerRootView>
  </Modal>;
}
