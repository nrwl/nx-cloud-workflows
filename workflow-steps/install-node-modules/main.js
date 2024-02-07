const { execSync } = require('child_process');
const { existsSync } = require('fs');

if (existsSync('package-lock.json')) {
  console.log('Using npm');
  execSync('npm ci --legacy-peer-deps', { stdio: 'inherit' });
  patchJest();
} else if (existsSync('yarn.lock')) {
  console.log('Using yarn');
  execSync('yarn install --frozen-lockfile', { stdio: 'inherit' });
  patchJest();
} else if (existsSync('pnpm-lock.yaml') || existsSync('pnpm-lock.yml')) {
  // base image has to install pnpm
  console.log('Using pnpm');
  execSync('pnpm install --frozen-lockfile', { stdio: 'inherit' });
  patchJest();
}

function patchJest() {
  try {
    const path =
      'node_modules/jest-config/build/readConfigFileAndSetRootDir.js';
    const contents = readFileSync(path, 'utf-8');
    writeFileSync(
      path,
      contents.replace(
        "const tsNode = await import('ts-node');",
        "require('ts-node'); const tsNode = await import('ts-node');",
      ),
    );
  } catch (e) {
    console.log('no need to patch jest');
  }
}
