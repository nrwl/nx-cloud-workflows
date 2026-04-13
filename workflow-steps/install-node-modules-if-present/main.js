const { existsSync } = require('fs');

const lockFiles = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
];

if (lockFiles.some((f) => existsSync(f))) {
  require('../install-node-modules/main.js');
} else {
  console.log('No lock file detected. Skipping node_modules install.');
}
