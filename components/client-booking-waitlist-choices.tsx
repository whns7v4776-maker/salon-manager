import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { ClientBookingText as Text } from './client-booking-text';
import { useAccessAppearance } from './access-premium';
import type { JourneyWaitlistChoice } from './client-booking-journey';

/** Native notification requests have their own hierarchy, separate from bookable times. */
export function ClientBookingWaitlistChoices({ choices }: { choices: JourneyWaitlistChoice[] }) {
  const { palette: p } = useAccessAppearance();
  const { width, fontScale } = useWindowDimensions();
  const stack = width < 350 || fontScale > 1.3;
  const renderChoice = (item: JourneyWaitlistChoice, wholeDay: boolean) => <Pressable key={item.key}
    accessibilityRole="button" accessibilityLabel={`${item.active ? 'Avviso attivo' : 'Attiva avviso'}: ${item.label}. ${item.hint}`}
    accessibilityState={{ disabled: item.busy || item.active, busy: item.busy }} disabled={item.busy || item.active} onPress={item.onPress}
    style={({ pressed }) => ({ flex: wholeDay || stack ? undefined : 1, width: wholeDay || stack ? '100%' : undefined, minWidth: 0,
      padding: 13, borderRadius: 16, borderWidth: 1, minHeight: wholeDay ? 76 : 108, gap: 7,
      borderColor: wholeDay ? p.night ? '#746B55' : '#D8C8A9' : p.border,
      backgroundColor: wholeDay ? p.night ? '#343329' : '#EFE5D2' : p.night ? '#263136' : '#EEF2F2',
      opacity: item.busy ? .55 : pressed ? .75 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Ionicons name={item.active ? 'notifications' : 'notifications-outline'} size={19} color={wholeDay ? p.night ? '#DBC69E' : '#715F3B' : p.night ? '#B5CED0' : '#4F7073'} />
      <Text style={{ flex: 1, minWidth: 0, color: p.ink, fontSize: 13, lineHeight: 20, fontWeight: '600' }}>{item.label}</Text>
      {item.active ? <Ionicons name="checkmark-circle" size={17} color={p.night ? '#9BC8A8' : '#4C7757'} /> : null}
    </View>
    {!wholeDay ? <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>{item.hint}</Text> : null}
    <Text style={{ color: p.muted, fontSize: 11, lineHeight: 17, fontWeight: '500' }}>{item.busy ? 'Attivazione…' : item.active ? 'Avviso attivo' : wholeDay ? 'Avvisami durante la giornata' : 'Avvisami in questa fascia'}</Text>
  </Pressable>;
  const wholeDay = choices.filter(item => item.key === 'day');
  const periods = choices.filter(item => item.key !== 'day');
  return <View style={{ gap: 10 }}>
    <Text style={{ color: p.muted, fontSize: 12, lineHeight: 19 }}>Ricevi una notifica se si libera un posto nella fascia scelta.</Text>
    {wholeDay.map(item => renderChoice(item, true))}
    {periods.length ? <View style={{ flexDirection: stack ? 'column' : 'row', gap: 10 }}>{periods.map(item => renderChoice(item, false))}</View> : null}
  </View>;
}
