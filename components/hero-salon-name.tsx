import { Image, Platform, StyleSheet, View } from 'react-native';
import { SalonNameDisplayStyle, SalonNameFontVariant } from '../src/lib/platform';

const salonHeroImage = require('../assets/hero-salon-transparent.png');

type HeroSalonNameProps = {
  salonName: string;
  displayStyle?: SalonNameDisplayStyle;
  fontVariant?: SalonNameFontVariant;
};

export function HeroSalonName({
  salonName: _salonName,
  displayStyle: _displayStyle = 'corsivo',
  fontVariant: _fontVariant = 'neon',
}: HeroSalonNameProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.screenBrandChip, Platform.OS === 'web' && styles.screenBrandChipWeb]}>
        <Image
          source={salonHeroImage}
          style={[styles.screenBrandFrameImage, Platform.OS === 'web' && styles.screenBrandFrameImageWeb]}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: -14,
    marginBottom: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenBrandChip: {
    width: '84%',
    maxWidth: 760,
    aspectRatio: 1.769,
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  screenBrandChipWeb: {
    width: '50%',
    maxWidth: 400,
  },
  screenBrandFrameImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 0.96 }],
  },
  screenBrandFrameImageWeb: {
    transform: [{ scale: 0.9 }],
  },
});
