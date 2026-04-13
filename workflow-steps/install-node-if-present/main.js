const { platform } = require('os');
const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

const jsMarkers = [
  'package.json',
  '.nvmrc',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
];

if (!jsMarkers.some((f) => existsSync(f))) {
  console.log(
    'No JS project detected (no package.json, .nvmrc, or lock file). Skipping Node install.',
  );
  return;
}

async function main() {
  if (platform === 'win32') {
    throw new Error('Windows is not supported with this reuseable step yet.');
  }

  const nodeVersionInput =
    process.env.NX_CLOUD_INPUT_node_version || process.env.NODE_VERSION;
  const maxRetries = process.env.NX_CLOUD_INPUT_max_retries || 3;

  process.env.NVM_DIR ??= '/home/workflows/.nvm';
  process.env.COREPACK_ENABLE_AUTO_PIN ??= 0;

  const maybeVoltaNodeVersion = getVoltaNodeVersion();

  if (nodeVersionInput) {
    await runNvmInstall(nodeVersionInput, maxRetries);
  } else if (isUsingNvm()) {
    await runNvmInstall(null, maxRetries);
  } else if (maybeVoltaNodeVersion) {
    await runNvmInstall(maybeVoltaNodeVersion, maxRetries);
  } else {
    console.warn(
      'No node version specified. You can use the step inputs to define a node version.',
    );
    console.log(
      `Falling back to the default node version in the base image. ${execSync(
        'node -v',
      )}`,
    );
  }
}

function getVoltaNodeVersion() {
  try {
    if (existsSync('package.json')) {
      const packageJsonContents =
        JSON.parse(readFileSync('package.json')) ?? {};
      return packageJsonContents['volta']?.['node'];
    }
  } catch (e) {
    return null;
  }
}

function isUsingNvm() {
  try {
    return existsSync('.nvmrc');
  } catch (e) {
    return false;
  }
}

async function runNvmInstall(version, maxRetries = 3) {
  const installNodeWithNvm = `. $NVM_DIR/nvm.sh && nvm install -b ${
    version || ''
  } --default`;
  const reenableCorePack = `npm install -g corepack@latest && corepack enable`;
  const reinstallPackageManagers = `cd .. && corepack prepare yarn@1 && corepack prepare pnpm@9`;
  const printVersions = ['node', 'npm', 'yarn', 'pnpm']
    .map((cmd) => `echo "${cmd}: $(${cmd} -v)"`)
    .join(' && ');
  const saveEnvVars = `echo "PATH=$PATH\nNVM_DIR=${process.env.NVM_DIR}\nCOREPACK_ENABLE_AUTO_PIN=0" >> $NX_CLOUD_ENV`;
  const run = () =>
    execSync(
      [
        installNodeWithNvm,
        reenableCorePack,
        reinstallPackageManagers,
        printVersions,
        saveEnvVars,
      ].join(' && '),
      { stdio: 'inherit' },
    );

  let retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      run();
      break;
    } catch (e) {
      retryCount++;
      if (retryCount >= maxRetries) {
        throw new Error(
          `Failed to install node version using nvm ${version || ''}`,
        );
      }
      const delay = Math.max(
        3_000,
        Math.pow(2, retryCount) * Math.random() * 1_250,
      );
      console.log(
        `Installing node failed. Retrying install in ${(delay / 1000).toFixed(
          0,
        )} seconds...`,
      );
      if (process.env.NX_VERBOSE_LOGGING === 'true') {
        console.warn(e);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

main();
