const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const source = fs.readFileSync('components/ui/haptic-touchable.tsx', 'utf8');
const compiled = babel.transformSync(source, {
  filename: 'haptic-touchable.tsx', configFile: false, babelrc: false,
  presets: ['@babel/preset-typescript', '@babel/preset-react'],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;

function mount(platform, props) {
  let feedback = 0;
  const react = {
    createContext: () => ({}), useContext: () => false,
    useRef: (current) => ({ current }), useCallback: (fn) => fn,
    useMemo: (fn) => fn(), useEffect: () => {},
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const gesture = { handlers: {} };
  for (const name of ['enabled', 'maxDistance', 'maxDuration', 'shouldCancelWhenOutside', 'cancelsTouchesInView', 'runOnJS']) {
    gesture[name] = (value) => { gesture[name + 'Value'] = value; return gesture; };
  }
  for (const name of ['onBegin', 'onEnd', 'onFinalize']) {
    gesture[name] = (fn) => { gesture.handlers[name] = fn; return gesture; };
  }
  const modules = {
    react,
    'react-native': { Platform: { OS: platform }, TouchableOpacity: 'Touchable' },
    'react-native-gesture-handler': { Gesture: { Tap: () => gesture }, GestureDetector: 'Detector' },
    'react-native-reanimated': {
      createAnimatedComponent: () => 'AnimatedTouchable',
      useSharedValue: (value) => ({ value }), useAnimatedStyle: (fn) => fn(),
      withTiming: (value) => value, Easing: { out: (v) => v },
    },
    '../../src/lib/haptics': { haptic: { light: () => { feedback++; return Promise.resolve(); } } },
    '../../src/lib/stationary-tap': {},
  };
  const sandbox = { exports: {}, require: (name) => {
    assert.ok(modules[name], `Unexpected dependency ${name}`); return modules[name];
  }, requestAnimationFrame: (fn) => fn() };
  vm.runInNewContext(compiled, sandbox);
  return { tree: sandbox.exports.HapticTouchable(props), gesture, feedback: () => feedback };
}
let calls = 0;
const ios = mount('ios', { onPress: () => { calls++; } });
assert.equal(ios.tree.type, 'Detector');
ios.gesture.handlers.onBegin();
ios.gesture.handlers.onEnd({}, true);
ios.gesture.handlers.onFinalize({}, true);
ios.tree.children[0].props.onPress({}); // Native responder must not fire again.
assert.equal(calls, 1);
assert.equal(ios.feedback(), 1);
ios.gesture.handlers.onEnd({}, false);
ios.gesture.handlers.onFinalize({}, false);
assert.equal(calls, 1, 'Cancelled drag must not activate the button.');

for (const platform of ['android', 'web']) {
  const button = mount(platform, { onPress: () => {} });
  assert.equal(button.tree.type, 'AnimatedTouchable', `${platform} must keep its existing responder.`);
}
for (const props of [
  { onPress: (event) => event }, { onPress: () => {}, onLongPress: () => {} },
  { onPress: () => {}, onTouchMove: () => {} },
  { onPress: () => {}, onTouchStart: () => {} },
]) assert.equal(mount('ios', props).tree.type, 'AnimatedTouchable', 'Custom gestures must stay unchanged.');
const disabled = mount('ios', { onPress: () => { calls++; }, disabled: true });
assert.equal(disabled.gesture.enabledValue, false);
disabled.gesture.handlers.onEnd({}, true);
assert.equal(calls, 1);
const expand = mount('ios', { onPress: () => {}, onPressIn: () => {}, onPressOut: () => {}, onTouchCancel: () => {} });
assert.equal(expand.tree.type, 'Detector', 'Simple expansion controls must use light taps.');
console.log('iPhone simple buttons: tap, feedback, deduplication, cancellation and platform isolation OK');
