const { execSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');

if (existsSync('package-lock.json')) {
  console.log('Using npm');
  execSync('npm ci --legacy-peer-deps', { stdio: 'inherit' });
  patchJest();
} else if (existsSync('yarn.lock')) {
  console.log('Using yarn');
  const [major] = execSync(`yarn --version`, {
    encoding: 'utf-8',
  })
    .trim()
    .split('.');

  const useBerry = +major >= 2;
  if (useBerry) {
    execSync('yarn install --immutable', { stdio: 'inherit' });
  } else {
    execSync('yarn install --frozen-lockfile', { stdio: 'inherit' });
  }
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
    if (process.env.NX_VERBOSE_LOGGING == 'true') {
      console.log(e);
    }
    console.log('no need to patch jest');
  }
}
