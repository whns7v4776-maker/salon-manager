import {InfoButton} from './info-button';
import { useAccessAppearance } from '../access-premium';
import React from 'react';
import {
  Platform,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { PremiumExpandButton } from './premium-expand-button';

type PremiumGuideDockProps = {
  tone?: {ink:string;fill:string;border:string};
  guideOpen: boolean;
  editIcon?: boolean;
  expandButtonStyle?: StyleProp<ViewStyle>;
  smallExpand?: boolean;
  stacked?: boolean;
  onGuidePress: () => void;
  guideAccessibilityLabel: string;
  expanded?: boolean;
  onExpandPress?: () => void;
  expandAccessibilityLabel?: string;
  onExpandTouchStart?: (event: unknown) => void;
  onTouchStart?: (event: unknown) => void;
  infoOnRight?: boolean;
  mode?: 'corner' | 'inline';
  cutoutColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function PremiumGuideDock({
  guideOpen,
  tone: providedTone,
  editIcon = false,
  expandButtonStyle,
  smallExpand = false,
  stacked = false,
  onGuidePress,
  guideAccessibilityLabel,
  expanded,
  onExpandPress,
  expandAccessibilityLabel,
  onExpandTouchStart,
  onTouchStart,
  infoOnRight = false,
  mode = 'corner',
  style,
}: PremiumGuideDockProps) {
  const { palette } = useAccessAppearance();
  const tone = providedTone ?? { ink: palette.ink, fill: palette.field, border: palette.border };
  const showsExpand =
    typeof expanded === 'boolean' &&
    !!onExpandPress &&
    !!expandAccessibilityLabel;
  const cornerInfo = mode === 'corner' && !showsExpand;
  const infoAtRight = !showsExpand && (infoOnRight || cornerInfo);
  const expandButton = showsExpand ? (
    <PremiumExpandButton tone={tone}
      salon
      editIcon={editIcon}
      compact
      expanded={expanded}
      style={[styles.expandButton, expandButtonStyle, smallExpand && { width: 28, height: 28, minHeight: 28, borderRadius: 14, shadowOpacity: 0, elevation: 0 }]}
      onTouchStart={onExpandTouchStart}
      onPress={onExpandPress}
      accessibilityLabel={expandAccessibilityLabel}
    />
  ) : null;

  return (
    <View
      onTouchStart={onTouchStart}
      pointerEvents="box-none"
      style={[
        styles.dock,
        mode === 'corner' ? styles.dockCorner : styles.dockInline,
        showsExpand ? styles.dockWithExpand : styles.dockInfoOnly,
        stacked && { flexDirection: 'column', width: Platform.OS==='web'?48:28, minWidth:Platform.OS==='web'?44:28, gap:10 },
        style,
        showsExpand && mode === 'corner' && {left:10,right:10,width:'auto',flexDirection:'row',justifyContent:'space-between'},
      ]}
    >
      {infoAtRight && !stacked ? expandButton : null}
      <View style={cornerInfo ? styles.cornerSocket : undefined}>
      <InfoButton accessibilityLabel={guideAccessibilityLabel} accessibilityState={{expanded:guideOpen}} onPress={onGuidePress}/>
      </View>
      {!infoAtRight || stacked ? expandButton : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  dockCorner: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 28,
  },
  dockInline: {
    position: 'relative',
    minHeight: 28,
  },
  dockInfoOnly: {
    width: Platform.OS==='web'?48:28,
  },
  dockWithExpand: {
    minWidth: 68,
  },
  cornerSocket: {
    width: Platform.OS==='web'?48:28,
    height: Platform.OS==='web'?48:28,
    alignSelf: 'flex-start',
    overflow: 'visible',
  },
  expandButton: {
    borderWidth: 0,
    backgroundColor: '#E8F1FF',
    shadowColor: '#2563EB',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
