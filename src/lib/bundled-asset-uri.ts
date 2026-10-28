import { Asset } from 'expo-asset';
import { Image, type ImageSourcePropType } from 'react-native';

type BundledAssetModule = Parameters<typeof Asset.fromModule>[0];

export const resolveBundledAssetUri = (source: BundledAssetModule): string => {
  if (typeof Image.resolveAssetSource === 'function') {
    const nativeSource = Image.resolveAssetSource(source as ImageSourcePropType);
    if (nativeSource?.uri) {
      return nativeSource.uri;
    }
  }

  const asset = Asset.fromModule(source);
  return asset.localUri || asset.uri;
};
