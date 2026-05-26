//@ts-check
const { execSync, spawn } = require('child_process');
const { existsSync, readFileSync } = require('fs');

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(typeof error?.status === 'number' ? error.status : 1);
});

async function main() {
  if (!existsSync('package.json')) {
    console.log(
      'Unable to determine which e2e test runner being used. Missing root level package.json file',
    );
    return;
  }

  const json = JSON.parse(readFileSync('package.json').toString());

  const hasPlaywright =
    (json.dependencies || {}).hasOwnProperty('@playwright/test') ||
    (json.devDependencies || {}).hasOwnProperty('@playwright/test');

  const hasCypress =
    (json.dependencies || {}).hasOwnProperty('cypress') ||
    (json.devDependencies || {}).hasOwnProperty('cypress');

  if (hasPlaywright) {
    console.log('Installing browsers required by Playwright');
    await runWithRetries(`${getPackageManagerCommand()} playwright install`);
  }

  if (hasCypress) {
    console.log('Installing browsers required by Cypress');
    await runWithRetries(`${getPackageManagerCommand()} cypress install`);
  }
  console.log('Done');
}

const PER_ATTEMPT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * @param {string} command
 */
async function runWithRetries(command) {
  const maxRetries = Number(process.env.NX_CLOUD_INPUT_max_retries) || 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      await runOnce(command);
      return;
    } catch (e) {
      retryCount++;

      if (retryCount >= maxRetries) {
        throw e;
      }

      const aptRecovered = tryInstallMissingDeps(e?.stderr || '');

      if (aptRecovered) {
        console.log('Re-attempting install...');
        continue;
      }

      const delay = Math.max(
        3_000,
        Math.pow(2, retryCount) * Math.random() * 1_250,
      );
      console.log(
        `Installing browsers failed. Retrying install in ${(
          delay / 1000
        ).toFixed(0)} seconds...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * @param {string} command
 * @returns {Promise<void>}
 */
function runOnce(command) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(command, {
      shell: true,
      stdio: ['inherit', 'inherit', 'pipe'],
      timeout: PER_ATTEMPT_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('error', (err) => {
      reject(Object.assign(err, { stderr }));
    });
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const err = new Error(
        signal
          ? `Command killed by ${signal}: ${command}`
          : `Command failed with exit code ${code}: ${command}`,
      );
      reject(Object.assign(err, { status: code, signal, stderr }));
    });
  });
}

/**
 * @param {string} stderrText
 * @returns {boolean}
 */
function tryInstallMissingDeps(stderrText) {
  if (!stderrText.includes('apt-get install')) return false;
  const [installCommand] =
    stderrText.match(/apt-get install (\b\w+\b )+/gi) || [];
  if (!installCommand) return false;

  console.log(
    '\nDetected missing system dependencies. Attempting manual install...',
  );
  try {
    execSync(`sudo ${installCommand.trim()} -y`, { stdio: 'inherit' });
    return true;
  } catch {
    console.error('Failed to install system dependencies for the browser.');
    console.log(
      'You can create a custom launch template and add a step to manually install the missing dependencies in order to get around this error.',
    );
    console.log('See docs here: https://nx.dev/ci/reference/launch-templates');
    return false;
  }
}

function getPackageManagerCommand() {
  if (existsSync('package-lock.json')) {
    return 'npx';
  } else if (existsSync('yarn.lock')) {
    return 'yarn';
  } else if (existsSync('pnpm-lock.yaml') || existsSync('pnpm-lock.yml')) {
    return 'pnpm exec';
  }
}
