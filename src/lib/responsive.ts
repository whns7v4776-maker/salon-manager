import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1280,
};

export const useResponsiveLayout = () => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isLandscapeLike = width > height;
    const isDesktop = width >= BREAKPOINTS.desktop && isLandscapeLike;
    const isTablet = width >= BREAKPOINTS.tablet && isLandscapeLike;
    const horizontalPadding = isDesktop ? 32 : isTablet ? 24 : 20;
    const contentMaxWidth = isDesktop ? 1440 : isTablet ? 1120 : 720;
    const compactCardMaxWidth = isDesktop ? 700 : isTablet ? 560 : undefined;
    const timeGridColumns = isDesktop ? 6 : isTablet ? 5 : 4;

    return {
      width,
      height,
      isTablet,
      isDesktop,
      horizontalPadding,
      contentMaxWidth,
      compactCardMaxWidth,
      timeGridColumns,
    };
  }, [height, width]);
};
