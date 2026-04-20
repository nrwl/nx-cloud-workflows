// @ts-check
const { platform } = require('os');
const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

const PM_DEFAULTS = {
  pnpm: '10',
  yarn: '1',
  // use version that comes with node
  npm: '',
};

async function main() {
  if (platform() === 'win32') {
    throw new Error('Windows is not supported with this reuseable step yet.');
  } else {
    // Allow using inputs or env until we fully switch to inputs
    const nodeVersionInput =
      process.env.NX_CLOUD_INPUT_node_version || process.env.NODE_VERSION;
    // NaN is falsy
    const maxRetries = Number(process.env.NX_CLOUD_INPUT_max_retries) || 3;
    const packageManager = process.env.NX_CLOUD_INPUT_package_manager || 'all';
    const packageManagerVersion =
      process.env.NX_CLOUD_INPUT_package_manager_version;
    const corepackVersion =
      process.env.NX_CLOUD_INPUT_corepack_version || 'latest';

    // set defaults incase they are not set yet
    process.env.NVM_DIR ??= '/home/workflows/.nvm';
    process.env.COREPACK_ENABLE_AUTO_PIN ??= '0';

    const maybeVoltaNodeVersion = getVoltaNodeVersion();

    if (nodeVersionInput) {
      await runNvmInstall(
        nodeVersionInput,
        maxRetries,
        packageManager,
        packageManagerVersion,
        corepackVersion,
      );
    } else if (isUsingNvm()) {
      // nvm will auto detect version in .nvmrc, no need to pass version
      await runNvmInstall(
        null,
        maxRetries,
        packageManager,
        packageManagerVersion,
        corepackVersion,
      );
    } else if (maybeVoltaNodeVersion) {
      await runNvmInstall(
        maybeVoltaNodeVersion,
        maxRetries,
        packageManager,
        packageManagerVersion,
        corepackVersion,
      );
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
  }
}

function getVoltaNodeVersion() {
  try {
    if (existsSync('package.json')) {
      const packageJsonContents =
        JSON.parse(readFileSync('package.json', 'utf8')) ?? {};

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

/**
 * @param {string} corepackVersion
 * @param {'yarn' | 'npm' | 'pnpm' | 'all' | 'skip' | string} packageManager
 * @param {string | null} packageManagerVersion
 **/
function getPMCommands(corepackVersion, packageManager, packageManagerVersion) {
  const commands = [];
  if (corepackVersion === 'skip') {
    commands.push('echo "skipping corepack re-enable"');
  } else {
    commands.push(
      `npm install -g corepack@${corepackVersion} && corepack enable`,
    );
  }

  switch (packageManager) {
    case 'all':
      console.warn(
        "It is recommended to only install the package manager you use. To do this set the package_manager input to 'npm', 'yarn', or 'pnpm'.",
      );

      if (corepackVersion === 'skip') {
        console.error(
          'Unable to install all package managers when corepack re-enable is skipped.',
        );
        console.error(
          'Re-enable corepack by setting the corepack_version or set package_manager input to npm, yarn, pnpm.',
        );
        process.exit(1);
      }

      if (packageManagerVersion) {
        console.warn(
          'A package manager version was specified but will not be used since all package managers are to be installed. ',
        );
        console.warn('Defaults will be used instead:');
        const pmVersionDisplay = [
          `- pnpm: ${PM_DEFAULTS['pnpm']}`,
          `- yarn: ${PM_DEFAULTS['yarn']}`,
          `- npm: bundled with node`,
        ];
        console.warn(pmVersionDisplay.join('\n'));
      }
      commands.push(
        `cd .. && corepack prepare yarn@${PM_DEFAULTS['yarn']} && corepack prepare pnpm@${PM_DEFAULTS['pnpm']}`,
      );
      break;
    case 'npm':
      if (packageManagerVersion) {
        commands.push(`npm i -g npm@${packageManagerVersion}`);
      } else {
        commands.push(`echo "using bundled npm version from node"`);
      }
      break;
    case 'pnpm':
      // install outside of the current directory,
      // otherwise corepack errors if a different package manager is used than is defined in the workspace
      commands.push(
        `cd .. && corepack prepare pnpm@${packageManagerVersion || PM_DEFAULTS['pnpm']}`,
      );
      break;
    case 'yarn':
      commands.push(
        `cd .. && corepack prepare yarn@${packageManagerVersion || PM_DEFAULTS['yarn']}`,
      );
      break;
    case 'skip':
      commands.push('echo "skipping package manager reinstall"');
      break;
    default:
      console.error(
        `Unknown package manager option: ${packageManager} - unable to proceed with install.`,
      );
      process.exit(1);
  }

  return commands;
}

/**
 * @param {string | null} version
 * @param {number} maxRetries
 * @param {'yarn' | 'npm' | 'pnpm' | 'all' | 'skip' | string} packageManager
 * @param {string | null} packageManagerVersion
 * @param {string} corepackVersion - The version of corepack to install and enable.
 **/
async function runNvmInstall(
  version,
  maxRetries = 3,
  packageManager = 'all',
  packageManagerVersion = null,
  corepackVersion = 'latest',
) {
  const commands = [];
  // enable nvm and then run the install command with -b to only install pre-build binaries
  // nvm command isn't available since nx agents don't run the bash profile
  commands.push(
    `. $NVM_DIR/nvm.sh && nvm install -b ${version || ''} --default`,
  );

  commands.push(
    ...getPMCommands(corepackVersion, packageManager, packageManagerVersion),
  );

  // print node and selected pm version
  const versionsToPrint = ['node'];

  if (!['all', 'skip'].includes(packageManager)) {
    versionsToPrint.push(packageManager);
  }

  const printVersions = versionsToPrint
    .map((cmd) => `echo "${cmd}: $(${cmd} -v)"`)
    .join(' && ');
  commands.push(printVersions);
  // path will be updated via nvm to include the new node versions,
  commands.push(
    `echo "PATH=$PATH\nNVM_DIR=${process.env.NVM_DIR}\nCOREPACK_ENABLE_AUTO_PIN=0" >> $NX_CLOUD_ENV`,
  );
  const run = () =>
    execSync(commands.join(' && '), {
      stdio: 'inherit',
    });

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
