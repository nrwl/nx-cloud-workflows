const { execSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');

const command = getInstallCommand();

if (command) {
  console.log(`Installing dependencies using ${command.split(' ')[0]}`);
  console.log(`  Running command: ${command}\n`);
  execSync(command, { stdio: 'inherit' });
  patchJest();
} else {
  throw new Error(
    'Could not find lock file. Please ensure you have a lock file before running this command.',
  );
}

function getInstallCommand() {
  if (existsSync('package-lock.json')) {
    const legacyInstallInput =
      process.env.NX_CLOUD_INPUT_npm_legacy_install ||
      // allow controlling via env var form main agent so people don't need to make a custom launch template just for 1 input
      process.env.NX_CLOUD_NPM_LEGACY_INSTALL;

    if (
      legacyInstallInput !== undefined &&
      (legacyInstallInput === 'false' || legacyInstallInput === false)
    ) {
      return 'npm ci';
    } else {
      console.log(
        "Installing with --legacy-peer-deps for compatiblity, set the npm_legacy_install step input or NX_CLOUD_NPM_LEGACY_INSTALL env var to 'false' to disable.",
      );
      return 'npm ci --legacy-peer-deps';
    }
  } else if (existsSync('yarn.lock')) {
    const [major] = execSync(`yarn --version`, {
      encoding: 'utf-8',
    })
      .trim()
      .split('.');

    const useBerry = +major >= 2;
    if (useBerry) {
      return 'yarn install --immutable';
    } else {
      return 'yarn install --frozen-lockfile';
    }
  } else if (existsSync('pnpm-lock.yaml') || existsSync('pnpm-lock.yml')) {
    return 'pnpm install --frozen-lockfile';
  }
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
