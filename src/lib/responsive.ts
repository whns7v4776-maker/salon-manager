import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useOwnerViewport } from '../context/OwnerViewportContext';

export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1280,
};

export const useResponsiveLayout = () => {
  const window = useWindowDimensions();
  const viewport = useOwnerViewport();
  const width = Platform.OS !== 'web' && viewport ? viewport.width : window.width;
  const height = window.height;
  const sidebar = Platform.OS !== 'web' && !!viewport?.sidebar;

  return useMemo(() => {
    const shortestSide = Math.min(width, height);
    const isLandscapeLike = width > height;
    const isDesktop = width >= BREAKPOINTS.desktop && isLandscapeLike;
    const isTablet = shortestSide >= BREAKPOINTS.tablet;
    const horizontalPadding = isDesktop ? 32 : isTablet ? 24 : 20;
    const contentMaxWidth =
      Platform.OS === 'web' ? (isDesktop ? 1440 : isTablet ? 1120 : 720) : undefined;
    const compactCardMaxWidth = isDesktop ? 700 : isTablet ? 560 : undefined;
    const timeGridColumns = isDesktop ? 6 : isTablet ? 5 : 4;

    return {
      width,
      height,
      sidebar,
      isTablet,
      isDesktop,
      horizontalPadding,
      contentMaxWidth,
      compactCardMaxWidth,
      timeGridColumns,
    };
  }, [height, width, sidebar]);
};
