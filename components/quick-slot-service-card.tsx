import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { HapticTouchable } from './ui/haptic-touchable';
import { quickSlotDesign as baseStyles } from './quick-slot-design';
import { useAccessAppearance } from './access-premium';
import { createAgendaPremiumStyles } from './agenda-premium-style';
import { haptic } from '../src/lib/haptics';
import { BarberPoleIcon } from './ui/barber-pole-icon';

type Props = React.ComponentProps<typeof HapticTouchable> & {
  serviceName: string;
  serviceRole?: string;
  selection: React.ReactNode;
  actions?: { edit: () => void; remove: () => void; deleting: boolean };
};

// The card owns only presentation. Agenda owns selection, editing and the
// existing deletion confirmation; opening this menu never performs an action.
export function QuickSlotServiceCard({ serviceName, serviceRole, selection, actions, children, style, ...props }: Props) {
  const {palette}=useAccessAppearance();
  const s=useMemo(()=>createAgendaPremiumStyles(baseStyles,palette),[palette]);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const menuAnchor = useRef<View>(null);
  const viewport = useWindowDimensions();
  useEffect(() => { setMenuPosition(null); }, [viewport.width, viewport.height]);
  const openWebMenu = () => {
    menuAnchor.current?.measureInWindow((x, y, width, height) => {
      const left = Math.max(12, Math.min(x + width - 140, viewport.width - 152));
      const below = y + height + 6;
      const top = below + 80 <= viewport.height - 12 ? below : Math.max(12, y - 86);
      setMenuPosition({ left, top });
    });
  };
  const offset = useSharedValue(0);
  const feedbackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const openActions = () => {
    if (!actions || props.disabled) return;
    offset.value = withSequence(withTiming(-2, { duration: 35 }), withTiming(2, { duration: 50 }), withTiming(-1, { duration: 40 }), withTiming(0, { duration: 40 }));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({
        title: serviceName,
        options: ['Annulla', 'Modifica', 'Elimina'],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 2,
        disabledButtonIndices: actions.deleting ? [2] : [],
      }, (index) => {
        if (index === 1) actions.edit();
        if (index === 2 && !actions.deleting) actions.remove();
      });
    } else {
      Alert.alert(serviceName, 'Gestisci il componente', [
        { text: 'Modifica', onPress: actions.edit },
        ...(!actions.deleting ? [{ text: 'Elimina', style: 'destructive' as const, onPress: actions.remove }] : []),
        { text: 'Annulla', style: 'cancel' },
      ]);
    }
  };
  const nativeActions = Platform.OS !== 'web' && !!actions;
  return <><Animated.View style={[{ width: '100%' }, feedbackStyle]}>
    <HapticTouchable {...props}
      style={[style,{borderColor:palette.line}]}
      hapticType={Platform.OS === 'web' ? props.hapticType : 'none'}
      onPressIn={Platform.OS === 'web' ? props.onPressIn : () => {
        if (!props.disabled) void haptic.light();
      }}
      onLongPress={nativeActions ? openActions : undefined}
      delayLongPress={420}
      longPressHapticType="medium"
      accessibilityRole="button"
      accessibilityHint={nativeActions ? 'Tieni premuto per modificare o eliminare il componente' : undefined}
    >
      <View style={s.serviceHeader} pointerEvents="box-none">
        {serviceRole?.trim().toLowerCase() === 'barber'
          ? <BarberPoleIcon />
          : <Ionicons name="cut-outline" size={17} color={palette.ink} />}
        <View style={s.serviceHeaderEnd} pointerEvents="box-none">
        {Platform.OS === 'web' && actions ? <View ref={menuAnchor} collapsable={false}>
          <HapticTouchable
          onPress={(event) => { event.stopPropagation(); openWebMenu(); }}
          style={s.serviceMenuButton}
          pressScale={0.96}
          accessibilityRole="button"
          accessibilityLabel={`Azioni per ${serviceName}`}
          accessibilityState={{ expanded: !!menuPosition }}
          aria-haspopup="menu"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={palette.ink} />
        </HapticTouchable></View> : null}
        {selection ? <View style={s.serviceHeaderSelection}>{selection}</View> : null}
        </View>
      </View>
      {children}
    </HapticTouchable>
  </Animated.View>
    {Platform.OS === 'web' && menuPosition && actions ? <Modal transparent visible animationType="none" onRequestClose={() => setMenuPosition(null)}>
      <Pressable style={s.serviceMenuBackdrop} onPress={() => setMenuPosition(null)} accessible={false} />
      <View style={[s.serviceMenu, menuPosition]} accessibilityRole="menu" accessibilityLabel={`Azioni per ${serviceName}`}>
        <HapticTouchable style={s.serviceMenuItem} onPress={(event) => { event.stopPropagation(); setMenuPosition(null); actions.edit(); }} accessibilityRole="menuitem" accessibilityLabel={`Modifica ${serviceName}`}>
          <Ionicons name="pencil-outline" size={15} color={palette.ink} /><Text style={s.serviceMenuText}>Modifica</Text>
        </HapticTouchable>
        <View style={s.serviceMenuDivider} />
        <HapticTouchable style={[s.serviceMenuItem, actions.deleting && { opacity: 0.45 }]} disabled={actions.deleting} onPress={(event) => { event.stopPropagation(); setMenuPosition(null); actions.remove(); }} accessibilityRole="menuitem" accessibilityLabel={`Elimina ${serviceName}`}>
          <Ionicons name="trash-outline" size={15} color="#B91C1C" /><Text style={[s.serviceMenuText, { color: '#B91C1C' }]}>Elimina</Text>
        </HapticTouchable>
      </View>
    </Modal> : null}
  </>;
}
