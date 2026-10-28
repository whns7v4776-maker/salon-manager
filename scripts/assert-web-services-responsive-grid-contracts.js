/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "app", "(tabs)", "servizi.tsx"),
  "utf8",
);

const requirePattern = (pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

requirePattern(
  /const serviceGridAvailableWidth =[\s\S]{0,420}?serviceGridMeasuredWidth[\s\S]{0,520}?Math\.floor\(\(serviceGridAvailableWidth \+ 14\) \/ \(320 \+ 14\)\)/,
  "The web Services grid must derive 1-3 columns from its available width.",
);
requirePattern(
  /const serviceGridColumnCount =[\s\S]{0,420}?: 2;/,
  "Native Services must preserve its two-column contract.",
);
requirePattern(
  /const handleServiceGridLayout = useCallback\([\s\S]{0,560}?event\.nativeEvent\.layout\.width[\s\S]{0,420}?setServiceGridMeasuredWidth/,
  "The web Services grid must react to live container resizes.",
);
requirePattern(
  /onLayout=\{[\s\S]{0,180}?Platform\.OS === 'web'[\s\S]{0,180}?handleServiceGridLayout[\s\S]{0,160}?style=\{\[[\s\S]{0,160}?styles\.serviceGridRow/,
  "Only the web service-card row may feed the responsive measurement.",
);
requirePattern(
  /isWebCardActionsLayout \? \(\s*serviceCardInner\s*\) : \(/,
  "Web service cards must keep their direct non-swipe rendering branch.",
);
requirePattern(
  /<ReanimatedSwipeable/,
  "Native service cards must preserve their swipe actions.",
);

console.log("PASS web Services responsive 1-2-3 column contracts");
