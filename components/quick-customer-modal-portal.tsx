import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// A native customer form has its own window so its available height is measured
// against the keyboard, rather than against the booking sheet underneath it.
export function QuickCustomerModalPortal({ enabled, onClose, children }: {
  enabled: boolean; onClose: () => void; children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    {Platform.OS === 'android' ? (
      // Android Modal owns a separate window; its system-bar insets can differ
      // from the screen underneath. Let the form footer use these real insets.
      <SafeAreaProvider style={styles.window}>
        <QuickCustomerWindow>{children}</QuickCustomerWindow>
      </SafeAreaProvider>
    ) : <QuickCustomerWindow>{children}</QuickCustomerWindow>}
  </Modal>;
}
function QuickCustomerWindow({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={[styles.window, { paddingTop: insets.top + 8 }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.viewport}>{children}</View>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  window: { flex: 1 },
  viewport: { flex: 1, minHeight: 0 },
});
