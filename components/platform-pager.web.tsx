import { View } from 'react-native';
import type NativePagerView from 'react-native-pager-view';

// The client renders this pager only on iOS and Android. Keep native codegen out of
// the web dependency graph; the existing web tab implementation stays active.
export default View as unknown as typeof NativePagerView;
