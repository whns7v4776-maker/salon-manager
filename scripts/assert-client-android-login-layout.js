/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const clientScreen = fs.readFileSync(
  path.resolve(__dirname, '..', 'app', 'cliente-screen.tsx'),
  'utf8',
);
const appConfig = fs.readFileSync(
  path.resolve(__dirname, '..', 'app.config.js'),
  'utf8',
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  appConfig,
  /softwareKeyboardLayoutMode:\s*['"]resize['"]/,
  'Android must keep the native resize keyboard contract.',
);
requirePattern(
  clientScreen,
  /<KeyboardAvoidingView[\s\S]*?behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}[\s\S]*?enabled=\{Platform\.OS === 'ios'\}/,
  'The client screen must not apply a second Android keyboard height resize.',
);
requirePattern(
  clientScreen,
  /androidVisibleInput:\s*\{[\s\S]*?minHeight:\s*54[\s\S]*?flexShrink:\s*0[\s\S]*?textAlignVertical:\s*'center'/,
  'Android client login fields must keep a non-compressible minimum height.',
);

console.log('Client Android login layout contracts passed.');
