const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

// Allow using inputs or env until we fully switch to inputs
const nodeVersionInput =
  process.env.NX_CLOUD_INPUT_node_version || process.env.NODE_VERSION;

// set defaults incase they are not set yet
process.env.NVM_DIR ??= '/home/workflows/.nvm';
process.env.COREPACK_ENABLE_AUTO_PIN ??= 0;

const maybeVoltaNodeVersion = getVoltaNodeVersion();

if (nodeVersionInput) {
  runNvmInstall(nodeVersionInput);
} else if (isUsingNvm()) {
  // nvm will auto detect version in .nvmrc, no need to pass version
  runNvmInstall(null);
} else if (maybeVoltaNodeVersion) {
  runNvmInstall(maybeVoltaNodeVersion);
} else {
  console.warn(
    `No node version specified. You can use the step inputs to define a node version.`,
  );
  console.log(
    `Falling back to the default node version in the base image. ${execSync(
      'node -v',
    )}`,
  );
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

function runNvmInstall(version) {
  try {
    // enable nvm and then run the install command
    // nvm command isn't available since nx agents don't run the bash profile
    const installNodeWithNvm = `. $NVM_DIR/nvm.sh && nvm install ${
      version || ''
    } --default`;
    const reenableCorePack = `corepack enable`;
    // install outside of the current directory,
    // otherwise corepack errors if a different package mangager is used than is defined in the workspace
    const reinstallPackageManagers = `cd .. && corepack prepare yarn@1 && corepack prepare pnpm@8`;
    const printVersions = ['node', 'npm', 'yarn', 'pnpm']
      .map((cmd) => `echo "${cmd}: $(${cmd} -v)"`)
      .join(' && ');

    // path will be updated via nvm to include the new node versions,
    const saveEnvVars = `echo "PATH=$PATH\nNVM_DIR=${process.env.NVM_DIR}\nCOREPACK_ENABLE_AUTO_PIN=0" >> $NX_CLOUD_ENV`;

    execSync(
      [
        installNodeWithNvm,
        reenableCorePack,
        reinstallPackageManagers,
        printVersions,
        saveEnvVars,
      ].join(' && '),
      {
        stdio: 'inherit',
      },
    );
  } catch (e) {
    console.error(e);
    throw new Error(
      `Failed to install node version using nvm ${version || ''}`,
    );
  }
}
