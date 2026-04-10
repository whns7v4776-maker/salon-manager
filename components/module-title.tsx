import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SALON_MODULES, SalonModuleKey } from '@/src/lib/salon-modules';

type ModuleTitleProps = {
  moduleKey: SalonModuleKey;
  title: string;
  onLongPress?: () => void;
};

export function ModuleTitle({ moduleKey, title, onLongPress }: ModuleTitleProps) {
  const moduleConfig = SALON_MODULES[moduleKey];

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconBadge,
          {
            backgroundColor: moduleConfig.accent.background,
            borderColor: moduleConfig.accent.border,
          },
        ]}
      >
        <Ionicons name={moduleConfig.icon.active} size={24} color={moduleConfig.accent.text} />
      </View>
      <Text style={styles.title} onLongPress={onLongPress}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: Platform.OS === 'android' ? 0 : -1,
    includeFontPadding: true,
    paddingHorizontal: Platform.OS === 'android' ? 4 : 0,
  },
});
