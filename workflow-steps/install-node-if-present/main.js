const { existsSync } = require('fs');

const jsMarkers = [
  'package.json',
  '.nvmrc',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
];

if (jsMarkers.some((f) => existsSync(f))) {
  require('../install-node/main.js');
} else {
  console.log(
    'No JS project detected (no package.json, .nvmrc, or lock file). Skipping Node install.',
  );
}
