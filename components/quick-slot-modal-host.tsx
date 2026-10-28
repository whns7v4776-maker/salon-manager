import React, { forwardRef, memo, useImperativeHandle, useState } from 'react';
import { Modal, type ModalProps } from 'react-native';

export type QuickSlotModalHandle = { dismiss: () => void };

// Dismiss the native surface without first rendering the entire Agenda. Each
// opening has its own draft identity, so a previous dismissal cannot hide it.
export const QuickSlotModalHost = memo(forwardRef<QuickSlotModalHandle,
  ModalProps & { presentationKey: object | null }
>(function QuickSlotModalHost({ presentationKey, visible, ...props }, ref) {
  const [dismissedPresentation, setDismissedPresentation] = useState<object | null>(null);
  useImperativeHandle(ref, () => ({
    dismiss: () => setDismissedPresentation(presentationKey),
  }), [presentationKey]);
  return <Modal {...props} visible={visible && dismissedPresentation !== presentationKey} />;
}));
