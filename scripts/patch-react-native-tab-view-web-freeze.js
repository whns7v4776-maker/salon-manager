/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(
  __dirname,
  '..',
  'node_modules',
  'react-native-tab-view',
);
const packageJsonPath = path.join(packageRoot, 'package.json');
const supportedVersions = new Set(['4.3.0']);

if (!fs.existsSync(packageJsonPath)) {
  throw new Error(
    'react-native-tab-view non trovato: impossibile sospendere le scene web inattive.',
  );
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (!supportedVersions.has(packageJson.version)) {
  throw new Error(
    `react-native-tab-view@${packageJson.version}: versione non verificata per la sospensione web.`,
  );
}

const files = [
  {
    path: path.join(packageRoot, 'src', 'SceneView.tsx'),
    replacements: [
      [
        `import * as React from 'react';\nimport { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';`,
        `import * as React from 'react';\nimport { Freeze } from 'react-freeze';\nimport { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';`,
      ],
      [
        `        focused || layout.width ? children({ loading: isLoading }) : null\n      }`,
        `        focused || layout.width ? (\n          <Freeze freeze={Platform.OS === 'web' && !focused}>\n            {children({ loading: isLoading })}\n          </Freeze>\n        ) : null\n      }`,
      ],
    ],
  },
  {
    path: path.join(packageRoot, 'lib', 'module', 'SceneView.js'),
    replacements: [
      [
        `import * as React from 'react';\nimport { StyleSheet, View } from 'react-native';`,
        `import * as React from 'react';\nimport { Freeze } from 'react-freeze';\nimport { Platform, StyleSheet, View } from 'react-native';`,
      ],
      [
        `focused || layout.width ? children({\n      loading: isLoading\n    }) : null`,
        `focused || layout.width ? /*#__PURE__*/_jsx(Freeze, {\n      freeze: Platform.OS === 'web' && !focused,\n      children: children({\n        loading: isLoading\n      })\n    }) : null`,
      ],
    ],
  },
];

for (const file of files) {
  let contents = fs.readFileSync(file.path, 'utf8');
  let changed = false;

  for (const [before, after] of file.replacements) {
    if (contents.includes(after)) {
      continue;
    }
    if (!contents.includes(before)) {
      throw new Error(
        `${path.relative(packageRoot, file.path)}: struttura inattesa; patch web non applicata.`,
      );
    }
    contents = contents.replace(before, after);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file.path, contents);
  }
}

console.log(
  `react-native-tab-view@${packageJson.version}: scene web inattive sospese; adapter nativi invariati.`,
);
