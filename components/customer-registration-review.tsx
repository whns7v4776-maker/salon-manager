import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useCustomerPremiumStyles } from './owner-premium-customers-style';

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';

export const CustomerRegistrationReview = React.memo(function CustomerRegistrationReview({
  name,
  decision,
  onApprove,
  onReject,
}: {
  name: string;
  decision?: 'approved' | 'rejected';
  onApprove: () => void;
  onReject: () => void;
}) {
 const styles=useCustomerPremiumStyles(baseCustomerComponentStyles);

  const busy = !!decision;
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <Ionicons name="person-add-outline" size={13} color="#315C8A" />
        <Text style={styles.badgeText}>Da approvare</Text>
      </View>
      <View style={styles.actions}>
        <HapticTouchable
          accessibilityRole="button"
          accessibilityLabel={`Approva la registrazione di ${name}`}
          accessibilityState={{ disabled: busy, busy: decision === 'approved' }}
          aria-busy={decision === 'approved'}
          disabled={busy}
          onPress={onApprove}
          style={[styles.approveButton, busy && styles.busy]}
        >
          {decision === 'approved'
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Text style={styles.approveText}>Approva</Text>}
        </HapticTouchable>
        <HapticTouchable
          accessibilityRole="button"
          accessibilityLabel={`Rifiuta la registrazione di ${name}`}
          accessibilityState={{ disabled: busy, busy: decision === 'rejected' }}
          aria-busy={decision === 'rejected'}
          disabled={busy}
          onPress={onReject}
          style={[styles.rejectButton, busy && styles.busy]}
        >
          {decision === 'rejected'
            ? <ActivityIndicator size="small" color="#9F2940" />
            : <Text style={styles.rejectText}>Rifiuta</Text>}
        </HapticTouchable>
      </View>
    </View>
  );
});

const baseCustomerComponentStyles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 12, backgroundColor: '#EAF2FF', paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { color: '#315C8A', fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  approveButton: { minHeight: 44, minWidth: 78, borderRadius: 14, paddingHorizontal: 11,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB' },
  approveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  rejectButton: { minHeight: 44, minWidth: 68, borderRadius: 14, paddingHorizontal: 11,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7F8', borderWidth: 1, borderColor: '#E9D5DA' },
  rejectText: { color: '#9F2940', fontSize: 12, fontWeight: '700' },
  busy: { opacity: 0.65 },
});

