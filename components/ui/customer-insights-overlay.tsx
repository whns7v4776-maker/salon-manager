import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import React from 'react';
import { Modal, Platform } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

/** iOS: mount directly above the screen instead of queuing a modal controller
 * presentation while the parent screen is scrolling or transitioning. */
export function CustomerInsightsOverlay({ visible, onClose, children }: React.PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
}>) {
  if (Platform.OS === 'ios') {
    return visible ? (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        {children}
      </FullWindowOverlay>
    ) : null;
  }
  return (
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {children}
    </Modal>
  );
}
