/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const hapticTouchableSource = read('components/ui/haptic-touchable.tsx');
const webImmediateTouchableSource = read(
  'components/ui/web-immediate-touchable-opacity.tsx',
);
const webGlobalCssSource = read('app/global.css');
const landingSource = read('app/index.tsx');
const emailOtpSource = read('components/email-otp-modal.tsx');
const ownerTabsLayoutSource = read('app/(tabs)/_layout.tsx');
const agendaSource = read('app/(tabs)/agenda.tsx');
const resetPasswordSource = read('app/reset-password.tsx');
const numberPickerSource = read('components/ui/number-picker-modal.tsx');
const servicesSource = read('app/(tabs)/servizi.tsx');
const adminGlobalCssSource = read('admin-dashboard/app/globals.css');
const adminInstagramPageSource = read('admin-dashboard/app/instagram/page.tsx');

const checks = [];
const failures = [];

const verify = (label, callback) => {
  try {
    callback();
    checks.push(label);
  } catch (error) {
    failures.push({
      label,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

const countMatches = (source, pattern) => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...source.matchAll(new RegExp(pattern.source, flags))].length;
};

const findMatchingDelimiter = (source, openingIndex, opening, closing) => {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
};

const extractArrowPropBody = (source, propName) => {
  const marker = new RegExp(
    `${propName}\\s*=\\s*\\{\\s*\\(\\s*event\\s*\\)\\s*=>\\s*\\{`,
  );
  const match = marker.exec(source);
  assert.ok(match, `Non trovo il callback ${propName}.`);
  const openingIndex = source.indexOf('{', match.index + match[0].indexOf('=>'));
  const closingIndex = findMatchingDelimiter(source, openingIndex, '{', '}');
  assert.notEqual(closingIndex, -1, `Il callback ${propName} non e bilanciato.`);
  return source.slice(openingIndex + 1, closingIndex);
};

const extractContainingOpeningTag = (source, token, tagName) => {
  const tokenIndex = source.indexOf(token);
  assert.notEqual(tokenIndex, -1, `Non trovo il controllo ${token}.`);
  const startIndex = source.lastIndexOf(`<${tagName}`, tokenIndex);
  const endIndex = source.indexOf('>', tokenIndex);
  assert.ok(
    startIndex >= 0 && endIndex > tokenIndex,
    `Non riesco a isolare il tag ${tagName} per ${token}.`,
  );
  return source.slice(startIndex, endIndex + 1);
};

const extractCallBodies = (source, functionName) => {
  const bodies = [];
  const marker = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
  let match;
  while ((match = marker.exec(source)) !== null) {
    const openingIndex = source.indexOf('(', match.index);
    const closingIndex = findMatchingDelimiter(source, openingIndex, '(', ')');
    assert.notEqual(
      closingIndex,
      -1,
      `La chiamata ${functionName} non e bilanciata.`,
    );
    bodies.push(source.slice(openingIndex + 1, closingIndex));
    marker.lastIndex = closingIndex + 1;
  }
  return bodies;
};

const assertStyleHasScale = (source, styleName, expectedScale = '0.985') => {
  assert.match(
    source,
    new RegExp(
      `${styleName}\\s*:\\s*\\{[\\s\\S]{0,320}?transform\\s*:\\s*\\[[\\s\\S]{0,120}?scale\\s*:\\s*${expectedScale.replace('.', '\\.')}\\b`,
    ),
    `${styleName} deve includere la scala ${expectedScale}.`,
  );
};

verify('HapticTouchable anima immediatamente press-in e press-out', () => {
  const pressInBody = extractArrowPropBody(hapticTouchableSource, 'onPressIn');
  const pressOutBody = extractArrowPropBody(hapticTouchableSource, 'onPressOut');

  assert.match(pressInBody, /scale\.value\s*=\s*withTiming\s*\(\s*pressScale\b/);
  assert.match(pressInBody, /opacity\.value\s*=\s*withTiming\s*\(\s*pressOpacity\b/);
  assert.doesNotMatch(
    pressInBody,
    /\bonPress\?\.\s*\(/,
    'Il contatto iniziale non deve eseguire la vera azione.',
  );
  assert.match(pressOutBody, /scale\.value\s*=\s*withTiming\s*\(\s*1\b/);
  assert.match(pressOutBody, /opacity\.value\s*=\s*withTiming\s*\(\s*1\b/);
});

verify('HapticTouchable mantiene onPress fuori da timer e frame differiti', () => {
  const pressBody = extractArrowPropBody(hapticTouchableSource, 'onPress');
  assert.ok(
    countMatches(pressBody, /\bonPress\?\.\s*\(\s*event\s*\)/) >= 1,
    'La callback funzionale deve restare sincrona nel gestore onPress.',
  );
  assert.doesNotMatch(pressBody, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(pressBody, /\bwithDelay\s*\(/);
  for (const scheduler of ['requestAnimationFrame', 'setTimeout', 'withDelay']) {
    for (const scheduledBody of extractCallBodies(pressBody, scheduler)) {
      assert.doesNotMatch(
        scheduledBody,
        /\bonPress\?\.\s*\(/,
        `onPress non deve essere eseguito dentro ${scheduler}.`,
      );
    }
  }
});

verify('WebImmediate espone il marker web senza cambiare la callback', () => {
  assert.match(
    webImmediateTouchableSource,
    /Platform\.OS\s*!==\s*['"]web['"][\s\S]{0,700}?<HapticTouchable[\s\S]{0,500}?pressScale\s*=\s*\{\s*0?\.985\s*\}[\s\S]{0,500}?hapticType\s*=\s*['"]none['"]/,
    'Il ramo native deve usare la stessa micro-pressione senza aggiungere haptic.',
  );
  assert.match(webImmediateTouchableSource, /pressInDuration\s*=\s*\{\s*45\s*\}/);
  assert.match(webImmediateTouchableSource, /pressOutDuration\s*=\s*\{\s*75\s*\}/);
  const webPressableTag = extractContainingOpeningTag(
    webImmediateTouchableSource,
    'data-salon-press-feedback',
    'WebPressable',
  );
  assert.match(
    webPressableTag,
    /data-salon-press-feedback\s*=\s*["']true["']/,
  );
  assert.match(webPressableTag, /onPress\s*=\s*\{\s*handlePress\s*\}/);
  assert.match(
    webImmediateTouchableSource,
    /pressed\s*&&\s*!disabled\s*\?[\s\S]{0,160}?opacity\s*:\s*activeOpacity/,
  );
  assert.doesNotMatch(
    extractArrowPropBody(
      webImmediateTouchableSource.replace(
        'onPress={handlePress}',
        'onPress={(event) => { handlePress(event); }}',
      ),
      'onPress',
    ),
    /\bsetTimeout\s*\(/,
  );
});

verify('CSS web anima i pulsanti attivi e rispetta disabled', () => {
  assert.match(webGlobalCssSource, /button\s*:\s*not\(\s*:disabled\s*\)\s*:\s*active/);
  assert.match(
    webGlobalCssSource,
    /data-salon-press-feedback\s*=\s*["']true["']\s*\]\s*:\s*not\(\s*\[\s*aria-disabled\s*=\s*["']true["']\s*\]\s*\)\s*:\s*active/,
  );
  assert.match(webGlobalCssSource, /scale\s*:\s*0?\.985\s*;/);
  assert.match(webGlobalCssSource, /transition-delay\s*:\s*0ms\s*;/);
});

verify('CSS web esclude in modo vincolante drag, resize e composizioni', () => {
  const technicalGuardStart = webGlobalCssSource.indexOf(
    'Le superfici tecniche non devono mai simulare un tap',
  );
  const technicalGuardEnd = webGlobalCssSource.indexOf(
    'button:disabled',
    technicalGuardStart,
  );
  assert.ok(
    technicalGuardStart >= 0 && technicalGuardEnd > technicalGuardStart,
    'Non trovo il blocco di esclusione delle gesture.',
  );
  const technicalGuard = webGlobalCssSource.slice(
    technicalGuardStart,
    technicalGuardEnd,
  );
  for (const protectedMarker of [
    "data-salon-cursor='grab'",
    "data-salon-cursor='resize-y'",
    "data-testid='salon-composition-grab'",
  ]) {
    assert.ok(
      technicalGuard.includes(protectedMarker),
      `Manca l'esclusione ${protectedMarker}.`,
    );
  }
  assert.match(technicalGuard, /scale\s*:\s*1\s*!important\s*;/);
  assert.match(technicalGuard, /filter\s*:\s*none\s*!important\s*;/);
});

verify('Landing cliente anima entrambi i selettori Accedi/Registrati', () => {
  assert.ok(
    countMatches(
      landingSource,
      /pressed\s*&&\s*styles\.clientModeSwitchButtonPressed/,
    ) >= 2,
  );
  assertStyleHasScale(landingSource, 'clientModeSwitchButtonPressed');
});

verify('Popup OTP anima entrambe le azioni secondarie', () => {
  assert.ok(
    countMatches(
      emailOtpSource,
      /pressed\s*&&\s*!busy\s*&&\s*styles\.secondaryButtonPressed/,
    ) >= 2,
  );
  assert.match(
    emailOtpSource,
    /secondaryButtonPressed\s*:\s*\{[\s\S]{0,220}?opacity\s*:\s*0?\.82\b/,
  );
  assertStyleHasScale(emailOtpSource, 'secondaryButtonPressed', '0.97');
});

verify('Banner live anima entrambe le superfici apribili', () => {
  assert.ok(
    countMatches(
      ownerTabsLayoutSource,
      /pressed\s*&&\s*styles\.liveRequestBannerPressAreaPressed/,
    ) >= 2,
  );
  assertStyleHasScale(ownerTabsLayoutSource, 'liveRequestBannerPressAreaPressed');
});

verify('Slot Agenda Android mostra il press senza indebolire il blocco scroll', () => {
  const slotStart = agendaSource.indexOf('function WeekPlannerSlotTouchable(');
  const slotEnd = agendaSource.indexOf(
    'function WeekDragTargetHighlight(',
    slotStart,
  );
  assert.ok(slotStart >= 0 && slotEnd > slotStart);
  const slotTouchableSource = agendaSource.slice(slotStart, slotEnd);
  assert.match(
    slotTouchableSource,
    /pressed\s*&&\s*!disabled\s*&&\s*WEEK_SLOT_PRESS_FEEDBACK_STYLE/,
  );
  assert.match(
    slotTouchableSource,
    /didTouchMove\(event\)\s*\|\|\s*shouldBlockPress\?\.\(\)/,
  );
  assert.match(
    agendaSource,
    /WEEK_SLOT_PRESS_FEEDBACK_STYLE\s*=\s*StyleSheet\.create\(\{[\s\S]{0,180}?active\s*:\s*\{[\s\S]{0,120}?scale\s*:\s*0?\.985\b/,
  );
});

verify('Reset password mantiene scala sui pulsanti primario e secondario', () => {
  assertStyleHasScale(resetPasswordSource, 'primaryButtonPressed');
  assertStyleHasScale(resetPasswordSource, 'secondaryButtonPressed');
});

verify('Picker numerico Android conferma visivamente la riga premuta', () => {
  assert.match(
    numberPickerSource,
    /pressed\s*&&\s*styles\.androidWheelItemPressed/,
  );
  assert.match(
    numberPickerSource,
    /androidWheelItemPressed\s*:\s*\{[\s\S]{0,160}?opacity\s*:\s*0?\.72\b/,
  );
});

verify('Picker Servizi anima prezzo e durata senza ritardarne onPress', () => {
  const pickerSectionStart = servicesSource.indexOf(
    'styles.androidEditPriceDurationFields',
  );
  assert.notEqual(
    pickerSectionStart,
    -1,
    'Non trovo la sezione Prezzo e durata del form Servizi.',
  );
  const pickerSection = servicesSource.slice(
    pickerSectionStart,
    pickerSectionStart + 4200,
  );
  for (const target of ['price', 'duration']) {
    const targetToken = `setServiceNumberPickerTarget('${target}')`;
    const targetIndex = pickerSection.indexOf(targetToken);
    assert.notEqual(targetIndex, -1, `Non trovo il picker ${target}.`);
    const controlStart = pickerSection.lastIndexOf(
      '<HapticTouchable',
      targetIndex,
    );
    assert.notEqual(controlStart, -1, `Non trovo il controllo ${target}.`);
    const controlSource = pickerSection.slice(controlStart, controlStart + 1000);
    assert.match(controlSource, /pressScale\s*=\s*\{\s*0?\.985\s*\}/);
    assert.match(controlSource, /pressOpacity\s*=\s*\{\s*0?\.9\s*\}/);
    assert.match(controlSource, /onPress\s*=\s*\{/);
  }
});

verify('Admin applica feedback globale senza backdrop o controlli disabilitati', () => {
  assert.match(adminGlobalCssSource, /Press feedback is visual-only/);
  assert.match(
    adminGlobalCssSource,
    /button\s*:\s*not\(\s*:disabled\s*\)\s*:\s*not\(\s*\.sidebar-backdrop\s*\)/,
  );
  for (const selector of [/a\s*\[\s*href\s*\]/, /summary\b/, /\.ig-toggle-card\b/, /\.ig-intents\s+label\b/]) {
    assert.match(adminGlobalCssSource, selector);
  }
  assert.match(
    adminGlobalCssSource,
    /transform\s*:\s*translateY\(\s*1px\s*\)\s*scale\(\s*0?\.98\s*\)/,
  );
  assert.match(adminGlobalCssSource, /transform\s+80ms\s+ease-out/);
});

verify('Admin conserva feedback .ig-button e reduced motion', () => {
  assert.match(
    adminGlobalCssSource,
    /\.ig-button\s*:\s*active\s*:\s*not\(\s*:disabled\s*\)\s*\{[\s\S]{0,260}?scale\(\s*0?\.98\s*\)/,
  );
  assert.match(
    adminGlobalCssSource,
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)[\s\S]*?:active\s*\{[\s\S]{0,180}?transform\s*:\s*none\s*!important/,
  );
});

verify('Fallback inline Instagram ha press feedback e reduced motion', () => {
  assert.match(
    adminInstagramPageSource,
    /#ig-style-guard-fallback\s*:\s*active\s*\{[\s\S]{0,220}?scale\(\s*\.?98\s*\)/,
  );
  assert.match(
    adminInstagramPageSource,
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)[\s\S]{0,360}?#ig-style-guard-fallback\s*:\s*active\s*\{[\s\S]{0,120}?transform\s*:\s*none/,
  );
  assert.match(
    adminInstagramPageSource,
    /<button[\s\S]{0,180}?id\s*=\s*["']ig-style-guard-fallback["']/,
  );
});

if (failures.length > 0) {
  console.error(`Press feedback contracts: ${failures.length} controllo/i falliti.`);
  failures.forEach(({ label, message }, index) => {
    console.error(`  ${index + 1}. ${label}`);
    console.error(`     ${message}`);
  });
  process.exitCode = 1;
} else {
  console.log(
    `Press feedback contracts OK: ${checks.length} controlli superati senza ritardi funzionali.`,
  );
}
