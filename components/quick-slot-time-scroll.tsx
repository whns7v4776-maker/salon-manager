import React, { forwardRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

export const QuickSlotTimeScroll = forwardRef<ScrollView, ScrollViewProps & { railWidth?: number; railLabel?: string; integrated?: boolean }>(
  function QuickSlotTimeScroll({ railWidth: _railWidth, railLabel: _railLabel, integrated: _integrated, ...props }, ref) {
    return <ScrollView {...props} ref={ref} />;
  },
);
