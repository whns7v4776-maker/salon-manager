const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
let states = [], cursor = 0, effects = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
  useRef: value => ({ current: value }), useEffect: callback => effects.push(callback),
};
const gesture = () => new Proxy({}, { get: () => () => gesture() });
const image = 'Image';
const modules = {
  react,
  'react-native': { Image: image, Modal: 'Modal', View: 'View', Text: 'Text', ActivityIndicator: 'Spinner', Platform: { OS: 'ios' } },
  'react-native-gesture-handler': { Gesture: { Pinch: gesture, Pan: gesture, Simultaneous: () => ({}) }, GestureDetector: 'GestureDetector', GestureHandlerRootView: 'Root' },
  'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, useSharedValue: value => ({ value }), useAnimatedStyle: fn => fn() },
  'expo-image-picker': {}, 'expo-modules-core': {}, '../src/lib/supabase': {}, './ui/haptic-touchable': { HapticTouchable: 'Button' },
};
const source = fs.readFileSync('components/communication-poster.tsx', 'utf8') + '\nexport { PosterViewer };';
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText, { exports: exportsForTest, require: name => { assert.ok(modules[name], name); return modules[name]; } });
let closed = 0;
const props = { uri: 'https://example.test/poster.jpg', ratio: 0.75, onClose: () => closed++ };
const render = () => { cursor = 0; effects = []; return exportsForTest.PosterViewer(props); };
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flat(Infinity).flatMap(nodes)] : [];
const find = (tree, type) => nodes(tree).find(n => n.type === type);
let tree = render();
assert.equal(find(tree, image), undefined, 'must not decode the full-screen image at a placeholder size');
let viewport = nodes(tree).find(n => n.props.onLayout);
viewport.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 } } });
tree = render();
let fullImage = find(tree, image);
assert.equal(fullImage.props.style.width, 390);
assert.equal(fullImage.props.style.height, 520);
const firstKey = fullImage.props.key;
fullImage.props.onLoad();
tree = render();
assert.equal(find(tree, 'Spinner'), undefined);
fullImage.props.onError();
tree = render();
const retry = nodes(tree).find(n => n.props.accessibilityLabel === 'Riprova a caricare la locandina');
assert.ok(retry, 'failed loads must remain recoverable');
retry.props.onPress();
tree = render();
assert.notEqual(find(tree, image).props.key, firstKey, 'retry must create a fresh native image');
assert.ok(find(tree, 'Spinner'));
viewport = nodes(tree).find(n => n.props.onLayout);
viewport.props.onLayout({ nativeEvent: { layout: { width: 700, height: 390 } } });
tree = render();
assert.equal(find(tree, image).props.style.width, 292.5);
assert.notEqual(find(tree, image).props.key, firstKey, 'rotation must decode at the new dimensions');
nodes(tree).find(n => n.props.accessibilityLabel === 'Chiudi locandina').props.onPress();
assert.equal(closed, 1);
console.log('PASS: no 1px initial decode, measured image, load/error/retry, rotation and close.');
